@echo off
setlocal enabledelayedexpansion
title Olympian Setup - Athena (Robinhood Chain)

rem ---------------------------------------------------------------------------
rem  OLYMPIAN SETUP - Athena (Robinhood Chain) one-shot installer (Windows)
rem  Steps: 1) Node check (warn-only)  2) git clone/pull  3) npm install
rem         4) npm run build  5) npm link  6) wizard if .env missing
rem  Critical failures: pause + exit /b 1
rem ---------------------------------------------------------------------------

rem --- ANSI colors if the console supports them, else plain text ---
set "ESC="
for /f %%i in ('echo prompt $E ^| cmd') do set "ESC=%%i"
if defined ESC (
  set "GREEN=%ESC%[0;32m"
  set "RED=%ESC%[0;31m"
  set "CYAN=%ESC%[0;36m"
  set "YELLOW=%ESC%[1;33m"
  set "BOLD=%ESC%[1m"
  set "NC=%ESC%[0m"
) else (
  set "GREEN="
  set "RED="
  set "CYAN="
  set "YELLOW="
  set "BOLD="
  set "NC="
)

echo.
echo %BOLD%                   /\%NC%
echo %BOLD%                  /  \%NC%
echo %BOLD%                 / /\ \%NC%
echo %BOLD%                / /  \ \%NC%
echo %BOLD%               / /____\ \%NC%
echo %BOLD%              /__________\%NC%
echo %BOLD%             ^|  ^|  ^|^|  ^|  ^|%NC%
echo %BOLD%             ^|  ^|  ^|^|  ^|  ^|%NC%
echo %CYAN%%BOLD%      PARTHENON OF ATHENA - OLYMPIAN SETUP%NC%
echo %CYAN%  Robinhood Chain (EVM 4663) - Multi-Agent Crypto Intelligence%NC%
echo.

rem --- [1/6] Runtime check (warn + continue) ---
echo %CYAN%%BOLD%--- [1/6] Runtime check ---%NC%
node --version >nul 2>&1
if errorlevel 1 (
  echo %YELLOW%Warning: Node.js not found. Install Node ^>= 22.12 from https://nodejs.org and re-run setup.%NC%
) else (
  node --version | findstr /R /C:"v2[2-9]" /C:"v[3-9][0-9]" >nul
  if errorlevel 1 (
    for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
    echo %YELLOW%Warning: found Node !NODE_VER! - Athena requires ^>= 22.12. Install from https://nodejs.org and re-run setup.%NC%
  ) else (
    echo %GREEN%Node %BOLD%found ^>= v22%NC%
  )
)
call npm --version >nul 2>&1
if errorlevel 1 (
  echo %RED%ERROR: npm not found. Install Node.js (includes npm) first.%NC%
  pause
  exit /b 1
)
echo %GREEN%OK: node + npm available%NC%

rem --- [2/6] Source code ---
echo %CYAN%%BOLD%--- [2/6] Source code ---%NC%
if not exist package.json (
  set "REPO_URL=https://github.com/dizcorvus/athena-ai-robinhood-chain.git"
  if defined ATHENA_REPO_URL set "REPO_URL=%ATHENA_REPO_URL%"
  echo %YELLOW%No repo found. Cloning %BOLD%!REPO_URL!%NC% ...
  git clone "!REPO_URL!" .
  if errorlevel 1 (
    echo %RED%ERROR: git clone failed.%NC%
    pause
    exit /b 1
  )
  echo %GREEN%Cloned into current directory%NC%
) else (
  git rev-parse --is-inside-work-tree >nul 2>&1
  if errorlevel 1 (
    echo %RED%ERROR: package.json exists but this is not a git repo - move the project or clone fresh.%NC%
    pause
    exit /b 1
  )
  echo %YELLOW%Existing repo detected. Running git pull --ff-only ...%NC%
  git pull --ff-only
  if errorlevel 1 (
    echo %YELLOW%Warning: git pull failed - continuing with local files.%NC%
  ) else (
    echo %GREEN%Code up to date%NC%
  )
)

rem --- [3/6] Dependencies ---
echo %CYAN%%BOLD%--- [3/6] Dependencies ---%NC%
call npm install
if errorlevel 1 (
  echo %RED%ERROR: npm install failed.%NC%
  pause
  exit /b 1
)
echo %GREEN%Dependencies installed%NC%

rem --- [4/6] Build ---
echo %CYAN%%BOLD%--- [4/6] Build ---%NC%
call npm run build
if errorlevel 1 (
  echo %RED%ERROR: npm run build failed.%NC%
  pause
  exit /b 1
)
echo %GREEN%TypeScript compiled to dist\%NC%

rem --- [5/6] CLI link ---
echo %CYAN%%BOLD%--- [5/6] CLI link ---%NC%
call npm link
if errorlevel 1 (
  echo %YELLOW%Warning: npm link failed (skip; use npx or node bin\athena.js).%NC%
) else (
  echo %GREEN%athena CLI linked%NC%
)

rem --- [6/6] Configuration ---
echo %CYAN%%BOLD%--- [6/6] Configuration ---%NC%
if not exist .env (
  echo %YELLOW%No .env found - launching Athena onboarding wizard ...%NC%
  call npm run wizard
  if errorlevel 1 echo %YELLOW%Warning: wizard did not complete - you can rerun it with "athena wizard".%NC%
) else (
  echo %YELLOW%.env already exists - skipping wizard (rerun: athena wizard)%NC%
)

rem --- Final summary ---
echo.
echo %GREEN%%BOLD%OK: ATHENA IS INSTALLED%NC%
echo %BOLD%Parthenon:%NC%  athena terminal     ^<-- command center TUI
echo %BOLD%Athena:%NC%     athena run          ^<-- dev  /  npx pm2 start dist\index.js --name athena-agent
echo %BOLD%Health:%NC%     athena doctor ^| athena test ^| athena update
echo.
pause
