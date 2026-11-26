"""Document validation, PyMuPDF rendering, RapidOCR/GCV/Azure OCR, and <0.75 verification gating."""

from __future__ import annotations

import asyncio
import base64
from functools import lru_cache
import io
import logging
import re
from pathlib import Path
from typing import Any
import httpx
from PIL import Image, ImageOps
import pymupdf
from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.core.security import sha256_hex

logger = logging.getLogger(__name__)

MAX_DOCUMENT_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_PDF_PAGES = 20
GENERAL_CONFIDENCE_THRESHOLD = 0.75
CRITICAL_CONFIDENCE_THRESHOLD = 0.85

_CRITICAL_TOKEN_RE = re.compile(
    r"(?:\b\d+(?:\.\d+)?\s*(?:mg/dL|mmol/L|mmHg|mg|mcg|mL|IU|g|%)?\b|"
    r"\b(?:Paracetamol|Amlodipine|Metformin|Azithromycin|Amoxicillin|Cefixime|BD|OD|TDS|QID|SOS|not|never|no)\b)",
    re.IGNORECASE,
)

_UNREADABLE_TOKEN_RE = re.compile(r"\[UNREADABLE\]|\?\?\?+|illegible", re.IGNORECASE)


def detect_document_mime(file_bytes: bytes) -> str | None:
    """Validate file type strictly from magic bytes (never trust filename extension alone)."""
    if len(file_bytes) >= 5 and file_bytes[:5] == b"%PDF-":
        return "application/pdf"
    if len(file_bytes) >= 8 and file_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(file_bytes) >= 3 and file_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(file_bytes) >= 12 and file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_document_upload(file_bytes: bytes, filename: str | None = None) -> dict[str, Any]:
    """Validate magic bytes, <=15 MB size, non-encrypted PDF, and <=20 page count."""
    if not file_bytes:
        raise AppError(422, "VALIDATION_ERROR", "Uploaded document is empty.")
    if len(file_bytes) > MAX_DOCUMENT_BYTES:
        raise AppError(
            413,
            "VALIDATION_ERROR",
            f"Document exceeds maximum allowed size of {MAX_DOCUMENT_BYTES // (1024 * 1024)} MB.",
        )

    mime_type = detect_document_mime(file_bytes)
    if not mime_type:
        raise AppError(
            415,
            "VALIDATION_ERROR",
            "Unsupported document format. Upload a valid PDF, PNG, JPG, or WEBP file.",
        )

    page_count = 1
    if mime_type == "application/pdf":
        try:
            with pymupdf.open(stream=file_bytes, filetype="pdf") as doc:
                if doc.needs_pass:
                    raise AppError(
                        422,
                        "OCR_PDF_ENCRYPTED",
                        "This PDF is password-protected. Please upload an unlocked copy.",
                    )
                page_count = doc.page_count
        except AppError:
            raise
        except Exception as exc:
            raise AppError(422, "VALIDATION_ERROR", f"Invalid or corrupted PDF: {exc}") from exc

        if page_count < 1 or page_count > MAX_PDF_PAGES:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                f"PDF must have between 1 and {MAX_PDF_PAGES} pages (found {page_count}).",
            )
    else:
        try:
            with Image.open(io.BytesIO(file_bytes)) as img:
                img.verify()
        except Exception as exc:
            raise AppError(422, "VALIDATION_ERROR", f"Invalid or corrupted image file: {exc}") from exc

    return {
        "mime_type": mime_type,
        "file_size_bytes": len(file_bytes),
        "page_count": page_count,
        "sha256_checksum": sha256_hex(file_bytes.hex()),
        "original_filename": Path(filename).name if filename else "document",
    }


def _strip_exif_and_normalize_image(image_bytes: bytes) -> tuple[bytes, int, int]:
    """Strip EXIF privacy metadata, auto-orient, and return sanitized PNG bytes + (width, height)."""
    with Image.open(io.BytesIO(image_bytes)) as raw_img:
        transposed = ImageOps.exif_transpose(raw_img)
        rgb = transposed.convert("RGB")
        width, height = rgb.size
        buf = io.BytesIO()
        rgb.save(buf, format="PNG")
        return buf.getvalue(), width, height


def render_document_page_png(
    source: bytes | str | Path,
    mime_type: str | None = None,
    page_num: int = 1,
    dpi: int = 150,
) -> bytes:
    """Render 1-indexed PDF page or sanitized image to PNG bytes for split-screen verification UI."""
    file_bytes = Path(source).read_bytes() if isinstance(source, (str, Path)) else source
    resolved_mime = mime_type or detect_document_mime(file_bytes)
    if not resolved_mime:
        raise AppError(415, "VALIDATION_ERROR", "Unable to render unsupported document format.")

    if page_num < 1:
        raise AppError(422, "VALIDATION_ERROR", "Page number must be >= 1.")

    if resolved_mime == "application/pdf":
        with pymupdf.open(stream=file_bytes, filetype="pdf") as doc:
            if doc.needs_pass:
                raise AppError(422, "OCR_PDF_ENCRYPTED", "Encrypted PDF cannot be rendered.")
            if page_num > doc.page_count:
                raise AppError(404, "NOT_FOUND", f"Requested page {page_num} exceeds page count ({doc.page_count}).")
            page = doc[page_num - 1]
            zoom = max(72, dpi) / 72.0
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
            return pix.tobytes("png")

    if page_num != 1:
        raise AppError(404, "NOT_FOUND", "Single image documents only have page 1.")
    png_bytes, _w, _h = _strip_exif_and_normalize_image(file_bytes)
    return png_bytes


@lru_cache(maxsize=1)
def _get_rapidocr_engine():
    from rapidocr import RapidOCR

    return RapidOCR()


async def _run_rapidocr_on_png(png_bytes: bytes, width: int, height: int) -> list[dict[str, Any]]:
    """Execute local pretrained RapidOCR ONNX engine in worker thread."""
    def _infer() -> list[dict[str, Any]]:
        engine = _get_rapidocr_engine()
        res = engine(png_bytes)
        txts = list(res.txts or ())
        scores = list(res.scores or ())
        boxes = res.boxes.tolist() if res.boxes is not None else []
        lines: list[dict[str, Any]] = []
        for idx, txt in enumerate(txts):
            conf = float(scores[idx]) if idx < len(scores) else 0.7
            box = boxes[idx] if idx < len(boxes) else None
            bbox_norm = [0.0, 0.0, 1.0, 1.0]
            if box and width > 0 and height > 0:
                xs = [pt[0] for pt in box]
                ys = [pt[1] for pt in box]
                bbox_norm = [
                    round(min(xs) / width, 4),
                    round(min(ys) / height, 4),
                    round(max(xs) / width, 4),
                    round(max(ys) / height, 4),
                ]
            lines.append({"text": str(txt), "confidence": round(conf, 4), "bbox_norm": bbox_norm})
        return lines

    return await asyncio.to_thread(_infer)


async def _run_gcv_ocr(
    png_bytes: bytes,
    width: int,
    height: int,
    settings: Settings,
) -> list[dict[str, Any]]:
    """Call Google Cloud Vision DOCUMENT_TEXT_DETECTION online in-memory endpoint."""
    endpoint = settings.GCV_ENDPOINT.rstrip("/")
    url = f"{endpoint}/v1/images:annotate"
    payload = {
        "requests": [
            {
                "image": {"content": base64.b64encode(png_bytes).decode("ascii")},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                "imageContext": {"languageHints": ["en", "hi"]},
            }
        ]
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            params={"key": settings.GOOGLE_CLOUD_VISION_API_KEY.strip()},
            json=payload,
        )
    if resp.status_code >= 400:
        raise AppError(503, "PROVIDER_UNAVAILABLE", f"Google Cloud Vision OCR error ({resp.status_code}).")
    data = resp.json()
    responses = data.get("responses", [{}])
    annotation = responses[0].get("fullTextAnnotation", {}) if responses else {}
    lines: list[dict[str, Any]] = []
    for page in annotation.get("pages", []):
        for block in page.get("blocks", []):
            for para in block.get("paragraphs", []):
                words_txt: list[str] = []
                confs: list[float] = []
                for word in para.get("words", []):
                    symbols = "".join(s.get("text", "") for s in word.get("symbols", []))
                    if symbols:
                        words_txt.append(symbols)
                        confs.append(float(word.get("confidence", 0.85)))
                if words_txt:
                    verts = para.get("boundingBox", {}).get("vertices", [])
                    bbox_norm = [0.0, 0.0, 1.0, 1.0]
                    if verts and width > 0 and height > 0:
                        xs = [v.get("x", 0) for v in verts]
                        ys = [v.get("y", 0) for v in verts]
                        bbox_norm = [
                            round(min(xs) / width, 4),
                            round(min(ys) / height, 4),
                            round(max(xs) / width, 4),
                            round(max(ys) / height, 4),
                        ]
                    avg_conf = sum(confs) / len(confs) if confs else 0.85
                    lines.append(
                        {"text": " ".join(words_txt), "confidence": round(avg_conf, 4), "bbox_norm": bbox_norm}
                    )
    return lines


def split_pdf_into_f0_chunks(pdf_bytes: bytes, max_pages_per_chunk: int = 2) -> list[bytes]:
    """Split multi-page PDFs into 2-page chunks so Azure Document Intelligence F0 does not drop pages 3+."""
    chunks: list[bytes] = []
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as src:
        total = src.page_count
        for start in range(0, total, max_pages_per_chunk):
            end = min(start + max_pages_per_chunk - 1, total - 1)
            chunk_doc = pymupdf.open()
            chunk_doc.insert_pdf(src, from_page=start, to_page=end)
            chunks.append(chunk_doc.tobytes())
            chunk_doc.close()
    return chunks


async def _run_azure_doc_intel_chunked(
    file_bytes: bytes,
    mime_type: str,
    settings: Settings,
) -> dict[int, list[dict[str, Any]]]:
    """Call Azure Document Intelligence prebuilt-read, chunking PDFs by 2 pages when F0 mode is true."""
    endpoint = settings.AZURE_DOC_INTEL_ENDPOINT.rstrip("/")
    key = settings.AZURE_DOC_INTEL_KEY.strip()
    url = f"{endpoint}/documentintelligence/documentModels/prebuilt-read:analyze"
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": mime_type,
    }

    payloads: list[tuple[int, bytes]] = []
    if mime_type == "application/pdf" and settings.AZURE_DOC_INTEL_F0_MODE:
        for idx, chunk in enumerate(split_pdf_into_f0_chunks(file_bytes, 2)):
            payloads.append((idx * 2 + 1, chunk))
    else:
        payloads.append((1, file_bytes))

    pages_out: dict[int, list[dict[str, Any]]] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for base_page_num, chunk_bytes in payloads:
            init_resp = await client.post(
                url,
                params={"api-version": "2024-11-30"},
                headers=headers,
                content=chunk_bytes,
            )
            if init_resp.status_code not in (200, 202):
                raise AppError(503, "PROVIDER_UNAVAILABLE", f"Azure Document Intelligence error ({init_resp.status_code}).")
            op_loc = init_resp.headers.get("operation-location")
            analyze_res = init_resp.json() if init_resp.status_code == 200 else {}
            if op_loc:
                for _ in range(15):
                    await asyncio.sleep(0.5)
                    poll = await client.get(op_loc, headers={"Ocp-Apim-Subscription-Key": key})
                    poll_json = poll.json()
                    if poll_json.get("status") == "succeeded":
                        analyze_res = poll_json.get("analyzeResult", {})
                        break
                    if poll_json.get("status") == "failed":
                        raise AppError(503, "PROVIDER_UNAVAILABLE", "Azure Document Intelligence job failed.")

            word_confs_by_page: dict[int, list[float]] = {}
            for page_obj in analyze_res.get("pages", []):
                rel_p = int(page_obj.get("pageNumber", 1))
                abs_p = base_page_num + rel_p - 1
                words = page_obj.get("words", [])
                word_confs_by_page[abs_p] = [float(w.get("confidence", 0.85)) for w in words]
                lines_list: list[dict[str, Any]] = []
                for line in page_obj.get("lines", []):
                    confs = word_confs_by_page.get(abs_p, [0.85])
                    avg_conf = sum(confs) / len(confs) if confs else 0.85
                    lines_list.append(
                        {
                            "text": line.get("content", ""),
                            "confidence": round(avg_conf, 4),
                            "bbox_norm": [0.0, 0.0, 1.0, 1.0],
                        }
                    )
                pages_out[abs_p] = lines_list
    return pages_out


def _extract_structured_medical_fields(
    raw_lines: list[dict[str, Any]],
    uncertain_spans: list[dict[str, Any]],
) -> dict[str, Any]:
    """Deterministically parse dates, diagnoses, medications, lab rows, and numbers without guessing."""
    full_text = "\n".join(line["text"] for line in raw_lines)
    date_match = re.search(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})\b", full_text)
    report_date = date_match.group(1) if date_match else None

    diagnoses: list[str] = []
    medications: list[dict[str, Any]] = []
    lab_rows: list[dict[str, Any]] = []
    numbers: list[dict[str, Any]] = []

    uncertain_line_texts = {u["text"] for u in uncertain_spans}

    for line in raw_lines:
        txt = line["text"].strip()
        conf = float(line.get("confidence", 0.9))
        if not txt:
            continue

        # Mask unreadable line fragments rather than guessing
        is_uncertain_line = (
            txt in uncertain_line_texts
            or conf < GENERAL_CONFIDENCE_THRESHOLD
            or bool(_UNREADABLE_TOKEN_RE.search(txt))
        )

        # Diagnosis line
        diag_m = re.match(r"^(?:Diagnosis|Diagnoses|Impression)\s*:\s*(.+)$", txt, re.IGNORECASE)
        if diag_m:
            diagnoses.append("[UNREADABLE]" if is_uncertain_line and _UNREADABLE_TOKEN_RE.search(txt) else diag_m.group(1).strip())

        # Lab test line e.g. "HbA1c: 6.8 % (Lab ref: ...)" or "Serum Creatinine: 1.0 mg/dL"
        lab_m = re.match(
            r"^([A-Za-z0-9\s\.\-\(\)]{2,48}?)\s*:\s*(\[UNREADABLE\]|\?\?\?|\d+(?:\.\d+)?)\s*(mg/dL|mmol/L|umol/L|g/dL|%|IU/L|mmHg|F|°F|C|°C)?(.*)$",
            txt,
            re.IGNORECASE,
        )
        if lab_m and not re.match(r"^(?:Patient|Date|Age|Diagnosis|Diagnoses|Rx|SYNTHETIC)", lab_m.group(1), re.IGNORECASE):
            test_name = lab_m.group(1).strip()
            raw_val = lab_m.group(2).strip()
            unit = (lab_m.group(3) or "").strip()
            ref_tail = lab_m.group(4).strip()
            val_uncertain = is_uncertain_line or conf < CRITICAL_CONFIDENCE_THRESHOLD or bool(_UNREADABLE_TOKEN_RE.search(raw_val))
            lab_rows.append(
                {
                    "test_name": test_name,
                    "value": "[UNREADABLE]" if val_uncertain and _UNREADABLE_TOKEN_RE.search(raw_val) else raw_val,
                    "unit": unit,
                    "reference_range": ref_tail,
                    "confidence": conf,
                    "needs_verification": val_uncertain,
                }
            )

        # Medication line e.g. "Paracetamol 500 mg ..."
        med_m = re.search(
            r"\b(Paracetamol|Amlodipine|Metformin|Azithromycin|Amoxicillin|Cefixime|Crocin|Dolo|Glycomet|Amlong)\b(.*)$",
            txt,
            re.IGNORECASE,
        )
        if med_m:
            tail = med_m.group(2).strip()
            dose_m = re.search(r"(\[UNREADABLE\]|\?\?\?|\d+(?:\.\d+)?)\s*(mg|mcg|mL|g|IU|tablets?)?", tail, re.IGNORECASE)
            med_uncertain = is_uncertain_line or conf < CRITICAL_CONFIDENCE_THRESHOLD
            medications.append(
                {
                    "name": med_m.group(1),
                    "dose": (
                        "[UNREADABLE]"
                        if med_uncertain and dose_m and _UNREADABLE_TOKEN_RE.search(dose_m.group(1))
                        else (dose_m.group(0).strip() if dose_m else "")
                    ),
                    "raw_line": txt,
                    "confidence": conf,
                    "needs_verification": med_uncertain,
                }
            )

        for num_m in re.finditer(r"(\d+(?:\.\d+)?)\s*(mg/dL|mmol/L|mmHg|mg|mcg|mL|IU|g|%|°?[FC])?", txt, re.IGNORECASE):
            numbers.append(
                {
                    "value": num_m.group(1),
                    "unit": (num_m.group(2) or "").strip(),
                    "confidence": conf,
                    "verified_threshold_met": conf >= CRITICAL_CONFIDENCE_THRESHOLD,
                }
            )

    return {
        "report_date": report_date,
        "diagnoses": diagnoses,
        "medications": medications,
        "lab_rows": lab_rows,
        "numbers": numbers,
    }


async def extract_document_text_and_fields(
    source: bytes | str | Path,
    mime_type: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Extract text, structured fields, calibrated confidence, and <0.75 uncertain spans (NO guessing)."""
    cfg = settings or get_settings()
    file_bytes = Path(source).read_bytes() if isinstance(source, (str, Path)) else source
    resolved_mime = mime_type or detect_document_mime(file_bytes)
    if not resolved_mime:
        raise AppError(415, "VALIDATION_ERROR", "Unsupported document format.")

    all_page_lines: list[tuple[int, list[dict[str, Any]]]] = []
    ocr_provider_used = "pymupdf_native"
    low_res_warnings: list[str] = []

    if resolved_mime == "application/pdf":
        with pymupdf.open(stream=file_bytes, filetype="pdf") as doc:
            if doc.needs_pass:
                raise AppError(422, "OCR_PDF_ENCRYPTED", "Encrypted PDF cannot be extracted.")
            if doc.page_count > MAX_PDF_PAGES:
                raise AppError(422, "VALIDATION_ERROR", f"PDF exceeds maximum {MAX_PDF_PAGES} pages.")

            # First try native embedded text extraction per page
            needs_raster_ocr_pages: list[int] = []
            native_by_page: dict[int, list[dict[str, Any]]] = {}

            for page_idx in range(doc.page_count):
                page_num = page_idx + 1
                page = doc[page_idx]
                raw_text = (page.get_text("text") or "").strip()
                if len(re.sub(r"\s+", "", raw_text)) >= 20:
                    w_rect = page.rect
                    pw = float(w_rect.width or 1.0)
                    ph = float(w_rect.height or 1.0)
                    page_dict = page.get_text("dict")
                    lines_out: list[dict[str, Any]] = []
                    for block in page_dict.get("blocks", []):
                        for line in block.get("lines", []):
                            line_txt = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
                            if not line_txt:
                                continue
                            bbox = line.get("bbox", [0, 0, pw, ph])
                            conf = 0.45 if _UNREADABLE_TOKEN_RE.search(line_txt) else 0.96
                            lines_out.append(
                                {
                                    "text": line_txt,
                                    "confidence": conf,
                                    "bbox_norm": [
                                        round(bbox[0] / pw, 4),
                                        round(bbox[1] / ph, 4),
                                        round(bbox[2] / pw, 4),
                                        round(bbox[3] / ph, 4),
                                    ],
                                }
                            )
                    native_by_page[page_num] = lines_out
                else:
                    needs_raster_ocr_pages.append(page_num)

            # Fallback to Azure Doc Intel / GCV / 300-DPI PNG + RapidOCR for scanned PDF pages
            raster_by_page: dict[int, list[dict[str, Any]]] = {}
            if needs_raster_ocr_pages:
                if cfg.AZURE_DOC_INTEL_ENDPOINT and cfg.AZURE_DOC_INTEL_KEY and cfg.OCR_PRIMARY_PROVIDER == "azure_doc_intel":
                    ocr_provider_used = "azure_doc_intel"
                    raster_by_page = await _run_azure_doc_intel_chunked(file_bytes, resolved_mime, cfg)
                else:
                    for page_num in needs_raster_ocr_pages:
                        page = doc[page_num - 1]
                        zoom = 300.0 / 72.0
                        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
                        png_bytes = pix.tobytes("png")
                        if cfg.GOOGLE_CLOUD_VISION_API_KEY.strip():
                            ocr_provider_used = "google_cloud_vision"
                            raster_by_page[page_num] = await _run_gcv_ocr(png_bytes, pix.width, pix.height, cfg)
                        else:
                            ocr_provider_used = "pymupdf+rapidocr"
                            raster_by_page[page_num] = await _run_rapidocr_on_png(png_bytes, pix.width, pix.height)

            for page_idx in range(doc.page_count):
                page_num = page_idx + 1
                if page_num in native_by_page:
                    all_page_lines.append((page_num, native_by_page[page_num]))
                else:
                    all_page_lines.append((page_num, raster_by_page.get(page_num, [])))
    else:
        png_bytes, width, height = _strip_exif_and_normalize_image(file_bytes)
        if width < 250 or height < 80:
            low_res_warnings.append("Image resolution is very low; please verify extracted numbers carefully.")
        if cfg.GOOGLE_CLOUD_VISION_API_KEY.strip():
            ocr_provider_used = "google_cloud_vision"
            lines = await _run_gcv_ocr(png_bytes, width, height, cfg)
        elif cfg.AZURE_DOC_INTEL_ENDPOINT and cfg.AZURE_DOC_INTEL_KEY:
            ocr_provider_used = "azure_doc_intel"
            pages_map = await _run_azure_doc_intel_chunked(png_bytes, "image/png", cfg)
            lines = pages_map.get(1, [])
        else:
            ocr_provider_used = "rapidocr_local"
            lines = await _run_rapidocr_on_png(png_bytes, width, height)
        all_page_lines.append((1, lines))

    # Flatten lines and identify uncertain spans (< 0.75 general, < 0.85 critical, or [UNREADABLE])
    flat_lines: list[dict[str, Any]] = []
    uncertain_spans: list[dict[str, Any]] = []

    for page_num, lines in all_page_lines:
        for line in lines:
            txt = line["text"].strip()
            conf = float(line.get("confidence", 0.0))
            if low_res_warnings and conf > 0.7:
                conf = min(conf, 0.70)
                line["confidence"] = conf
            flat_lines.append(line)

            has_unreadable = bool(_UNREADABLE_TOKEN_RE.search(txt))
            has_critical = bool(_CRITICAL_TOKEN_RE.search(txt))
            threshold = CRITICAL_CONFIDENCE_THRESHOLD if has_critical else GENERAL_CONFIDENCE_THRESHOLD
            if has_unreadable or conf < threshold:
                uncertain_spans.append(
                    {
                        "page": page_num,
                        "bbox_norm": line.get("bbox_norm", [0.0, 0.0, 1.0, 1.0]),
                        "field": "critical_clinical_value" if has_critical else "text_line",
                        "text": txt,
                        "confidence": round(conf, 4),
                        "reason": (
                            "Unreadable marker detected in document."
                            if has_unreadable
                            else f"Confidence {conf:.2f} below {threshold:.2f} safety threshold."
                        ),
                    }
                )

    raw_text = "\n".join(line["text"] for line in flat_lines)
    if not flat_lines:
        agg_conf = 0.0
        uncertain_spans.append(
            {
                "page": 1,
                "bbox_norm": [0.0, 0.0, 1.0, 1.0],
                "field": "document",
                "text": "[UNREADABLE]",
                "confidence": 0.0,
                "reason": "No readable text could be extracted from the uploaded document.",
            }
        )
    else:
        confs = [float(line.get("confidence", 0.0)) for line in flat_lines]
        agg_conf = round(sum(confs) / len(confs), 4)
        if any(_UNREADABLE_TOKEN_RE.search(line["text"]) for line in flat_lines):
            agg_conf = min(agg_conf, 0.65)

    structured_fields = _extract_structured_medical_fields(flat_lines, uncertain_spans)
    requires_verification = bool(uncertain_spans) or agg_conf < GENERAL_CONFIDENCE_THRESHOLD

    return {
        "ocr_provider": ocr_provider_used,
        "page_count": len(all_page_lines),
        "ocr_raw_text": raw_text or "[UNREADABLE]",
        "ocr_structured_fields": structured_fields,
        "ocr_confidence_score": agg_conf,
        "uncertain_spans": uncertain_spans,
        "requires_verification": requires_verification,
        "processing_status": "needs_verification" if requires_verification else "extracted",
        "warnings": low_res_warnings,
    }
