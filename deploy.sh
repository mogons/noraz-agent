#!/usr/bin/env bash
# ==========================================
# Athena Autonomous Agent - One-Click Deploy Script
# ==========================================

echo "🚀 Starting Athena Agent One-Click Deployment..."

# 1. Run Interactive Setup Wizard if .env missing or requested
if [ ! -f .env ]; then
    echo "🧙 Running Athena Interactive Setup Wizard..."
    node scripts/wizard.js
fi

# 2. Install dependencies & Build
echo "📦 Installing dependencies & building project..."
npm install
npm run build

# 3. Launch/Restart with PM2 24/7
echo "⚡ Launching Athena Agent background process with PM2..."
npx pm2 restart athena-agent --update-env || npx pm2 start dist/index.js --name "athena-agent"
npx pm2 save

echo "✅ Athena Agent is now RUNNING 24/7 in background!"
echo "📊 Run 'npx pm2 logs athena-agent' to view live logs."
