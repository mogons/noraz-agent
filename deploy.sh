#!/usr/bin/env bash
# ==========================================
# Opencatz Autonomous Agent - One-Click Auto Installer & Deployment Script
# ==========================================

echo "🐾 Starting Opencatz Agent One-Click Auto Installer & Linker..."

# 1. Install dependencies, link CLI globally & build
echo "📦 Installing dependencies & linking 'opencatz' CLI globally..."
npm install
npm link
npm run build

# 2. Run Interactive Setup Wizard if .env missing
if [ ! -f .env ]; then
    echo "🧙 Running OpenCatz Interactive Setup Wizard..."
    node scripts/wizard.js
fi

# 3. Launch/Restart with PM2 24/7
echo "⚡ Launching OpenCatz Agent background process with PM2..."
npx pm2 restart opencatz-agent opencat-agent --update-env || npx pm2 start dist/index.js --name "opencatz-agent"
npx pm2 save

echo "======================================================"
echo "✅ OpenCatz Agent setup & linked globally!"
echo "💡 You can now use 'opencatz', 'opencatz run', 'opencatz terminal', 'opencatz deploy' anywhere!"
echo "📊 Run 'npx pm2 logs opencatz-agent' to view live logs."
echo "======================================================"
