@echo off
title Athena One-Click Setup & Installer
echo ======================================================
echo 🏛️ ATHENA ONE-CLICK AUTOMATIC INSTALLER & SETUP
echo ======================================================
echo.

echo 📦 [1/4] Installing npm dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to install dependencies.
    pause
    exit /b %ERRORLEVEL%
)

echo 🔗 [2/4] Linking 'athena' CLI globally...
call npm link
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️ Failed to link CLI globally. Continuing...
)

echo ⚙️ [3/4] Compiling TypeScript codebase...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to compile TypeScript.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ======================================================
echo ✅ Athena is installed & linked globally!
echo 💡 You can now run 'athena', 'athena run', 'athena wizard', 'athena terminal' anywhere!
echo ======================================================
echo.

echo 🧙 [4/4] Launching Interactive Configuration Wizard...
call npm run wizard

pause
