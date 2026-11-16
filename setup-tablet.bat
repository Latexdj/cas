@echo off
setlocal EnableDelayedExpansion
title CAS Student - Tablet Setup
color 0A
echo.
echo  ====================================================
echo   CAS Student Tablet Setup Tool
echo  ====================================================
echo.

:: ── Find adb.exe ──────────────────────────────────────
where adb >nul 2>&1
if %errorlevel% equ 0 (
    set ADB=adb
    goto :found_adb
)
if exist "%~dp0adb.exe" (
    set ADB="%~dp0adb.exe"
    goto :found_adb
)
echo  ERROR: adb.exe not found.
echo.
echo  Place this script in the same folder as adb.exe, OR
echo  download Platform Tools and add it to your PATH.
echo.
echo  Download link:
echo  https://dl.google.com/android/repository/platform-tools-latest-windows.zip
echo.
pause
exit /b 1

:found_adb
:: ── Check for connected device ─────────────────────────
echo  Connect the tablet via USB with USB Debugging ON.
echo  Tap ALLOW on the tablet if a prompt appears.
echo.
echo  Current devices:
%ADB% devices
echo.
echo  Press any key when tablet shows as "device" above...
pause >nul
echo.

:: ── Grant storage permission ───────────────────────────
echo  [1/5] Granting storage access...
%ADB% shell appops set com.cas.student MANAGE_EXTERNAL_STORAGE allow
echo        Done.
echo.

:: ── Create app LM folder ──────────────────────────────
echo  [2/5] Creating app LM folder...
%ADB% shell "mkdir -p /storage/emulated/0/Android/data/com.cas.student/files/LM"
echo        Done.
echo.

:: ── Find the LM source folder ─────────────────────────
echo  [3/5] Looking for learning materials on tablet...
set LM_SRC=

:: Check common folder names
for %%F in ("LM" "Learning materials" "learning materials" "Learning Materials" "Lm" "lm") do (
    if "!LM_SRC!"=="" (
        %ADB% shell "test -d '/storage/emulated/0/%%~F' && echo FOUND" > "%TEMP%\cas_check.txt" 2>&1
        findstr /c:"FOUND" "%TEMP%\cas_check.txt" >nul 2>&1
        if !errorlevel! equ 0 (
            set LM_SRC=/storage/emulated/0/%%~F
        )
    )
)
del "%TEMP%\cas_check.txt" >nul 2>&1

if "!LM_SRC!"=="" (
    echo        NOT FOUND - no LM folder detected on tablet.
    echo        Transfer your LM files to the tablet first, then run this again.
    echo.
    echo        The folder can be named: LM  or  Learning materials
) else (
    echo        Found: !LM_SRC!
    echo        Copying files (this may take a few minutes)...
    %ADB% shell "cp -r '!LM_SRC!/.' /storage/emulated/0/Android/data/com.cas.student/files/LM/"
    echo        Done.
)
echo.

:: ── Past Questions pack ───────────────────────────────
:: Download the pack from Super Admin, Past Questions, "Download pack for USB",
:: unzip it, and copy the "Past Questions" folder onto the tablet, either
:: inside the LM folder (copied above) or on its own at the top level.
echo  [4/5] Looking for a Past Questions folder...
%ADB% shell "test -f '/storage/emulated/0/Past Questions/manifest.json' && echo FOUND" > "%TEMP%\cas_pq.txt" 2>&1
findstr /c:"FOUND" "%TEMP%\cas_pq.txt" >nul 2>&1
if !errorlevel! equ 0 (
    %ADB% shell "mkdir -p '/storage/emulated/0/Android/data/com.cas.student/files/LM/Past Questions'"
    %ADB% shell "cp -r '/storage/emulated/0/Past Questions/.' '/storage/emulated/0/Android/data/com.cas.student/files/LM/Past Questions/'"
    echo        Copied. The app loads the questions the next time Past Questions is opened.
) else (
    if not "!LM_SRC!"=="" (
        %ADB% shell "test -f '!LM_SRC!/Past Questions/manifest.json' && echo FOUND" > "%TEMP%\cas_pq.txt" 2>&1
        findstr /c:"FOUND" "%TEMP%\cas_pq.txt" >nul 2>&1
        if !errorlevel! equ 0 (
            echo        Found inside the LM folder; it was copied with the learning materials.
        ) else (
            echo        None found. Skipping. Tablets with internet download the questions themselves.
        )
    ) else (
        echo        None found. Skipping. Tablets with internet download the questions themselves.
    )
)
del "%TEMP%\cas_pq.txt" >nul 2>&1
echo.

:: ── Restart app ───────────────────────────────────────
echo  [5/5] Restarting CAS Student app...
%ADB% shell am force-stop com.cas.student
echo        Done.
echo.

echo  ====================================================
echo   All done! Open the CAS Student app on the tablet.
echo  ====================================================
echo.
pause
