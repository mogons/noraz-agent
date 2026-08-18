#!/usr/bin/env bash
set -euo pipefail

# 🐾 OPENCATZ SETUP — Opencatz AI (Robinhood Chain) one-shot installer
# Usage: bash setup.sh   (fresh install: run inside an empty dir, or clone first)

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; LIME='\033[38;2;204;255;0m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${CYAN}${BOLD}▶ [$1/6] $2${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo -e "${BOLD}${LIME}
       /\_____/\
      /  ■   ■  \      🐾 OPENCATZ AI — SYSTEM SETUP 🐾
     ( ==  ^  == )     Robinhood Chain (EVM 4663)
      )    ~    (      Multi-Agent Crypto Trading Swarm
     (   _____   )
    ( (  )   (  ) )
   (__(__)___(__)__)${NC}"

step 1 "Runtime check"
node --version | grep -qE '^v(2[2-9]|[3-9][0-9])' || fail "Node >= 22.12 required (found: $(node --version)). Install via https://nodejs.org"
command -v npm >/dev/null || fail "npm not found"
ok "Node $(node --version) + npm"

step 2 "Source code"
if [ ! -f package.json ]; then
  REPO_URL="${OPENCATZ_REPO_URL:-${OPENCAT_REPO_URL:-https://github.com/dizcorvus/opencat-ai-robinhood-chain.git}}"
  echo -e "No repo found. Cloning ${YELLOW}${REPO_URL}${NC} ..."
  git clone "$REPO_URL" . || fail "git clone failed"
  ok "Cloned into current directory"
elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo -e "Existing repo detected. Running ${YELLOW}git pull${NC} ..."
  git pull --ff-only || echo -e "${YELLOW}⚠ git pull failed — continuing with local files${NC}"
  ok "Code up to date"
else
  fail "package.json exists but this is not a git repo — move the project or clone fresh"
fi

step 3 "Dependencies"
npm install || fail "npm install failed"
ok "Dependencies installed"

step 4 "Build"
npm run build || fail "npm run build failed"
ok "TypeScript compiled to dist/"

step 5 "CLI link"
npm link 2>/dev/null && ok "opencatz CLI linked" || echo -e "${YELLOW}⚠ npm link failed (skip; use npx/node bin/opencatz.js)${NC}"

step 6 "Configuration & launch"
if [ ! -f .env ]; then
  echo -e "No .env found — launching ${YELLOW}Opencatz onboarding wizard${NC} ..."
  npm run wizard
else
  echo -e "${YELLOW}.env already exists — skipping wizard (rerun: opencatz wizard)${NC}"
fi

echo -e "\n${GREEN}${BOLD}✅ OPENCATZ IS INSTALLED${NC}"
echo -e "${BOLD}Command Center:${NC} opencatz terminal     # command center TUI"
echo -e "${BOLD}OpenCatz Engine:${NC} opencatz run          # dev / opencatz deploy (PM2, Cat Den)"
echo -e "${BOLD}Health check:${NC}   opencatz doctor | opencatz test | opencatz update"
