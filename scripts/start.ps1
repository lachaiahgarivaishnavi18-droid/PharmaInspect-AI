$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path '.venv/Scripts/python.exe')) { throw 'Create .venv and install backend/requirements.txt first. See README.md.' }
if (-not (Test-Path 'dist/index.html')) { throw 'Build the frontend with pnpm run build first.' }
& .venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
