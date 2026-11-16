@echo off
rem Keeps the CAS School Server running: restarts it 5 seconds after it stops.
cd /d "%~dp0"
:loop
"%~dp0node.exe" "%~dp0server.js"
ping -n 6 127.0.0.1 >nul
goto loop
