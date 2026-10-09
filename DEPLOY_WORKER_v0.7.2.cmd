@echo off
setlocal
cd /d "%~dp0"
echo Taiwan Stock Lab v0.7.2 - deploy the EXISTING Cloudflare Worker
echo Secrets stay on this computer and Cloudflare. Never paste them into chat.
call git pull --ff-only
if errorlevel 1 goto failed
call npm ci
if errorlevel 1 goto failed
call npm test
if errorlevel 1 goto failed
echo Sign in to the account that owns taiwan-stock-lab-alerts in the official browser page.
call npx wrangler login
if errorlevel 1 goto failed
call npm run deploy:worker
if errorlevel 1 goto failed
echo.
echo Worker deployment command succeeded. Keep .backups private and safely stored.
echo Send ONLY the public Worker URL and Current Version ID back for verification.
echo The original website still needs publication and real-device push verification.
pause
exit /b 0
:failed
echo.
echo Stopped after an error. No later step was run. Keep the backup folder.
echo Share only the error message; never share secret values or backup files.
pause
exit /b 1
