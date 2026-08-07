#!/usr/bin/env node
/**
 * Athena self-update core — single source of truth for both entry points:
 *   - CLI: `athena update` (bin/athena.js -> npm run update)
 *   - Discord: `/update` (interaction-handler)
 *
 * Steps:
 *   1. git stash (kalau working tree kotor, supaya `git pull` tidak ditolak)
 *   2. git pull --ff-only
 *   3. git stash pop (kembalikan perubahan lokal; konflik tidak mematikan)
 *   4. npm install
 *   5. npm run build
 *   6. pm2 restart athena-agent (kecuali --no-restart)
 *
 * Fail-closed: pull/build gagal => exit code != 0 (Discord menampilkan error).
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SELF_DIR, '..');
const EXEC_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit per step (npm install bisa lama)

export function runAthenaUpdate({ noRestart = false, cwd = REPO_ROOT } = {}) {
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
        console.error(`✖ ${label} gagal (exit ${status})`);
      }
      return false;
    }
  };

  console.log('🔄 ATHENA SELF-UPDATE');
  console.log(`   repo: ${cwd} | node: ${process.version}`);
  console.log(`   mode: ${noRestart ? 'tanpa restart (--no-restart)' : 'dengan restart pm2'}`);

  // 1. Stash perubahan lokal supaya git pull tidak ditolak
  let stashed = false;
  try {
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' }).trim();
    if (status.length > 0) {
      console.log('\n⚠ Working tree tidak bersih — me-stash perubahan lokal dulu...');
      stashed = step('Stash perubahan lokal', 'git stash push -m athena-update', { ignore: true });
    } else {
      console.log('\n✓ Working tree bersih — tanpa stash.');
    }
  } catch {
    console.log('\n⚠ Tidak bisa membaca git status — lanjut pull.');
  }

  // 2. Pull
  const pullOk = step('git pull', 'git pull --ff-only');

  // 3. Kembalikan stash (konflik dibiarkan, user bisa selesaikan manual)
  if (stashed) {
    step('Kembalikan stash', 'git stash pop', { ignore: true });
  }

  // 4. Install dependencies
  const installOk = step('npm install', 'npm install');

  // 5. Build
  const buildOk = step('npm run build', 'npm run build');

  // 6. Restart pm2 (kecuali --no-restart)
  let restartOk = true;
  if (!noRestart) {
    console.log('\n▶ Restart PM2 agent');
    const pm2Cmd = 'pm2 restart athena-agent --update-env || npx pm2 restart athena-agent --update-env';
    try {
      execSync(pm2Cmd, { cwd, stdio: 'inherit', shell: true, timeout: 120000 });
      console.log('✅ PM2 agent restarted.');
      log.push({ label: 'pm2 restart', command: pm2Cmd, ok: true });
    } catch {
      restartOk = false;
      console.warn('⚠ pm2 tidak tersedia / agent tidak ditemukan — SKIP restart. (Jalankan `athena deploy` manual kalau perlu.)');
      log.push({ label: 'pm2 restart', command: pm2Cmd, ok: false });
    }
  } else {
    console.log('\n⏭ Skip pm2 restart (--no-restart).');
  }

  const allOk = pullOk && installOk && buildOk;
  console.log(`\n${allOk ? '✅' : '❌'} SELF-UPDATE ${allOk ? 'SELESAI' : 'DENGAN KEGAGALAN'}`);
  return { ok: allOk, restartOk, log };
}

// CLI entry: hanya dijalankan saat dieksekusi langsung (bukan di-import)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const noRestart = process.argv.includes('--no-restart');
  const result = runAthenaUpdate({ noRestart });
  process.exit(result.ok ? 0 : 1);
}
