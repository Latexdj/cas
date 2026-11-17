@echo off
setlocal
title CAS School Server - Install

rem Needs administrator rights (firewall rule and start-up task).
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Please right-click install.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

set "TARGET=C:\CAS-School-Server"
echo.
echo  ====================================================
echo   CAS School Server - Install
echo  ====================================================
echo.

if not exist "%~dp0node.exe" (
    echo  ERROR: node.exe is missing from this folder. Use the complete CAS-School-Server zip.
    pause
    exit /b 1
)

echo  [1/5] Stopping any running copy...
schtasks /end /tn "CAS School Server" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*CAS-School-Server*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo  [2/5] Copying files to %TARGET% (your data is kept)...
if not exist "%TARGET%" mkdir "%TARGET%"
for %%F in (node.exe server.js lms.js admin.html teacher.html run.bat uninstall.bat README.txt) do copy /y "%~dp0%%F" "%TARGET%\%%F" >nul
if not exist "%TARGET%\vendor" mkdir "%TARGET%\vendor"
copy /y "%~dp0vendor\*" "%TARGET%\vendor\" >nul

echo  [3/5] Allowing tablets through the firewall (port 8787)...
netsh advfirewall firewall delete rule name="CAS School Server" >nul 2>&1
netsh advfirewall firewall add rule name="CAS School Server" dir=in action=allow protocol=TCP localport=8787 profile=any >nul

echo  [4/5] Starting automatically with Windows, and keeping the PC awake...
schtasks /create /tn "CAS School Server" /tr "\"%TARGET%\run.bat\"" /sc onstart /ru SYSTEM /rl HIGHEST /f >nul
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1

echo  [5/5] Starting the server...
schtasks /run /tn "CAS School Server" >nul
ping -n 5 127.0.0.1 >nul
start "" "http://localhost:8787/"

echo.
echo  Done. The CAS School Server is running and starts with Windows.
echo  Its page is open in your browser: http://localhost:8787
echo.
pause
