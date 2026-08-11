#
# Build the frontend, install the backend, and serve both from
# http://localhost:8000. Safe to run twice.
#
# UNTESTED. PowerShell was not available where this was written, so this is a
# careful translation of scripts/lib/serve.sh rather than something that has
# been run. Treat the first Windows run as the real test.

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Port = if ($env:PORT) { [int]$env:PORT } else { 8000 }
$RunDir = Join-Path $RepoRoot ".run"
$PidFile = Join-Path $RunDir "backend.pid"
$LogFile = Join-Path $RunDir "backend.log"

Set-Location $RepoRoot
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

function Get-RunningProcess {
    if (-not (Test-Path $PidFile)) { return $null }
    $recorded = Get-Content $PidFile | Select-Object -First 1
    return Get-Process -Id $recorded -ErrorAction SilentlyContinue
}

$existing = Get-RunningProcess
if ($existing) {
    Write-Host "Already running (pid $($existing.Id)) at http://localhost:$Port"
    exit 0
}

# A pid file naming a process that has gone is just litter.
Remove-Item $PidFile -ErrorAction SilentlyContinue

# Refuse rather than fight something we did not start.
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Write-Error "Port $Port is already in use by pid $($listener.OwningProcess)."
    exit 1
}

Write-Host "Building the frontend..."
Push-Location (Join-Path $RepoRoot "frontend")
npm install --no-audit --no-fund --silent
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
Pop-Location

Write-Host "Installing the backend..."
Push-Location (Join-Path $RepoRoot "backend")
uv sync --quiet
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }

Write-Host "Starting the server..."
# No --reload: it forks a watcher, and the pid would then name the wrong
# process, leaving stop-windows.ps1 unable to shut the server down.
$process = Start-Process -FilePath "uv" `
    -ArgumentList "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$Port" `
    -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err" `
    -NoNewWindow -PassThru
Pop-Location

$process.Id | Out-File -FilePath $PidFile -Encoding ascii

foreach ($attempt in 1..60) {
    try {
        Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
        Write-Host ""
        Write-Host "Prelegal is running at http://localhost:$Port"
        Write-Host "  API docs   http://localhost:$Port/api/docs"
        Write-Host "  Logs       $LogFile"
        Write-Host "  Stop with  scripts\stop-windows.ps1"
        exit 0
    } catch {
        # Give up early if it died, rather than waiting out the whole timeout.
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
}

Write-Error "The server did not come up. Last 20 lines of ${LogFile}:"
Get-Content $LogFile -Tail 20 -ErrorAction SilentlyContinue | Write-Host
Remove-Item $PidFile -ErrorAction SilentlyContinue
exit 1
