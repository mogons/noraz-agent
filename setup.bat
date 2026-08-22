@echo off
setlocal enabledelayedexpansion
title OpenCatz Setup - Opencatz AI (Robinhood Chain)

rem ---------------------------------------------------------------------------
rem  OPENCATZ SETUP - Opencatz AI (Robinhood Chain) one-shot installer (Windows)
rem  Steps: 1) Runtime check  2) git clone/pull  3) npm install
rem         4) npm run build  5) npm link  6) wizard if .env missing
rem ---------------------------------------------------------------------------

rem --- ANSI colors if the console supports them ---
set "ESC="
for /f %%i in ('echo prompt $E ^| cmd') do set "ESC=%%i"
if defined ESC (
  set "LIME=%ESC%[38;2;204;255;0m"
  set "PINK=%ESC%[38;2;255;183;178m"
  set "LAVENDER=%ESC%[38;2;214;199;255m"
  set "CYAN=%ESC%[38;2;128;222;234m"
  set "YELLOW=%ESC%[38;2;255;245;157m"
  set "GOLD=%ESC%[38;2;255;215;0m"
  set "GREEN=%ESC%[38;2;0;230;118m"
  set "RED=%ESC%[38;2;229;57;53m"
  set "BOLD=%ESC%[1m"
  set "DIM=%ESC%[2m"
  set "NC=%ESC%[0m"
) else (
  set "LIME="
  set "PINK="
  set "LAVENDER="
  set "CYAN="
  set "YELLOW="
  set "GOLD="
  set "GREEN="
  set "RED="
  set "BOLD="
  set "DIM="
  set "NC="
)

echo.
echo %LIME%%BOLD%       /\_____/\%NC%
echo %LIME%%BOLD%      /  %PINK%■%LIME%   %PINK%■%LIME%  \      %LIME%🐾 OPENCATZ AI - SYSTEM SETUP 🐾%NC%
echo %LIME%%BOLD%     ( ==  %PINK%^^%LIME%  == )     %CYAN%Autonomous Multi-Agent Trading Swarm%NC%
echo %LIME%%BOLD%      )    %YELLOW%~%LIME%    (      %LAVENDER%Robinhood Chain EVM L2 • Chain ID: 4663%NC%
echo %LIME%%BOLD%     (   _____   )     %GOLD%"Chill trades, 9 lives, sharp alpha."%NC%
echo %LIME%%BOLD%    ( (  )   (  ) )%NC%
echo %LIME%%BOLD%   (__(__)___(__)__)%NC%
echo.

rem --- [1/6] Runtime check ---
echo %CYAN%%BOLD%▶ [1/6] Runtime Environment Check...%NC%
node --version >nul 2>&1
if errorlevel 1 (
  echo  %YELLOW%⚠ Warning: Node.js not found. Install Node ^>= 22.12 from https://nodejs.org and re-run setup.%NC%
) else (
  node --version | findstr /R /C:"v2[2-9]" /C:"v[3-9][0-9]" >nul
  if errorlevel 1 (
    for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
    echo  %YELLOW%⚠ Warning: found Node !NODE_VER! - OpenCatz requires ^>= 22.12.%NC%
  ) else (
    echo  %GREEN%✓%NC% Node found ^>= v22
  )
)
call npm --version >nul 2>&1
if errorlevel 1 (
  echo  %RED%✗ Error: npm not found. Install Node.js first.%NC%
  pause
  exit /b 1
)
echo  %GREEN%✓%NC% Node + npm available

rem --- [2/6] Source code ---
echo.
echo %CYAN%%BOLD%▶ [2/6] Preparing Repository Codebase...%NC%
if not exist package.json (
  set "REPO_URL=https://github.com/dizcorvus/opencatz-ai-robinhood-chain.git"
  if defined OPENCATZ_REPO_URL set "REPO_URL=%OPENCATZ_REPO_URL%"
  if defined OPENCAT_REPO_URL set "REPO_URL=%OPENCAT_REPO_URL%"
  echo  %DIM%Cloning !REPO_URL! ...%NC%
  git clone "!REPO_URL!" .
  if errorlevel 1 (
    echo  %RED%✗ Error: git clone failed.%NC%
    pause
    exit /b 1
  )
  echo  %GREEN%✓%NC% Cloned into current directory
) else (
  git rev-parse --is-inside-work-tree >nul 2>&1
  if errorlevel 1 (
    echo  %RED%✗ Error: package.json exists but this is not a git repo.%NC%
    pause
    exit /b 1
  )
  echo  %DIM%Existing repo detected. Running git pull ...%NC%
  git pull --ff-only
  if errorlevel 1 (
    echo  %YELLOW%⚠ Warning: git pull failed - continuing with local files.%NC%
  ) else (
    echo  %GREEN%✓%NC% Codebase is up to date
  )
)

rem --- [3/6] Dependencies ---
echo.
echo %CYAN%%BOLD%▶ [3/6] Installing Dependencies...%NC%
call npm install
if errorlevel 1 (
  echo  %RED%✗ Error: npm install failed.%NC%
  pause
  exit /b 1
)
echo  %GREEN%✓%NC% Dependencies installed successfully

rem --- [4/6] Build ---
echo.
echo %CYAN%%BOLD%▶ [4/6] Compiling TypeScript Codebase...%NC%
call npm run build
if errorlevel 1 (
  echo  %RED%✗ Error: npm run build failed.%NC%
  pause
  exit /b 1
)
echo  %GREEN%✓%NC% TypeScript compiled to /dist

rem --- [5/6] CLI link ---
echo.
echo %CYAN%%BOLD%▶ [5/6] Linking Global CLI Binary...%NC%
call npm link
if errorlevel 1 (
  echo  %YELLOW%⚠ Warning: npm link failed (skip; use node bin\opencatz.js).%NC%
) else (
  echo  %GREEN%✓%NC% opencatz CLI linked globally
)

rem --- [6/6] Configuration ---
echo.
echo %CYAN%%BOLD%▶ [6/6] Master Onboarding Configuration...%NC%
if not exist .env (
  echo  %YELLOW%No .env found - launching OpenCatz onboarding wizard ...%NC%
  call npm run wizard
  if errorlevel 1 echo  %YELLOW%Warning: wizard did not complete - rerun anytime with "opencatz wizard".%NC%
) else (
  echo  %GREEN%✓%NC% Configuration .env found. (Re-run anytime: %CYAN%opencatz onboard%NC%)
)

rem --- Final summary ---
echo.
echo %LIME%%BOLD%========================================================================%NC%
echo %LIME%%BOLD%   🐾 OPENCATZ AI INSTALLED SUCCESSFULLY! (ROBINHOOD CHAIN EVM)        %NC%
echo %LIME%%BOLD%========================================================================%NC%
echo    %BOLD%1. Setup ^& Keys:%NC%    %CYAN%opencatz onboard%NC%    %DIM%(or npm run wizard)%NC%
echo    %BOLD%2. Command TUI:%NC%     %CYAN%opencatz terminal%NC%   %DIM%(interactive terminal UI)%NC%
echo    %BOLD%3. Live Screener:%NC%   %CYAN%opencatz run%NC%        %DIM%(real-time signals ^& trading)%NC%
echo    %BOLD%4. 24/7 PM2 Daemon:%NC% %CYAN%opencatz deploy%NC%     %DIM%(Cat Den background daemon)%NC%
echo    %BOLD%5. Diagnostics:%NC%     %CYAN%opencatz doctor%NC%     %DIM%(health ^& RPC latency checks)%NC%
echo.
echo    %BOLD%Documentation:%NC%   %LAVENDER%https://opencatz.xyz/docs%NC%
echo.
pause
