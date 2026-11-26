"""Consultation-scoped multilingual Q&A chat routes with STT gate, emergency & intent safety."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db, require_role
from app.core.exceptions import AppError
from app.models.auth import User
from app.models.clinical import AudioRecord, Conversation, ConversationMessage
from app.routes._helpers import (
    build_personalization_context,
    check_consultation_access,
    check_document_access,
    format_emergency_guidance,
    get_patient_profile_for_user,
    iso_or_none,
    utcnow,
)
from app.schemas.clinical import ChatSendRequest
from app.schemas.common import ok_envelope
from app.services.ai.base import normalize_language
from app.services.ai.chat_service import chat_service
from app.services.ai.explanation_service import DEFAULT_DISCLAIMER, _flatten_provenance_text
from app.services.safety import (
    check_instruction_integrity,
    classify_user_intent,
    detect_emergency,
    validate_provenance_and_guardrails,
)

router = APIRouter(prefix="/chat", tags=["chat"])


def _extract_citations_from_provenance(provenance: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(provenance, dict):
        return []
    citations: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in provenance.get("general_education") or []:
        if not isinstance(item, dict):
            continue
        item_cits = item.get("citations") or []
        if not item_cits and item.get("source_name") and item.get("source_url"):
            item_cits = [{"source_name": item["source_name"], "source_url": item["source_url"]}]
        for c in item_cits:
            url = str(c.get("source_url") or "")
            if url and url not in seen:
                seen.add(url)
                citations.append(
                    {
                        "source_name": c.get("source_name", ""),
                        "source_url": url,
                    }
                )
    return citations


def _serialize_message(
    msg: ConversationMessage,
    *,
    citations: list[dict[str, Any]] | None = None,
    emergency_guidance: dict[str, Any] | None = None,
    suggested_followups: list[str] | None = None,
    visual_artifact: dict[str, Any] | None = None,
    research_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_citations = (
        citations
        if citations is not None
        else _extract_citations_from_provenance(msg.provenance_blocks)
    )
    resolved_emerg = emergency_guidance
    if resolved_emerg is None and msg.emergency_flag_triggered:
        resolved_emerg = {
            "is_emergency": True,
            "severity": "emergency",
            "banner_title": "Urgent Medical Care Needed",
            "banner_message": msg.message_text,
            "helplines": [
                {"label": "National Emergency Helpline", "number": "112"},
                {"label": "Ambulance Services", "number": "108"},
            ],
        }
    resolved_visual = visual_artifact
    if resolved_visual is None and isinstance(msg.provenance_blocks, dict):
        resolved_visual = msg.provenance_blocks.get("visual_artifact")

    resolved_research = research_meta
    if resolved_research is None and isinstance(msg.provenance_blocks, dict):
        resolved_research = msg.provenance_blocks.get("research_meta")

    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_role": msg.sender_role,
        "input_modality": msg.input_modality,
        "message_text": msg.message_text,
        "language": msg.language,
        "stt_confidence": msg.stt_confidence,
        "stt_confirmed_by_user": msg.stt_confirmed_by_user,
        "provenance_blocks": msg.provenance_blocks,
        "context_refs": msg.context_refs or [],
        "citations": resolved_citations,
        "visual_artifact": resolved_visual,
        "research_meta": resolved_research,
        "emergency_flag_triggered": msg.emergency_flag_triggered,
        "emergency_guidance": resolved_emerg,
        "integrity_status": msg.integrity_status,
        "suggested_followups": suggested_followups or [],
        "created_at": iso_or_none(msg.created_at),
    }


def _serialize_conversation(conv: Conversation) -> dict[str, Any]:
    return {
        "id": conv.id,
        "title": conv.title,
        "consultation_id": conv.consultation_id,
        "document_id": conv.document_id,
        "primary_language": conv.primary_language,
        "status": conv.status,
        "updated_at": iso_or_none(conv.updated_at),
    }


@router.post("")
async def send_chat_message(
    payload: ChatSendRequest,
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Process a patient Q&A message scoped strictly to shared records & verified KB."""
    patient = await get_patient_profile_for_user(db, current_user)
    assert patient is not None

    conv: Conversation | None = None
    if payload.conversation_id:
        conv = (
            await db.execute(
                select(Conversation).where(
                    Conversation.id == payload.conversation_id,
                    Conversation.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not conv:
            raise AppError(404, "NOT_FOUND", "Conversation not found.")
        if conv.patient_id != patient.id:
            raise AppError(403, "RBAC_FORBIDDEN", "Cannot access another patient's conversation.")

    consult_id = payload.context_consultation_id or (conv.consultation_id if conv else None)
    doc_id = payload.context_document_id or (conv.document_id if conv else None)

    consult = (
        await check_consultation_access(
            db, current_user, consult_id, require_shared_for_patient=True
        )
        if consult_id
        else None
    )
    doc = (
        await check_document_access(db, current_user, doc_id)
        if doc_id
        else None
    )

    stt_conf: float | None = None
    if payload.source_audio_id:
        audio_rec = await db.get(AudioRecord, payload.source_audio_id)
        if not audio_rec or audio_rec.deleted_at is not None:
            raise AppError(404, "NOT_FOUND", "Referenced audio record not found.")
        if audio_rec.patient_id != patient.id:
            raise AppError(403, "RBAC_FORBIDDEN", "Cannot use another patient's audio record.")
        stt_conf = audio_rec.stt_confidence_score

    prefs = await build_personalization_context(
        db,
        patient_id=patient.id,
        override_language=payload.target_language,
        override_depth=payload.depth_override,
    )

    # Pre-check STT confirmation gate explicitly before running clinical Q&A
    if payload.input_modality == "voice" and not payload.stt_confirmed:
        gate_res = await chat_service.answer_patient_question(
            session=db,
            message_text=payload.message_text,
            prefs=prefs,
            consultation=consult,
            document=doc,
            input_modality="voice",
            stt_confirmed=False,
            target_language=payload.target_language,
        )
        return ok_envelope(
            {
                "requires_stt_confirmation": True,
                "transcript_to_confirm": gate_res.get("transcript_to_confirm", payload.message_text),
                "conversation_id": conv.id if conv else None,
                "assistant_message": {
                    "id": "pending_stt_confirm",
                    "conversation_id": conv.id if conv else "",
                    "sender_role": "assistant",
                    "input_modality": "voice",
                    "message_text": gate_res["provenance"]["ai_simplified"]["summary"],
                    "language": prefs.preferred_language,
                    "stt_confidence": stt_conf,
                    "stt_confirmed_by_user": False,
                    "provenance_blocks": gate_res["provenance"],
                    "context_refs": [],
                    "citations": [],
                    "emergency_flag_triggered": False,
                    "emergency_guidance": None,
                    "integrity_status": "passed",
                    "suggested_followups": [],
                    "created_at": utcnow().isoformat(),
                },
            }
        )

    # Load prior conversation history when continuing an existing thread
    history: list[dict[str, Any]] = []
    if conv:
        prior_rows = (
            await db.execute(
                select(ConversationMessage)
                .where(ConversationMessage.conversation_id == conv.id)
                .order_by(ConversationMessage.created_at.asc())
            )
        ).scalars().all()
        history = [
            {"sender_role": m.sender_role, "message_text": m.message_text}
            for m in prior_rows
        ]
    else:
        conv = Conversation(
            patient_id=patient.id,
            created_by_user_id=current_user.id,
            consultation_id=consult.id if consult else None,
            document_id=doc.id if doc else None,
            title=payload.message_text.strip()[:120] or "Health Question",
            primary_language=normalize_language(prefs.preferred_language),
            status="active",
        )
        db.add(conv)
        await db.flush()

    # Run deterministic emergency + intent safety scanners explicitly alongside chat_service
    emerg_check = detect_emergency(payload.message_text, context_mode="patient_query")
    intent_check = classify_user_intent(payload.message_text)

    res = await chat_service.answer_patient_question(
        session=db,
        message_text=payload.message_text,
        prefs=prefs,
        consultation=consult,
        document=doc,
        conversation_history=history,
        input_modality=payload.input_modality,
        stt_confirmed=payload.stt_confirmed,
        target_language=payload.target_language,
        research_mode=payload.research_mode,
        generate_visual=payload.generate_visual,
    )

    provenance = res["provenance"]
    assistant_summary = (
        (provenance.get("ai_simplified") or {}).get("summary")
        or "Please consult your doctor for clinical guidance."
    )

    is_emerg = bool(res.get("emergency_flag") or emerg_check.get("is_emergency"))
    emerg_guidance = (
        format_emergency_guidance(
            res.get("emergency_guidance") or emerg_check,
            language=prefs.preferred_language,
        )
        if is_emerg
        else None
    )

    integrity_status = (res.get("safety") or {}).get("integrity_status", "passed")
    if not is_emerg and consult and consult.original_doctor_input:
        integrity_res = check_instruction_integrity(
            source_text=consult.original_doctor_input,
            output_text=_flatten_provenance_text(provenance),
            structured_source=consult.structured_data,
            output_language=prefs.preferred_language,
        )
        integrity_status = integrity_res["status"]

    guardrail = validate_provenance_and_guardrails(
        {"provenance": provenance, "safety": {"disclaimer": DEFAULT_DISCLAIMER}}
    )
    if not guardrail.get("is_valid", True) and integrity_status == "passed":
        integrity_status = "warning"

    user_msg = ConversationMessage(
        conversation_id=conv.id,
        sender_role="patient",
        sender_user_id=current_user.id,
        input_modality=payload.input_modality,
        source_audio_id=payload.source_audio_id,
        message_text=payload.message_text.strip(),
        language=normalize_language(prefs.preferred_language),
        stt_confidence=stt_conf,
        stt_confirmed_by_user=payload.stt_confirmed,
        provenance_blocks=None,
        context_refs=[],
        emergency_flag_triggered=is_emerg,
        integrity_status="passed",
    )
    assistant_msg = ConversationMessage(
        conversation_id=conv.id,
        sender_role="assistant",
        sender_user_id=None,
        input_modality="text",
        source_audio_id=None,
        message_text=assistant_summary,
        language=normalize_language(prefs.preferred_language),
        stt_confidence=None,
        stt_confirmed_by_user=True,
        provenance_blocks=provenance,
        context_refs=res.get("context_refs") or [],
        emergency_flag_triggered=is_emerg,
        integrity_status=integrity_status,
    )
    conv.updated_at = utcnow()
    db.add_all([user_msg, assistant_msg])
    await db.commit()
    await db.refresh(assistant_msg)

    return ok_envelope(
        {
            "requires_stt_confirmation": False,
            "intent_classification": res.get("intent_classification") or intent_check,
            "conversation_id": conv.id,
            "user_message_id": user_msg.id,
            "assistant_message": _serialize_message(
                assistant_msg,
                citations=res.get("citations") or [],
                emergency_guidance=emerg_guidance,
                suggested_followups=res.get("suggested_followups") or [],
                visual_artifact=res.get("visual_artifact"),
                research_meta=res.get("research_meta"),
            ),
        }
    )


@router.get("/conversations")
async def list_conversations(
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List Q&A conversation threads strictly owned by this patient."""
    patient = await get_patient_profile_for_user(db, current_user)
    assert patient is not None
    rows = (
        await db.execute(
            select(Conversation)
            .where(
                Conversation.patient_id == patient.id,
                Conversation.deleted_at.is_(None),
            )
            .order_by(Conversation.updated_at.desc())
        )
    ).scalars().all()
    return ok_envelope([_serialize_conversation(c) for c in rows])


@router.get("/history")
async def get_chat_history(
    conversation_id: str | None = Query(default=None),
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch messages for a specific or latest conversation owned by this patient."""
    patient = await get_patient_profile_for_user(db, current_user)
    assert patient is not None

    convs = (
        await db.execute(
            select(Conversation)
            .where(
                Conversation.patient_id == patient.id,
                Conversation.deleted_at.is_(None),
            )
            .order_by(Conversation.updated_at.desc())
        )
    ).scalars().all()

    target_conv: Conversation | None = None
    if conversation_id:
        target_conv = await db.get(Conversation, conversation_id)
        if not target_conv or target_conv.deleted_at is not None:
            raise AppError(404, "NOT_FOUND", "Conversation not found.")
        if target_conv.patient_id != patient.id:
            raise AppError(403, "RBAC_FORBIDDEN", "Cannot read another patient's chat history.")
    elif convs:
        target_conv = convs[0]

    messages_out: list[dict[str, Any]] = []
    if target_conv:
        msg_rows = (
            await db.execute(
                select(ConversationMessage)
                .where(ConversationMessage.conversation_id == target_conv.id)
                .order_by(ConversationMessage.created_at.asc())
            )
        ).scalars().all()
        messages_out = [_serialize_message(m) for m in msg_rows]

    return ok_envelope(
        {
            "conversation_id": target_conv.id if target_conv else None,
            "conversations": [_serialize_conversation(c) for c in convs],
            "messages": messages_out,
        }
    )


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Soft-delete a conversation owned by this patient."""
    patient = await get_patient_profile_for_user(db, current_user)
    assert patient is not None

    conv = await db.get(Conversation, conversation_id)
    if not conv or conv.deleted_at is not None:
        raise AppError(404, "NOT_FOUND", "Conversation not found.")
    if conv.patient_id != patient.id:
        raise AppError(403, "RBAC_FORBIDDEN", "Cannot delete another patient's conversation.")

    conv.deleted_at = utcnow()
    await db.commit()
    return ok_envelope({"id": conv.id, "deleted_at": conv.deleted_at.isoformat()})
