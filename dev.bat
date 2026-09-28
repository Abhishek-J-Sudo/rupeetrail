@echo off
REM RupeeTrail for developers: the API with auto-reload plus Vite's live screens
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
    py -3 start.py --dev
) else (
    python start.py --dev
)
if errorlevel 1 pause
