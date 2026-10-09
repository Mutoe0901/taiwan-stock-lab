@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo Taiwan Stock Lab v0.7.1 - Apply Update
 echo ================================================
set "REPO=%~dp0taiwan-stock-lab"
if not exist "%REPO%\package.json" set "REPO=%~dp0..\taiwan-stock-lab"
if not exist "%REPO%\package.json" (
 echo Existing project not found next to the update package.
 set /p REPO=Enter FULL folder path to the existing taiwan-stock-lab project: 
)
if not exist "%REPO%\package.json" (
 echo [ERROR] Project not found: %REPO%
 goto done
)
where python >nul 2>&1
if not errorlevel 1 (
 python "%~dp0scripts\apply_071.py" "%REPO%"
) else (
 where py >nul 2>&1
 if errorlevel 1 (
  echo [ERROR] Python is required to apply this package. See UPDATE_GUIDE.md
  goto done
 )
 py -3 "%~dp0scripts\apply_071.py" "%REPO%"
)
if errorlevel 1 goto done
cd /d "%REPO%"
call npm run test:ab
if errorlevel 1 goto done
call npm run build:worker
if errorlevel 1 goto done
call npm run test:alerts
if errorlevel 1 goto done
call node scripts/verify-stocklab-071.mjs
if errorlevel 1 goto done
if exist .git\HEAD git status --short
 echo [OK] v0.7.1 staged in your LOCAL project only. GitHub and website NOT updated yet.
 echo Configure Firebase Secrets before pushing. See UPDATE_GUIDE.md.
:done
pause
