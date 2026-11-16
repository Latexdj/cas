@echo off
setlocal
title CAS School Server - Uninstall

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Please right-click uninstall.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo.
echo  Removing the CAS School Server...
schtasks /end /tn "CAS School Server" >nul 2>&1
schtasks /delete /tn "CAS School Server" /f >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*CAS-School-Server*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
netsh advfirewall firewall delete rule name="CAS School Server" >nul 2>&1

echo.
echo  The server is stopped and will no longer start with Windows.
echo  Its files and data are still in C:\CAS-School-Server; delete that folder to remove them.
echo.
pause
