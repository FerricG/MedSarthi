"""QR-based wireless phone-to-PC image upload service using Flask + ngrok + qrcode."""

from __future__ import annotations

import base64
from datetime import UTC, datetime
import io
import logging
import os
from pathlib import Path
import re
import socket
import threading
from typing import Any

from flask import Flask, jsonify, render_template_string, request as flask_request
import qrcode
from werkzeug.serving import make_server

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif"}

MOBILE_UPLOAD_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>MedSarthi — Phone Prescription Upload</title>
  <style>
    :root {
      --bg: #f4f7f6;
      --card: #ffffff;
      --ink: #0f172a;
      --muted: #475569;
      --primary: #0f766e;
      --primary-dark: #0d5c56;
      --border: #cbd5e1;
      --danger: #b91c1c;
      --ok: #15803d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    .wrap {
      max-width: 520px;
      margin: 0 auto;
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    }
    h1 { margin: 0 0 6px; font-size: 1.45rem; }
    p { margin: 0 0 16px; color: var(--muted); font-size: 0.95rem; line-height: 1.45; }
    .btn {
      display: block;
      width: 100%;
      padding: 15px 18px;
      border-radius: 14px;
      border: 2px solid transparent;
      font-size: 1.05rem;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      margin-bottom: 12px;
    }
    .btn-select {
      background: #e6f4f1;
      color: var(--primary-dark);
      border-color: var(--primary);
    }
    .btn-upload {
      background: var(--primary);
      color: #ffffff;
    }
    .btn-upload:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin: 12px 0 16px;
    }
    .preview-card {
      position: relative;
      border: 2px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: #f8fafc;
    }
    .preview-card img {
      width: 100%;
      height: 130px;
      object-fit: cover;
      display: block;
    }
    .preview-name {
      padding: 6px 8px;
      font-size: 0.75rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .remove-btn {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: rgba(185, 28, 28, 0.92);
      color: #fff;
      font-weight: 800;
      font-size: 16px;
      cursor: pointer;
    }
    .progress-wrap {
      display: none;
      margin: 12px 0;
    }
    .progress-bar {
      width: 100%;
      height: 12px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      width: 0%;
      background: var(--primary);
      transition: width 0.15s ease;
    }
    .progress-text {
      margin-top: 6px;
      font-size: 0.85rem;
      font-weight: 700;
      text-align: center;
    }
    .status {
      display: none;
      padding: 12px 14px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 0.95rem;
      margin-top: 10px;
    }
    .status.ok { background: #dcfce7; color: var(--ok); border: 2px solid #86efac; }
    .status.err { background: #fee2e2; color: var(--danger); border: 2px solid #fca5a5; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Upload Prescription / Images</h1>
    <p>Select one or more photos from your phone gallery or camera to send directly to your PC.</p>

    <input id="fileInput" type="file" accept="image/*" multiple style="display:none" />
    <button type="button" id="selectBtn" class="btn btn-select">Select Images</button>

    <div id="previewGrid" class="grid"></div>

    <div id="progressWrap" class="progress-wrap">
      <div class="progress-bar"><div id="progressFill" class="progress-fill"></div></div>
      <div id="progressText" class="progress-text">0%</div>
    </div>

    <button type="button" id="uploadBtn" class="btn btn-upload" disabled>Upload Images</button>
    <div id="statusBox" class="status"></div>
  </div>

  <script>
    const fileInput = document.getElementById("fileInput");
    const selectBtn = document.getElementById("selectBtn");
    const previewGrid = document.getElementById("previewGrid");
    const uploadBtn = document.getElementById("uploadBtn");
    const progressWrap = document.getElementById("progressWrap");
    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    const statusBox = document.getElementById("statusBox");

    let selectedFiles = [];

    function renderPreviews() {
      previewGrid.innerHTML = "";
      selectedFiles.forEach((file, idx) => {
        const card = document.createElement("div");
        card.className = "preview-card";

        const img = document.createElement("img");
        img.alt = file.name;
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(file);

        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "remove-btn";
        rm.textContent = "×";
        rm.setAttribute("aria-label", "Remove " + file.name);
        rm.onclick = () => {
          selectedFiles.splice(idx, 1);
          renderPreviews();
        };

        const nameEl = document.createElement("div");
        nameEl.className = "preview-name";
        nameEl.textContent = file.name;

        card.appendChild(img);
        card.appendChild(rm);
        card.appendChild(nameEl);
        previewGrid.appendChild(card);
      });
      uploadBtn.disabled = selectedFiles.length === 0;
    }

    selectBtn.onclick = () => fileInput.click();

    fileInput.onchange = () => {
      const files = Array.from(fileInput.files || []);
      selectedFiles = selectedFiles.concat(files);
      fileInput.value = "";
      statusBox.style.display = "none";
      renderPreviews();
    };

    uploadBtn.onclick = () => {
      if (selectedFiles.length === 0) return;
      const formData = new FormData();
      selectedFiles.forEach((f) => formData.append("images", f, f.name));

      uploadBtn.disabled = true;
      selectBtn.disabled = true;
      progressWrap.style.display = "block";
      progressFill.style.width = "0%";
      progressText.textContent = "Uploading... 0%";
      statusBox.style.display = "none";

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/upload", true);
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          progressFill.style.width = pct + "%";
          progressText.textContent = "Uploading... " + pct + "%";
        }
      };
      xhr.onload = () => {
        selectBtn.disabled = false;
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.status === "ok") {
            statusBox.className = "status ok";
            statusBox.textContent = "Uploaded " + data.count + " image(s) to PC: " + data.filenames.join(", ");
            statusBox.style.display = "block";
            selectedFiles = [];
            renderPreviews();
          } else {
            throw new Error(data.message || "Upload failed");
          }
        } catch (err) {
          statusBox.className = "status err";
          statusBox.textContent = "Upload failed: " + (err.message || "Server error");
          statusBox.style.display = "block";
          uploadBtn.disabled = false;
        }
      };
      xhr.onerror = () => {
        selectBtn.disabled = false;
        uploadBtn.disabled = false;
        statusBox.className = "status err";
        statusBox.textContent = "Network error while uploading. Please try again.";
        statusBox.style.display = "block";
      };
      xhr.send(formData);
    };
  </script>
</body>
</html>
"""


def _get_lan_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _make_qr_data_url(target_url: str) -> str:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(target_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


class QrRemoteUploadManager:
    """Manages a background Flask image receiver + ngrok tunnel + QR generator."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._server: Any = None
        self._thread: threading.Thread | None = None
        self._tunnel: Any = None
        self._port: int = get_settings().QR_UPLOAD_PORT
        self._public_url: str | None = None
        self._local_url: str | None = None
        self._qr_data_url: str | None = None
        self._tunnel_error: str | None = None
        self._server_running: bool = False
        self._tunnel_active: bool = False
        self._imported_docs: dict[str, str] = {}

    @property
    def upload_dir(self) -> Path:
        folder = get_settings().storage_path / "uploads"
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def _next_unique_filename(self, original_name: str) -> str:
        ext = Path(original_name or "image.jpg").suffix.lower()
        if ext not in _ALLOWED_IMAGE_EXTS:
            ext = ".jpg"

        existing_nums = [0]
        for p in self.upload_dir.iterdir():
            m = re.match(r"^image_(\d+)\.", p.name, re.IGNORECASE)
            if m:
                existing_nums.append(int(m.group(1)))
        next_num = max(existing_nums) + 1
        candidate = f"image_{next_num:03d}{ext}"
        while (self.upload_dir / candidate).exists():
            next_num += 1
            candidate = f"image_{next_num:03d}{ext}"
        return candidate

    def _build_flask_app(self) -> Flask:
        app = Flask("medsarthi_qr_upload")

        @app.get("/")
        def index():
            return render_template_string(MOBILE_UPLOAD_HTML)

        @app.post("/upload")
        def upload_images():
            files = flask_request.files.getlist("images")
            if not files:
                files = [f for f in flask_request.files.values()]
            if not files:
                return jsonify({"status": "error", "message": "No image files received."}), 400

            saved: list[str] = []
            for f in files:
                if not f or not f.filename:
                    continue
                safe_name = self._next_unique_filename(f.filename)
                dest = self.upload_dir / safe_name
                f.save(str(dest))
                saved.append(safe_name)

            if not saved:
                return jsonify({"status": "error", "message": "No valid image files received."}), 400

            logger.info("QR upload received %d image(s): %s", len(saved), saved)
            return jsonify({"status": "ok", "count": len(saved), "filenames": saved}), 201

        return app

    def mark_imported(self, filename: str, document_id: str) -> None:
        self._imported_docs[filename] = document_id

    def list_uploaded_files(self) -> list[dict[str, Any]]:
        files_out: list[dict[str, Any]] = []
        for p in sorted(self.upload_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if p.is_file() and p.suffix.lower() in _ALLOWED_IMAGE_EXTS:
                stat = p.stat()
                files_out.append(
                    {
                        "filename": p.name,
                        "size_bytes": stat.st_size,
                        "created_at": datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                        "imported_document_id": self._imported_docs.get(p.name),
                    }
                )
        return files_out

    def start(self, port: int | None = None, authtoken: str | None = None) -> dict[str, Any]:
        with self._lock:
            target_port = port or get_settings().QR_UPLOAD_PORT or 5000
            if self._server_running:
                self._stop_locked()

            self._port = target_port
            self._tunnel_error = None
            flask_app = self._build_flask_app()

            try:
                self._server = make_server("0.0.0.0", target_port, flask_app, threaded=True)
            except OSError as exc:
                logger.exception("Failed to bind Flask QR upload server on port %s", target_port)
                return {
                    **self.status(),
                    "tunnel_error": f"Could not bind Flask server on port {target_port}: {exc}",
                }

            self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
            self._thread.start()
            self._server_running = True

            lan_ip = _get_lan_ip()
            self._local_url = f"http://{lan_ip}:{target_port}"

            # Start ngrok tunnel
            token = (authtoken or os.environ.get("NGROK_AUTHTOKEN") or get_settings().NGROK_AUTHTOKEN or "").strip()
            try:
                from pyngrok import conf, ngrok

                if token:
                    ngrok.set_auth_token(token)
                pyngrok_cfg = conf.get_default()
                if token:
                    pyngrok_cfg.auth_token = token

                tunnel = ngrok.connect(addr=target_port, proto="http", bind_tls=True)
                self._tunnel = tunnel
                self._public_url = tunnel.public_url
                if self._public_url and self._public_url.startswith("http://"):
                    self._public_url = self._public_url.replace("http://", "https://", 1)
                self._tunnel_active = True
                self._qr_data_url = _make_qr_data_url(self._public_url)
                logger.info("QR upload ngrok tunnel started: %s -> :%s", self._public_url, target_port)
            except Exception as exc:
                logger.warning("ngrok tunnel startup failed: %s", exc)
                self._tunnel = None
                self._tunnel_active = False
                self._public_url = None
                self._tunnel_error = (
                    f"ngrok tunnel could not start ({exc}). "
                    "Set NGROK_AUTHTOKEN in .env or enter it above for cross-network uploads; "
                    f"using local LAN URL {self._local_url} for QR fallback."
                )
                self._qr_data_url = _make_qr_data_url(self._local_url)

            return self.status()

    def _stop_locked(self) -> None:
        if self._tunnel is not None:
            try:
                from pyngrok import ngrok

                if self._public_url:
                    ngrok.disconnect(self._public_url)
            except Exception as exc:
                logger.warning("Error disconnecting ngrok tunnel: %s", exc)
            self._tunnel = None

        if self._server is not None:
            try:
                self._server.shutdown()
                self._server.server_close()
            except Exception as exc:
                logger.warning("Error stopping Flask server: %s", exc)
            self._server = None

        self._thread = None
        self._server_running = False
        self._tunnel_active = False
        self._public_url = None
        self._qr_data_url = None

    def stop(self) -> dict[str, Any]:
        with self._lock:
            self._stop_locked()
            self._tunnel_error = None
            return self.status()

    def status(self) -> dict[str, Any]:
        files = self.list_uploaded_files()
        return {
            "running": self._server_running,
            "server_status": "running" if self._server_running else "stopped",
            "tunnel_status": "connected" if self._tunnel_active else ("error" if self._tunnel_error else "stopped"),
            "port": self._port,
            "public_url": self._public_url,
            "local_url": self._local_url,
            "active_qr_url": self._public_url or self._local_url,
            "qr_data_url": self._qr_data_url,
            "upload_dir": str(self.upload_dir),
            "uploaded_count": len(files),
            "uploaded_files": files,
            "tunnel_error": self._tunnel_error,
        }


qr_upload_manager = QrRemoteUploadManager()
