"""Consultation audio, ephemeral voice query STT, and speed-adjustable TTS routes."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
import uuid
from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.deps import get_current_user, get_db, require_doctor_patient_link
from app.core.exceptions import AppError
from app.models.auth import DoctorPatientLink, User
from app.models.clinical import AudioRecord
from app.routes._helpers import (
    build_personalization_context,
    check_consultation_access,
    format_integrity_and_safety,
    get_doctor_profile_for_user,
    get_patient_profile_for_user,
    resolve_storage_path,
    serialize_audio_record,
    utcnow,
)
from app.schemas.clinical import (
    AudioSummarizeRequest,
    AudioTranscribeRequest,
    AudioTranscriptUpdateRequest,
    TtsRequest,
)
from app.schemas.common import ok_envelope
from app.services.ai.explanation_service import explanation_service
from app.services.media.audio_service import (
    delete_audio_blob,
    synthesize_speech_with_cues,
    transcribe_audio_bytes,
    validate_audio_upload,
)

router = APIRouter(tags=["audio"])

_VALID_AUDIO_PURPOSES = {"doctor_consultation", "patient_voice_query"}


def _parse_bool_form(raw: str | bool | None) -> bool:
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return False
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


async def _check_audio_access(
    db: AsyncSession,
    current_user: User,
    audio_id: str,
) -> AudioRecord:
    rec = (
        await db.execute(
            select(AudioRecord).where(
                AudioRecord.id == audio_id,
                AudioRecord.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not rec:
        raise AppError(404, "NOT_FOUND", "Audio record not found.")

    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user)
        if not profile or rec.patient_id != profile.id:
            raise AppError(403, "RBAC_FORBIDDEN", "You do not have access to this audio record.")
        return rec

    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None
    await require_doctor_patient_link(db, doctor.id, rec.patient_id)
    return rec


@router.post("/audio/upload", status_code=201)
async def upload_audio(
    file: UploadFile = File(...),
    audio_purpose: str = Form("doctor_consultation"),
    consent_recorded: str = Form("false"),
    consent_timestamp: str | None = Form(default=None),
    patient_id: str | None = Form(default=None),
    consultation_id: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upload audio only after explicit consent_recorded=true; store with 24h ephemeral TTL."""
    if not _parse_bool_form(consent_recorded):
        raise AppError(
            400,
            "AUDIO_CONSENT_REQUIRED",
            "Explicit patient consent (consent_recorded=true) is required before uploading audio.",
        )

    if audio_purpose not in _VALID_AUDIO_PURPOSES:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            f"audio_purpose must be one of {sorted(_VALID_AUDIO_PURPOSES)}.",
        )

    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user)
        assert profile is not None
        if patient_id and patient_id != profile.id:
            raise AppError(403, "RBAC_FORBIDDEN", "Cannot upload audio for another patient.")
        resolved_patient_id = profile.id
    else:
        doctor = await get_doctor_profile_for_user(db, current_user)
        assert doctor is not None
        if not patient_id:
            raise AppError(422, "VALIDATION_ERROR", "patient_id is required for doctor audio upload.")
        await require_doctor_patient_link(db, doctor.id, patient_id)
        resolved_patient_id = patient_id

    if consultation_id:
        consult = await check_consultation_access(
            db, current_user, consultation_id, require_shared_for_patient=False
        )
        if consult.patient_id != resolved_patient_id:
            raise AppError(403, "RBAC_FORBIDDEN", "Consultation belongs to a different patient.")

    file_bytes = await file.read()
    meta = validate_audio_upload(file_bytes, file.filename)

    settings = get_settings()
    audio_id = str(uuid.uuid4())
    rel_path = f"audio/{resolved_patient_id}/{audio_id}.{meta['extension']}"
    abs_path = (settings.storage_path / rel_path).resolve()
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(file_bytes)

    now = utcnow()
    parsed_consent_ts = now
    if consent_timestamp:
        try:
            parsed_consent_ts = datetime.fromisoformat(consent_timestamp.replace("Z", "+00:00"))
        except ValueError:
            parsed_consent_ts = now

    rec = AudioRecord(
        id=audio_id,
        patient_id=resolved_patient_id,
        consultation_id=consultation_id,
        uploaded_by_user_id=current_user.id,
        audio_purpose=audio_purpose,
        mime_type=meta["mime_type"],
        file_size_bytes=meta["file_size_bytes"],
        storage_path=rel_path,
        consent_recorded=True,
        consent_timestamp=parsed_consent_ts,
        processing_status="uploaded",
        retention_policy="ephemeral_24h",
        retention_expires_at=now + timedelta(hours=settings.AUDIO_DEFAULT_RETENTION_HOURS),
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return ok_envelope(serialize_audio_record(rec))


@router.post("/audio/transcribe")
async def transcribe_audio(
    payload: AudioTranscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Normalize uploaded audio via FFmpeg and transcribe to editable speaker-labeled segments."""
    rec = await _check_audio_access(db, current_user, payload.audio_id)
    if rec.purged_at is not None or not rec.storage_path:
        raise AppError(410, "NOT_FOUND", "Audio file has already been purged.")

    abs_path = resolve_storage_path(rec.storage_path)
    if not abs_path or not abs_path.exists():
        raise AppError(404, "NOT_FOUND", "Audio file missing from storage.")

    audio_bytes = abs_path.read_bytes()
    stt_res = await transcribe_audio_bytes(
        audio_bytes=audio_bytes,
        filename=abs_path.name,
        language_hint=payload.language_hint,
        diarize=(rec.audio_purpose == "doctor_consultation"),
        synthetic_demo_transcript=payload.synthetic_demo_transcript,
    )

    rec.duration_seconds = stt_res.get("duration_seconds")
    rec.stt_provider = stt_res.get("provider")
    rec.stt_language_detected = stt_res.get("detected_language")
    rec.stt_confidence_score = stt_res.get("confidence_score")
    rec.transcript_raw = stt_res.get("transcript_raw") or ""
    rec.tts_cues = stt_res.get("transcript_segments") or []
    rec.processing_status = "transcribed"
    await db.commit()
    await db.refresh(rec)
    return ok_envelope(serialize_audio_record(rec))


@router.get("/audio/{audio_id}")
async def get_audio_record(
    audio_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch an authorized AudioRecord and its editable transcript segments."""
    rec = await _check_audio_access(db, current_user, audio_id)
    return ok_envelope(serialize_audio_record(rec))


@router.patch("/audio/{audio_id}/transcript")
async def update_audio_transcript(
    audio_id: str,
    payload: AudioTranscriptUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Apply clinician/patient speaker reassignments and transcript text edits."""
    rec = await _check_audio_access(db, current_user, audio_id)
    segments: list[dict[str, Any]] = (
        [dict(s) for s in rec.tts_cues]
        if rec.audio_purpose != "tts_output" and isinstance(rec.tts_cues, list)
        else []
    )

    role_map = {
        str(item.get("segment_id")): str(item.get("speaker_role"))
        for item in (payload.speaker_reassignments or [])
        if item.get("segment_id") and item.get("speaker_role")
    }
    text_map = {
        str(item.get("segment_id")): str(item.get("text", ""))
        for item in (payload.text_edits or [])
        if item.get("segment_id") is not None
    }

    if "transcript_raw" in text_map and not segments:
        rec.transcript_raw = text_map["transcript_raw"]
    else:
        for seg in segments:
            sid = str(seg.get("segment_id", ""))
            if sid in role_map:
                seg["speaker_role"] = role_map[sid]
                seg["speaker_label"] = role_map[sid].capitalize()
            if sid in text_map:
                seg["text"] = text_map[sid]
        rec.tts_cues = segments
        if segments:
            rec.transcript_raw = "\n".join(
                str(s.get("text", "")).strip() for s in segments if str(s.get("text", "")).strip()
            )
        elif "transcript_raw" in text_map:
            rec.transcript_raw = text_map["transcript_raw"]

    if payload.speaker_map_verified:
        rec.processing_status = "confirmed"

    await db.commit()
    await db.refresh(rec)
    return ok_envelope(serialize_audio_record(rec))


@router.post("/audio/summarize")
async def summarize_audio(
    payload: AudioSummarizeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Summarize verified consultation transcript into structured summary + 4-way provenance."""
    rec = await _check_audio_access(db, current_user, payload.audio_id)

    consult = None
    target_consult_id = payload.consultation_id or rec.consultation_id
    if target_consult_id:
        consult = await check_consultation_access(
            db, current_user, target_consult_id, require_shared_for_patient=False
        )
        if consult.patient_id != rec.patient_id:
            raise AppError(403, "RBAC_FORBIDDEN", "Consultation belongs to a different patient.")

    segments: list[dict[str, Any]] = (
        list(rec.tts_cues)
        if rec.audio_purpose != "tts_output" and isinstance(rec.tts_cues, list)
        else []
    )
    raw_text = (rec.transcript_raw or "").strip()
    if not raw_text and not segments:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "No transcript text available to summarize. Transcribe or edit the transcript first.",
        )

    prefs = await build_personalization_context(
        db,
        patient_id=rec.patient_id,
        override_language=payload.target_language,
    )
    res = await explanation_service.summarize_consultation_audio(
        session=db,
        transcript_segments=segments,
        raw_transcript=raw_text,
        prefs=prefs,
        target_language=payload.target_language,
    )
    integrity, safety = format_integrity_and_safety(res["safety"])

    if consult:
        if not consult.structured_data:
            consult.structured_data = res["structured_summary"]
        consult.generated_explanation = res["provenance"]
        consult.integrity_status = safety["integrity_status"]
        consult.integrity_report = integrity
        consult.transcript_audio_id = rec.id
        if safety["integrity_status"] == "blocked":
            consult.approval_status = "safety_flagged"

    if payload.auto_purge_audio_after_summary:
        delete_audio_blob(rec.storage_path)
        rec.storage_path = None
        rec.purged_at = utcnow()
        rec.processing_status = "purged"

    await db.commit()
    return ok_envelope(
        {
            "audio_id": rec.id,
            "consultation_id": target_consult_id,
            "structured_summary": res["structured_summary"],
            "provenance": res["provenance"],
            "integrity": integrity,
            "safety": safety,
            "audio_purged": bool(rec.purged_at),
        }
    )


@router.delete("/audio/{audio_id}")
async def delete_audio(
    audio_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Immediately delete raw audio blob on disk and mark AudioRecord purged."""
    rec = await _check_audio_access(db, current_user, audio_id)
    delete_audio_blob(rec.storage_path)
    now = utcnow()
    rec.storage_path = None
    rec.purged_at = now
    rec.processing_status = "purged"
    rec.deleted_at = now
    await db.commit()
    return ok_envelope({"audio_id": rec.id, "deleted_at": now.isoformat()})


@router.post("/speech/stt")
async def speech_to_text_ephemeral(
    file: UploadFile = File(...),
    consent_recorded: str = Form("true"),
    language_hint: str | None = Form(default=None),
    synthetic_demo_transcript: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Transcribe a voice query and immediately purge any raw audio blob (confidence <0.78 -> confirm)."""
    if not _parse_bool_form(consent_recorded):
        raise AppError(
            400,
            "AUDIO_CONSENT_REQUIRED",
            "Explicit voice consent is required for speech transcription.",
        )

    file_bytes = await file.read()
    meta = validate_audio_upload(file_bytes, file.filename)

    settings = get_settings()
    temp_dir = (settings.storage_path / "tmp_stt").resolve()
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_blob = temp_dir / f"{uuid.uuid4()}.{meta['extension']}"
    try:
        temp_blob.write_bytes(file_bytes)
        stt_res = await transcribe_audio_bytes(
            audio_bytes=temp_blob.read_bytes(),
            filename=temp_blob.name,
            language_hint=language_hint,
            diarize=False,
            synthetic_demo_transcript=synthetic_demo_transcript,
        )
    finally:
        if temp_blob.exists():
            temp_blob.unlink()

    audio_id: str | None = None
    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user, required=False)
        if profile:
            now = utcnow()
            rec = AudioRecord(
                patient_id=profile.id,
                uploaded_by_user_id=current_user.id,
                audio_purpose="patient_voice_query",
                mime_type=meta["mime_type"],
                duration_seconds=stt_res.get("duration_seconds"),
                file_size_bytes=meta["file_size_bytes"],
                storage_path=None,
                consent_recorded=True,
                consent_timestamp=now,
                stt_provider=stt_res.get("provider"),
                stt_language_detected=stt_res.get("detected_language"),
                stt_confidence_score=stt_res.get("confidence_score"),
                transcript_raw=stt_res.get("transcript_raw") or "",
                processing_status="purged",
                retention_policy="delete_after_transcript",
                retention_expires_at=now,
                purged_at=now,
            )
            db.add(rec)
            await db.commit()
            audio_id = rec.id

    return ok_envelope(
        {
            "audio_id": audio_id,
            "transcript_text": stt_res.get("transcript_raw") or "",
            "detected_language": stt_res.get("detected_language") or (language_hint or "en"),
            "confidence_score": float(stt_res.get("confidence_score", 0.0)),
            "requires_confirmation": bool(stt_res.get("requires_confirmation", True)),
            "alternative_interpretations": [],
            "provider": stt_res.get("provider"),
        }
    )


@router.post("/speech/tts")
async def text_to_speech_route(
    payload: TtsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Synthesize speech or return browser speechSynthesis timing cues at 0.75x-1.25x speed."""
    tts_res = await synthesize_speech_with_cues(
        text=payload.text,
        language=payload.language,
        voice_preference=payload.voice_preference,
        audio_speed=payload.audio_speed,
    )

    audio_bytes: bytes | None = tts_res.get("audio_bytes")
    stream_url: str | None = None
    audio_id: str | None = None
    fallback_to_browser = bool(tts_res.get("use_browser_speech_synthesis", True))

    owner_patient_id: str | None = None
    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user, required=False)
        owner_patient_id = profile.id if profile else None
    else:
        doctor = await get_doctor_profile_for_user(db, current_user, required=False)
        if doctor:
            link = (
                await db.execute(
                    select(DoctorPatientLink).where(
                        DoctorPatientLink.doctor_id == doctor.id,
                        DoctorPatientLink.consent_status == "active",
                        DoctorPatientLink.revoked_at.is_(None),
                    )
                )
            ).scalars().first()
            owner_patient_id = link.patient_id if link else None

    if audio_bytes and owner_patient_id:
        settings = get_settings()
        tts_id = str(uuid.uuid4())
        rel_path = f"tts/{owner_patient_id}/{tts_id}.mp3"
        abs_path = (settings.storage_path / rel_path).resolve()
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(audio_bytes)

        now = utcnow()
        rec = AudioRecord(
            id=tts_id,
            patient_id=owner_patient_id,
            uploaded_by_user_id=current_user.id,
            audio_purpose="tts_output",
            mime_type=tts_res.get("mime_type") or "audio/mpeg",
            duration_seconds=tts_res.get("duration_seconds"),
            file_size_bytes=len(audio_bytes),
            storage_path=rel_path,
            consent_recorded=False,
            tts_cues=tts_res.get("sentence_cues") or [],
            processing_status="ready",
            retention_policy="tts_cache_7d",
            retention_expires_at=now + timedelta(days=7),
        )
        db.add(rec)
        await db.commit()
        audio_id = tts_id
        stream_url = f"/api/speech/tts/{tts_id}"
        fallback_to_browser = False

    return ok_envelope(
        {
            "audio_id": audio_id,
            "stream_url": stream_url,
            "duration_seconds": tts_res.get("duration_seconds", 0.0),
            "audio_speed": tts_res.get("audio_speed", 1.0),
            "language": tts_res.get("language", payload.language),
            "provider": tts_res.get("provider"),
            "fallback_to_browser": fallback_to_browser,
            "cues": tts_res.get("sentence_cues") or [],
        }
    )


@router.get("/speech/tts/{audio_id}")
async def stream_tts_audio(
    audio_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Stream synthesized TTS MP3/WAV bytes for authorized patient or linked doctor."""
    rec = await _check_audio_access(db, current_user, audio_id)
    if rec.audio_purpose != "tts_output" or rec.purged_at is not None or not rec.storage_path:
        raise AppError(404, "NOT_FOUND", "Synthesized audio stream not found.")
    abs_path = resolve_storage_path(rec.storage_path)
    if not abs_path or not abs_path.exists():
        raise AppError(404, "NOT_FOUND", "Synthesized audio file missing from storage.")

    return Response(
        content=abs_path.read_bytes(),
        media_type=rec.mime_type or "audio/mpeg",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=3600",
        },
    )
