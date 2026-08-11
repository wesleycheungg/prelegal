#
# Stop the server started by scripts\start-windows.ps1.
#
# Stops the process recorded in .run\backend.pid rather than whatever holds
# port 8000, so this can never kill an unrelated program listening there.
#
# UNTESTED. PowerShell was not available where this was written, so this is a
# careful translation of scripts/lib/serve.sh rather than something that has
# been run.

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidFile = Join-Path $RepoRoot ".run\backend.pid"

if (-not (Test-Path $PidFile)) {
    Write-Host "Not running."
    exit 0
}

$recorded = Get-Content $PidFile | Select-Object -First 1
$process = Get-Process -Id $recorded -ErrorAction SilentlyContinue

if (-not $process) {
    Write-Host "Not running (stale pid file removed)."
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    exit 0
}

Write-Host "Stopping the server (pid $($process.Id))..."
$process.CloseMainWindow() | Out-Null

foreach ($attempt in 1..20) {
    if ($process.HasExited) {
        Remove-Item $PidFile -ErrorAction SilentlyContinue
        Write-Host "Stopped."
        exit 0
    }
    Start-Sleep -Milliseconds 500
}

# Ten seconds is long enough for a graceful shutdown; past that it is stuck.
Write-Warning "Did not shut down in time - forcing."
Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
Remove-Item $PidFile -ErrorAction SilentlyContinue
Write-Host "Stopped."
