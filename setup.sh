#!/usr/bin/env bash
set -euo pipefail

# 🐾 OPENCATZ SETUP — Opencatz AI (Robinhood Chain) one-shot installer
# Usage: bash setup.sh   (fresh install: run inside an empty dir, or clone first)

# 24-Bit TrueColor RGB Palette (OpenCatz Master Design System)
LIME='\033[38;2;204;255;0m'       # #CCFF00 Robinhood Green (Legendary Hero)
PINK='\033[38;2;255;183;178m'     # #FFB7B2 Pastel Pink (Meme / Accents)
LAVENDER='\033[38;2;214;199;255m' # #D6C7FF Lavender Purple (NFT / Chain)
CYAN='\033[38;2;128;222;234m'     # #80DEEA Retro Cyan (LP / Info)
YELLOW='\033[38;2;255;245;157m'   # #FFF59D Pastel Yellow (Alpha / Warn)
GOLD='\033[38;2;255;215;0m'       # #FFD700 Golden Fortune
RED='\033[38;2;229;57;53m'        # #E53935 Maneki-Neko Red (Error / Alert)
GREEN='\033[38;2;0;230;118m'      # #00E676 Jade Spirit (Success)
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

step() { printf "\n%b\n" "${CYAN}${BOLD}▶ [$1/6] $2${NC}"; }
ok()   { printf "%b\n" " ${GREEN}✓${NC} $1"; }
fail() { printf "%b\n" " ${RED}✗ $1${NC}"; exit 1; }
warn() { printf "%b\n" " ${YELLOW}⚠ $1${NC}"; }

printf "\n"
printf "%b\n" "${LIME}${BOLD}       /\\_____/\\${NC}"
printf "%b\n" "${LIME}${BOLD}      /  ${PINK}■${LIME}   ${PINK}■${LIME}  \\      ${LIME}🐾 OPENCATZ AI — SYSTEM SETUP 🐾${NC}"
printf "%b\n" "${LIME}${BOLD}     ( ==  ${PINK}^${LIME}  == )     ${CYAN}Autonomous Multi-Agent Trading Swarm${NC}"
printf "%b\n" "${LIME}${BOLD}      )    ${YELLOW}~${LIME}    (      ${LAVENDER}Robinhood Chain EVM L2 • Chain ID: 4663${NC}"
printf "%b\n" "${LIME}${BOLD}     (   _____   )     ${GOLD}\"Chill trades, 9 lives, sharp alpha.\"${NC}"
printf "%b\n" "${LIME}${BOLD}    ( (  )   (  ) )${NC}"
printf "%b\n" "${LIME}${BOLD}   (__(__)___(__)__)${NC}"
printf "\n"

step 1 "Runtime Environment Check"
node --version | grep -qE '^v(2[2-9]|[3-9][0-9])' || fail "Node >= 22.12 required (found: $(node --version)). Install via https://nodejs.org"
command -v npm >/dev/null || fail "npm not found"
ok "Node $(node --version) + npm $(npm --version)"

step 2 "Source Codebase Preparation"
if [ ! -f package.json ]; then
  REPO_URL="${OPENCATZ_REPO_URL:-${OPENCAT_REPO_URL:-https://github.com/dizcorvus/opencatz-ai-robinhood-chain.git}}"
  printf "%b\n" " ${DIM}No local package.json found. Cloning ${LIME}${REPO_URL}${NC} ...${NC}"
  git clone "$REPO_URL" . || fail "git clone failed"
  ok "Cloned into current directory"
elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf "%b\n" " ${DIM}Existing git repository detected. Running sync...${NC}"
  git pull --ff-only || warn "git pull skipped — continuing with local workspace files"
  ok "Codebase is up to date"
else
  fail "package.json exists but this is not a git repo — move the project or clone fresh"
fi

step 3 "Installing Dependencies"
npm install || fail "npm install failed"
ok "Dependencies installed successfully"

step 4 "Compiling TypeScript Engine"
npm run build || fail "npm run build failed"
ok "TypeScript compiled to /dist"

step 5 "Linking Global CLI Binary"
npm link 2>/dev/null && ok "Global 'opencatz' command linked" || warn "npm link skipped (use 'node bin/opencatz.js' or 'npm run <cmd>')"

step 6 "Master Onboarding Configuration"
if [ ! -f .env ]; then
  printf "\n%b\n" " ${YELLOW}No .env found — launching OpenCatz Master Onboarding Wizard...${NC}"
  npm run wizard
else
  printf "%b\n" " ${GREEN}✓${NC} Configuration .env found. (Re-run anytime: ${CYAN}opencatz onboard${NC})"
fi

printf "\n%b\n" "${LIME}${BOLD}========================================================================${NC}"
printf "%b\n" "${LIME}${BOLD}   🐾 OPENCATZ AI INSTALLED SUCCESSFULLY! (ROBINHOOD CHAIN EVM)        ${NC}"
printf "%b\n" "${LIME}${BOLD}========================================================================${NC}"
printf "%b\n" "   ${BOLD}1. Setup & Keys:${NC}    ${CYAN}opencatz onboard${NC}    ${DIM}(or npm run wizard)${NC}"
printf "%b\n" "   ${BOLD}2. Command TUI:${NC}     ${CYAN}opencatz terminal${NC}   ${DIM}(interactive terminal UI)${NC}"
printf "%b\n" "   ${BOLD}3. Live Screener:${NC}   ${CYAN}opencatz run${NC}        ${DIM}(real-time signals & trading)${NC}"
printf "%b\n" "   ${BOLD}4. 24/7 PM2 Daemon:${NC} ${CYAN}opencatz deploy${NC}     ${DIM}(Cat Den background daemon)${NC}"
printf "%b\n" "   ${BOLD}5. Diagnostics:${NC}     ${CYAN}opencatz doctor${NC}     ${DIM}(health & RPC latency checks)${NC}"
printf "\n%b\n" "   ${BOLD}Documentation:${NC}   ${LAVENDER}https://opencatz.xyz/docs${NC}\n"
