@echo off
REM RupeeTrail: double-click to start. Developers: dev.bat
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
    py -3 start.py %*
) else (
    python start.py %*
)
if errorlevel 1 pause
