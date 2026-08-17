#!/usr/bin/env bash
# ==========================================
# Opencat Autonomous Agent - One-Click Auto Installer & Deployment Script
# ==========================================

echo "🐾 Starting Opencat Agent One-Click Auto Installer & Linker..."

# 1. Install dependencies, link CLI globally & build
echo "📦 Installing dependencies & linking 'opencat' CLI globally..."
npm install
npm link
npm run build

# 2. Run Interactive Setup Wizard if .env missing
if [ ! -f .env ]; then
    echo "🧙 Running OpenCat Interactive Setup Wizard..."
    node scripts/wizard.js
fi

# 3. Launch/Restart with PM2 24/7
echo "⚡ Launching OpenCat Agent background process with PM2..."
npx pm2 restart opencat-agent --update-env || npx pm2 start dist/index.js --name "opencat-agent"
npx pm2 save

echo "======================================================"
echo "✅ OpenCat Agent setup & linked globally!"
echo "💡 You can now use 'opencat', 'opencat run', 'opencat terminal', 'opencat deploy' anywhere!"
echo "📊 Run 'npx pm2 logs opencat-agent' to view live logs."
echo "======================================================"
