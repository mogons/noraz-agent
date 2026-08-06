#!/usr/bin/env bash
# ==========================================
# Athena Autonomous Agent - One-Click Auto Installer & Deployment Script
# ==========================================

echo "🏛️ Starting Athena Agent One-Click Auto Installer & Linker..."

# 1. Install dependencies, link CLI globally & build
echo "📦 Installing dependencies & linking 'athena' CLI globally..."
npm install
npm link
npm run build

# 2. Run Interactive Setup Wizard if .env missing
if [ ! -f .env ]; then
    echo "🧙 Running Athena Interactive Setup Wizard..."
    node scripts/wizard.js
fi

# 3. Launch/Restart with PM2 24/7
echo "⚡ Launching Athena Agent background process with PM2..."
npx pm2 restart athena-agent --update-env || npx pm2 start dist/index.js --name "athena-agent"
npx pm2 save

echo "======================================================"
echo "✅ Athena Agent setup & linked globally!"
echo "💡 You can now use 'athena', 'athena run', 'athena terminal', 'athena deploy' anywhere!"
echo "📊 Run 'npx pm2 logs athena-agent' to view live logs."
echo "======================================================"
