#!/usr/bin/env bash
set -euo pipefail

# 🐾 OPENCATZ 24/7 PM2 DEPLOYMENT (Cat Den)
# Usage: bash deploy.sh (or: opencatz deploy / npm run deploy)

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

step() { printf "\n%b\n" "${CYAN}${BOLD}▶ [$1/3] $2${NC}"; }
ok()   { printf "%b\n" " ${GREEN}✓${NC} $1"; }
warn() { printf "%b\n" " ${YELLOW}⚠ $1${NC}"; }

printf "\n"
printf "%b\n" "${LIME}${BOLD}       /\\_____/\\${NC}"
printf "%b\n" "${LIME}${BOLD}      /  ${PINK}■${LIME}   ${PINK}■${LIME}  \\      ${LIME}🐾 OPENCATZ AI — 24/7 PM2 DEPLOYER 🐾${NC}"
printf "%b\n" "${LIME}${BOLD}     ( ==  ${PINK}^${LIME}  == )     ${CYAN}Autonomous Multi-Agent Trading Swarm${NC}"
printf "%b\n" "${LIME}${BOLD}      )    ${YELLOW}~${LIME}    (      ${LAVENDER}Robinhood Chain EVM L2 • Chain ID: 4663${NC}"
printf "%b\n" "${LIME}${BOLD}     (   _____   )     ${GOLD}\"Chill trades, 9 lives, sharp alpha.\"${NC}"
printf "%b\n" "${LIME}${BOLD}    ( (  )   (  ) )${NC}"
printf "%b\n" "${LIME}${BOLD}   (__(__)___(__)__)${NC}"
printf "\n"

step 1 "Compiling & Linking CLI"
npm install --silent || true
npm link 2>/dev/null && ok "opencatz global CLI linked" || warn "npm link skipped"
npm run build
ok "TypeScript build compiled to /dist"

step 2 "Environment Verification"
if [ ! -f .env ]; then
  printf "%b\n" " ${YELLOW}No .env detected. Launching Onboarding Wizard...${NC}"
  node scripts/wizard.js
else
  ok "Configuration .env detected"
fi

step 3 "Launching 24/7 PM2 Daemon (Cat Den)"
npx pm2 restart opencatz-agent opencat-agent --update-env 2>/dev/null || npx pm2 start dist/index.js --name "opencatz-agent"
npx pm2 save >/dev/null 2>&1 || true
ok "PM2 daemon 'opencatz-agent' is active"

printf "\n%b\n" "${LIME}${BOLD}========================================================================${NC}"
printf "%b\n" "${LIME}${BOLD}   🌲 OPENCATZ AI DEPLOYED 24/7 TO CAT DEN (PM2)                       ${NC}"
printf "%b\n" "${LIME}${BOLD}========================================================================${NC}"
printf "%b\n" "   ${BOLD}View live logs:${NC}  ${CYAN}npx pm2 logs opencatz-agent${NC}"
printf "%b\n" "   ${BOLD}Process status:${NC}  ${CYAN}npx pm2 status${NC}"
printf "%b\n" "   ${BOLD}Command Center:${NC}  ${CYAN}opencatz terminal${NC}"
printf "%b\n" "   ${BOLD}Diagnostics:${NC}     ${CYAN}opencatz doctor${NC}\n"
