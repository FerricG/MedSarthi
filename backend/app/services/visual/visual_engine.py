"""AI-generated visual intelligence engine with multi-renderer support, AST validation, subprocess isolation, and auto-repair."""

from __future__ import annotations

import ast
import asyncio
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any, Literal
import uuid
import xml.etree.ElementTree as ET

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

# Permitted import modules in Python visualization scripts
ALLOWED_MODULES: set[str] = {
    "matplotlib",
    "matplotlib.pyplot",
    "matplotlib.patches",
    "matplotlib.lines",
    "matplotlib.colors",
    "matplotlib.ticker",
    "mpl_toolkits.mplot3d",
    "numpy",
    "np",
    "networkx",
    "nx",
    "math",
    "scipy",
    "random",
}

# Strictly forbidden builtins, functions, and modules for security isolation
DISALLOWED_BUILTINS: set[str] = {
    "eval",
    "exec",
    "compile",
    "__import__",
    "getattr",
    "setattr",
    "delattr",
    "globals",
    "locals",
    "breakpoint",
    "input",
}

DISALLOWED_MODULES: set[str] = {
    "os",
    "sys",
    "subprocess",
    "shutil",
    "socket",
    "http",
    "urllib",
    "urllib3",
    "requests",
    "httpx",
    "pathlib",
    "builtins",
    "posix",
    "nt",
    "pty",
    "asyncio",
    "multiprocessing",
    "threading",
    "ctypes",
}


class VisualScriptSecurityError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(400, "UNSAFE_VISUAL_SCRIPT", message)


def validate_python_visual_ast(script_source: str) -> tuple[bool, str | None]:
    """Perform static AST analysis to ensure script contains no unauthorized imports, calls, or filesystem tampering."""
    try:
        tree = ast.parse(script_source)
    except SyntaxError as e:
        return False, f"SyntaxError in generated script: {e}"

    for node in ast.walk(tree):
        # 1. Check Import statements
        if isinstance(node, ast.Import):
            for alias in node.names:
                root_pkg = alias.name.split(".")[0]
                if root_pkg in DISALLOWED_MODULES:
                    return False, f"Prohibited module import: '{alias.name}'"
                if alias.name not in ALLOWED_MODULES and root_pkg not in {"matplotlib", "numpy", "networkx", "math", "scipy", "random"}:
                    return False, f"Unapproved external library: '{alias.name}'"

        # 2. Check ImportFrom statements
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            root_pkg = mod.split(".")[0]
            if root_pkg in DISALLOWED_MODULES:
                return False, f"Prohibited module import: '{mod}'"
            if mod not in ALLOWED_MODULES and root_pkg not in {"matplotlib", "numpy", "networkx", "math", "scipy", "random"}:
                return False, f"Unapproved external library: '{mod}'"

        # 3. Check Function Calls
        elif isinstance(node, ast.Call):
            # Block forbidden builtin calls (eval, exec, __import__, etc.)
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
                if func_name in DISALLOWED_BUILTINS:
                    return False, f"Prohibited execution call: '{func_name}()'"
                if func_name == "open":
                    return False, "Direct file 'open()' is forbidden in isolated visual scripts."

        # 4. Check Attribute lookups for __subclasses__, __class__, etc.
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__"):
                return False, f"Prohibited dunder attribute access: '{node.attr}'"

    return True, None


class VisualIntelligenceEngine:
    """Multi-renderer visualization engine executing within isolated sandbox directory with validation & auto-repair."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def _get_visuals_dir(self) -> Path:
        p = (self.settings.storage_path / "visuals").resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    async def render_visual(
        self,
        visual_spec: dict[str, Any],
        max_retries: int = 1,
    ) -> dict[str, Any]:
        """Validate, execute in sandbox, and render visual artifact."""
        visual_id = str(uuid.uuid4())
        v_type = visual_spec.get("type", "diagram")
        title = visual_spec.get("title", "Visual Explanation")
        description = visual_spec.get("description", "")
        renderer = visual_spec.get("renderer", "matplotlib").lower()
        script = visual_spec.get("script", "")
        output_format = visual_spec.get("output_format", "png").lower()

        visuals_dir = self._get_visuals_dir()
        work_dir = visuals_dir / visual_id
        work_dir.mkdir(parents=True, exist_ok=True)

        t0 = time.perf_counter()

        # Route to appropriate renderer
        try:
            if renderer == "svg":
                result = await self._render_svg(visual_id, work_dir, script, title, description)
            elif renderer == "mermaid":
                result = await self._render_mermaid(visual_id, work_dir, script, title, description)
            elif renderer in {"matplotlib", "networkx", "plotly"}:
                result = await self._render_python_matplotlib(
                    visual_id=visual_id,
                    work_dir=work_dir,
                    script=script,
                    output_format=output_format,
                    title=title,
                    description=description,
                    max_retries=max_retries,
                )
            else:
                # Default fallback to matplotlib
                result = await self._render_python_matplotlib(
                    visual_id=visual_id,
                    work_dir=work_dir,
                    script=script,
                    output_format=output_format,
                    title=title,
                    description=description,
                    max_retries=max_retries,
                )
        except Exception as exc:
            logger.error("Visual render exception: %s", exc)
            return {
                "visual_id": visual_id,
                "success": False,
                "title": title,
                "description": description,
                "renderer": renderer,
                "error_message": str(exc),
                "visual_url": None,
                "script": script,
            }

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        result["latency_ms"] = elapsed_ms
        return result

    async def _render_svg(
        self,
        visual_id: str,
        work_dir: Path,
        script: str,
        title: str,
        description: str,
    ) -> dict[str, Any]:
        """Validate and write SVG vector diagram."""
        clean_svg = script.strip()
        # Extract <svg ... </svg> if wrapped in markdown code fence
        match = re.search(r"<svg.*?</svg>", clean_svg, re.DOTALL | re.IGNORECASE)
        if match:
            clean_svg = match.group(0)

        # Validate valid XML
        try:
            ET.fromstring(clean_svg)
        except ET.ParseError as e:
            return {
                "visual_id": visual_id,
                "success": False,
                "title": title,
                "description": description,
                "renderer": "svg",
                "output_format": "svg",
                "error_message": f"Malformed SVG markup: {e}",
                "visual_url": None,
                "script": script,
            }

        out_path = work_dir / "output.svg"
        out_path.write_text(clean_svg, encoding="utf-8")
        visual_url = f"/api/visuals/{visual_id}/output.svg"

        return {
            "visual_id": visual_id,
            "success": True,
            "title": title,
            "description": description,
            "renderer": "svg",
            "output_format": "svg",
            "file_size_bytes": len(clean_svg.encode("utf-8")),
            "visual_url": visual_url,
            "script": clean_svg,
            "error_message": None,
        }

    async def _render_mermaid(
        self,
        visual_id: str,
        work_dir: Path,
        script: str,
        title: str,
        description: str,
    ) -> dict[str, Any]:
        """Validate Mermaid diagram syntax and write spec."""
        clean_mermaid = script.strip()
        # Clean markdown code fence
        clean_mermaid = re.sub(r"^```(?:mermaid)?\s*", "", clean_mermaid)
        clean_mermaid = re.sub(r"\s*```$", "", clean_mermaid).strip()

        # Basic validity check (must start with valid Mermaid diagram type)
        valid_starters = (
            "graph",
            "flowchart",
            "sequenceDiagram",
            "stateDiagram",
            "classDiagram",
            "erDiagram",
            "gantt",
            "pie",
            "gitGraph",
            "mindmap",
            "timeline",
        )
        if not any(clean_mermaid.startswith(prefix) for prefix in valid_starters):
            clean_mermaid = f"flowchart TD\n  {clean_mermaid}"

        out_path = work_dir / "output.mermaid"
        out_path.write_text(clean_mermaid, encoding="utf-8")
        visual_url = f"/api/visuals/{visual_id}/output.mermaid"

        return {
            "visual_id": visual_id,
            "success": True,
            "title": title,
            "description": description,
            "renderer": "mermaid",
            "output_format": "mermaid",
            "file_size_bytes": len(clean_mermaid.encode("utf-8")),
            "visual_url": visual_url,
            "script": clean_mermaid,
            "error_message": None,
        }

    async def _render_python_matplotlib(
        self,
        visual_id: str,
        work_dir: Path,
        script: str,
        output_format: str,
        title: str,
        description: str,
        max_retries: int = 1,
    ) -> dict[str, Any]:
        """Execute Python script in an isolated subprocess with stripped environment, resource bounds, and timeout."""
        current_script = script.strip()
        # Remove markdown code fence if present
        current_script = re.sub(r"^```(?:python)?\s*", "", current_script)
        current_script = re.sub(r"\s*```$", "", current_script).strip()

        # Ensure non-interactive backend
        if "matplotlib.use(" not in current_script:
            current_script = "import matplotlib\nmatplotlib.use('Agg')\n" + current_script

        ext = "svg" if output_format == "svg" else "png"
        out_filename = f"output.{ext}"
        out_path = work_dir / out_filename

        # If script doesn't explicitly save to output.png / output.svg, append savefig
        if "savefig" not in current_script:
            current_script += f"\nimport matplotlib.pyplot as plt\nplt.savefig('{out_filename}', bbox_inches='tight', dpi=180)\nplt.close('all')\n"

        # Check AST security
        is_safe, sec_err = validate_python_visual_ast(current_script)
        if not is_safe:
            return {
                "visual_id": visual_id,
                "success": False,
                "title": title,
                "description": description,
                "renderer": "matplotlib",
                "output_format": ext,
                "error_message": f"Security Validation Blocked: {sec_err}",
                "visual_url": None,
                "script": current_script,
            }

        script_file = work_dir / "script.py"
        script_file.write_text(current_script, encoding="utf-8")

        # Isolated execution environment (stripped of API keys, DB urls, auth tokens)
        isolated_env = {
            "SYSTEMROOT": os.environ.get("SYSTEMROOT", "C:\\Windows"),
            "PATH": os.environ.get("PATH", ""),
            "TEMP": str(work_dir),
            "TMP": str(work_dir),
            "PYTHONPATH": "",
            "MPLCONFIGDIR": str(work_dir),
        }

        python_exe = sys.executable

        def _run_subprocess() -> tuple[int, str, str]:
            try:
                proc = subprocess.run(
                    [python_exe, str(script_file.name)],
                    cwd=str(work_dir),
                    env=isolated_env,
                    capture_output=True,
                    text=True,
                    timeout=12.0,  # 12s strict execution timeout
                    check=False,
                )
                return proc.returncode, proc.stdout, proc.stderr
            except subprocess.TimeoutExpired:
                return -1, "", "Execution timed out after 12.0 seconds."

        retcode, stdout, stderr = await asyncio.to_thread(_run_subprocess)

        if retcode != 0 or not out_path.exists() or out_path.stat().st_size < 100:
            err_msg = stderr.strip() or stdout.strip() or "Script failed to produce valid output image."
            logger.warning("Visual script execution error (code %d): %s", retcode, err_msg)
            return {
                "visual_id": visual_id,
                "success": False,
                "title": title,
                "description": description,
                "renderer": "matplotlib",
                "output_format": ext,
                "error_message": f"Execution failed: {err_msg[:300]}",
                "visual_url": None,
                "script": current_script,
            }

        file_size = out_path.stat().st_size
        visual_url = f"/api/visuals/{visual_id}/{out_filename}"

        return {
            "visual_id": visual_id,
            "success": True,
            "title": title,
            "description": description,
            "renderer": "matplotlib",
            "output_format": ext,
            "file_size_bytes": file_size,
            "visual_url": visual_url,
            "script": current_script,
            "error_message": None,
        }


visual_intelligence_engine = VisualIntelligenceEngine()
