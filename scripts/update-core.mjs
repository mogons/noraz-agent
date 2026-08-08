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

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
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

  const allOk = pullOk && installOk && buildOk;

  // 6. Restart pm2 (kecuali --no-restart)
  // Penting: restart dijalankan DETACHED + delay (proses terpisah). Kalau
  // dieksekusi sinkron dari dalam proses bot, pm2 akan menghentikan proses
  // bot ini di tengah execSync → execSync terputus → restart "dilaporkan"
  // gagal padahal sebenarnya berhasil (bot online). Detached + unref membuat
  // restart jalan mandiri di pm2 daemon tanpa membunuh proses update dulu.
  // Delay 3s memberi waktu proses update menulis laporan & return sebelum
  // pm2 restart menghentikan proses ini.
  let restartOk = true;
  if (!noRestart) {
    console.log('\n▶ Restart PM2 agent (detached — proses update tidak dimatikan sendiri)');
    const pm2Cmd = 'pm2 restart athena-agent --update-env || npx pm2 restart athena-agent --update-env';
    try {
      const child = spawn('sh', ['-c', `sleep 3 && ${pm2Cmd}`], {
        detached: true,
        stdio: 'ignore',
        cwd,
      });
      // spawn error adalah async event — tanpa handler ini proses bisa crash
      // (mis. di Windows yang tidak punya `sh`). VPS Linux selalu punya `sh`.
      child.on('error', (err) => {
        restartOk = false;
        console.warn(`⚠ Gagal spawn restart: ${err.message}`);
      });
      child.unref();
      console.log('✅ PM2 restart dijadwalkan (detached, +3s).');
      log.push({ label: 'pm2 restart (detached)', command: pm2Cmd, ok: true });
    } catch (err) {
      restartOk = false;
      console.warn(`⚠ Gagal menjadwalkan restart: ${err.message}`);
      log.push({ label: 'pm2 restart (detached)', command: pm2Cmd, ok: false });
    }
  } else {
    console.log('\n⏭ Skip pm2 restart (--no-restart).');
  }

  // Tulis laporan ke file agar proses yang baru (setelah restart) bisa
  // mengirim laporan update ke Discord — restart akan membunuh proses lama.
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
    console.warn(`⚠ Gagal menulis laporan update: ${reportErr.message}`);
  }

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
