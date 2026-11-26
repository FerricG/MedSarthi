<#
.SYNOPSIS
Starts MedSarthi Backend (FastAPI in backend\.venv) and Frontend (Next.js via npm.cmd) on Windows 11.
Educational prototype using synthetic data only.
#>
$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Backend virtual environment not found at $VenvPython. Run 'py -3.13 -m venv backend\.venv' and install backend\requirements.txt first."
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " MedSarthi Local Dev Runner (Educational Prototype Only)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Ensure database is initialized & seeded (idempotent)
Push-Location $BackendDir
try {
    & $VenvPython -m app.seeds.seed_data
} finally {
    Pop-Location
}

$backendProc = $null
$frontendProc = $null

try {
    Write-Host "[1/2] Starting FastAPI backend on http://127.0.0.1:8000 ..." -ForegroundColor Green
    $backendProc = Start-Process -FilePath $VenvPython `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory $BackendDir `
        -NoNewWindow -PassThru

    Write-Host "[2/2] Starting Next.js frontend on http://localhost:3000 ..." -ForegroundColor Green
    $frontendProc = Start-Process -FilePath "npm.cmd" `
        -ArgumentList "run", "dev" `
        -WorkingDirectory $FrontendDir `
        -NoNewWindow -PassThru

    Write-Host ""
    Write-Host "Both servers are launching. Press Ctrl+C to stop." -ForegroundColor Yellow
    while (-not $backendProc.HasExited -and -not $frontendProc.HasExited) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "Stopping MedSarthi services..." -ForegroundColor Yellow
    if ($backendProc -and -not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProc -and -not $frontendProc.HasExited) {
        Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
    }
}
