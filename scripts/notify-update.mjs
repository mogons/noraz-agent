/**
 * Olympian deploy notifications — sends the self-update result to Telegram
 * and (optionally) a Discord webhook. Never throws; failures are logged.
 */
export async function notifyUpdate({ ok, restartOk, steps = [], noRestart = false }) {
  const lines = steps.map((s) => `• ${s.label}: ${s.ok ? '✅' : '❌'}`).join('\n');
  const status = restartOk === null ? '⚠️ COMPLETE (restart scheduled — confirm after boot)' : ok && restartOk ? '✅ COMPLETE' : ok ? '⚠️ COMPLETE (restart pending)' : '❌ FAILED';
  const text = [
    `⚡ Olympian Update — Athena self-update ${status}`,
    `Repo: ${process.cwd()}`,
    '',
    lines,
    restartOk === null ? '🔄 PM2 restart scheduled — final status is reported to Discord after boot.' : noRestart ? '⏭ PM2 restart skipped (--no-restart).' : restartOk ? '🔄 PM2 agent restarted — new code is live on Mount Olympus.' : '⚠ PM2 restart failed — run `athena deploy` manually.',
    ok ? '' : '🩺 Tip: run `athena doctor` to diagnose.',
  ].join('\n');

  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text, disable_web_page_preview: true }),
      });
      if (!res.ok) console.warn(`⚠ Telegram notify HTTP ${res.status}`);
      else console.log('✅ Deploy notification sent to Telegram.');
    } catch (err) {
      console.warn(`⚠ Telegram notify failed: ${err.message}`);
    }
  }

  const webhook = process.env.DISCORD_DEPLOY_WEBHOOK_URL;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: null,
          embeds: [{
            title: ok ? '⚡ Athena Self-Update Complete' : '❌ Athena Self-Update Failed',
            color: ok ? 0x2ecc71 : 0xe74c3c,
            description: text,
            timestamp: new Date().toISOString(),
            footer: { text: 'Olympian — Mount Olympus Ops' },
          }],
        }),
      });
      if (!res.ok) console.warn(`⚠ Discord webhook HTTP ${res.status}`);
      else console.log('✅ Deploy notification sent to Discord webhook.');
    } catch (err) {
      console.warn(`⚠ Discord webhook failed: ${err.message}`);
    }
  }
}
