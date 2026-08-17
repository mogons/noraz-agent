/**
 * OpenCat self-update core — single source of truth for both entry points:
 *   - CLI: `opencat update` (bin/opencat.js -> npm run update)
 *   - Discord: `/update` (interaction-handler)
 *
 * Steps:
 *   1. git stash (if the working tree is dirty, so `git pull` is not rejected)
 *   2. git pull --ff-only
 *   3. git stash pop (restore local changes; conflicts are non-fatal)
 *   4. npm install
 *   5. npm run build
 *   6. pm2 restart opencat-agent (unless --no-restart)
 *
 * Fail-closed: pull/build failure => exit code != 0 (Discord shows the error).
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SELF_DIR, '..');
const EXEC_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per step (npm install can be slow)

export async function runOpenCatUpdate({ noRestart = false, cwd = REPO_ROOT } = {}) {
  const log = [];
  const step = (label, command, { ignore = false } = {}) => {
    console.log(`\n▶ ${label}`);
    console.log(`$ ${command}`);
    try {
      execSync(command, { cwd, stdio: 'inherit', shell: true, timeout: EXEC_TIMEOUT_MS });
      log.push({ label, command, ok: true });
      return true;
    } catch (err) {
      log.push({ label, command, ok: false });
      if (!ignore) {
        const status = err?.status ?? 'unknown';
        console.error(`✖ ${label} failed (exit ${status})`);
      }
      return false;
    }
  };

  console.log('🔄 OPENCAT AI SELF-UPDATE');
  console.log(`   repo: ${cwd} | node: ${process.version}`);
  console.log(`   mode: ${noRestart ? 'without restart (--no-restart)' : 'with pm2 restart'}`);

  // 1. Stash local changes so git pull is not rejected
  let stashed = false;
  try {
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' }).trim();
    if (status.length > 0) {
      console.log('\n⚠ Working tree is dirty — stashing local changes first...');
      stashed = step('Stash local changes', 'git stash push -m opencat-update', { ignore: true });
    } else {
      console.log('\n✓ Working tree is clean — no stash needed.');
    }
  } catch {
    console.log('\n⚠ Could not read git status — proceeding with pull.');
  }

  // 2. Pull
  const pullOk = step('git pull', 'git pull --ff-only');

  // 3. Restore the stash (conflicts are left for the user to resolve manually)
  if (stashed) {
    step('Restore stash', 'git stash pop', { ignore: true });
  }

  // 4. Install dependencies
  const installOk = step('npm install', 'npm install');

  // 5. Build
  const buildOk = step('npm run build', 'npm run build');

  const allOk = pullOk && installOk && buildOk;

  // 5b. Notifications (Telegram + Discord webhook) — non-fatal
  try {
    const { notifyUpdate } = await import('./notify-update.mjs');
    await notifyUpdate({ ok: allOk, restartOk: null, steps: log, noRestart });
  } catch (err) {
    console.warn(`⚠ Deploy notification failed (non-fatal): ${err.message}`);
  }

  // 6. Restart pm2 (unless --no-restart)
  let restartOk = true;
  if (!noRestart) {
    console.log('\n▶ Restart PM2 agent (detached — the update process is not killed by itself)');
    const pm2Cmd = 'pm2 restart opencat-agent --update-env || npx pm2 restart opencat-agent --update-env || pm2 restart athena-agent --update-env || npx pm2 restart athena-agent --update-env';
    try {
      const child = spawn('sh', ['-c', `sleep 3 && ${pm2Cmd}`], {
        detached: true,
        stdio: 'ignore',
        cwd,
      });
      child.on('error', (err) => {
        restartOk = false;
        console.warn(`⚠ Gagal spawn restart: ${err.message}`);
      });
      child.unref();
      console.log('✅ PM2 restart scheduled (detached, +3s).');
      log.push({ label: 'pm2 restart (detached)', command: pm2Cmd, ok: true });
    } catch (err) {
      restartOk = false;
      console.warn(`⚠ Gagal menjadwalkan restart: ${err.message}`);
      log.push({ label: 'pm2 restart (detached)', command: pm2Cmd, ok: false });
    }
  } else {
    console.log('\n⏭ Skip pm2 restart (--no-restart).');
  }

  try {
    const reportPath = path.join(REPO_ROOT, 'database', 'last_update_report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        ok: allOk,
        restartOk,
        steps: log,
        finishedAt: new Date().toISOString(),
      }, null, 2),
      'utf-8'
    );
    console.log('📄 Laporan update ditulis ke database/last_update_report.json');
  } catch (reportErr) {
    console.warn(`⚠ Failed to write update report: ${reportErr.message}`);
  }

  console.log(`\n${allOk ? '✅' : '❌'} SELF-UPDATE ${allOk ? 'SELESAI' : 'DENGAN KEGAGALAN'}`);
  return { ok: allOk, restartOk, log };
}

export const runAthenaUpdate = runOpenCatUpdate;

// CLI entry: only runs when executed directly (not when imported)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const noRestart = process.argv.includes('--no-restart');
  const result = await runOpenCatUpdate({ noRestart });
  process.exit(result.ok ? 0 : 1);
}
