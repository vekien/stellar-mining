@echo off
setlocal
cd /d "%~dp0"

set PORT=3000
set URL=http://localhost:%PORT%

echo Starting Stellar Mining Co. on %URL%
echo Waiting for server before opening browser...

REM Poll in the background; open the browser only once the server answers
start /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "for ($i = 0; $i -lt 90; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 1; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { Start-Process '%URL%'; exit 0 } } catch {} ; Start-Sleep -Seconds 1 }; Write-Host 'Timed out waiting for server.'"

npx --yes serve . -l %PORT%

endlocal
