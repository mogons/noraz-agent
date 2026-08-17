#!/usr/bin/env node

/**
 * Opencat AI (Robinhood Chain Edition) — Clean Uninstall Script
 * Safely stops background PM2 daemons, resets database state, cleans build artifacts,
 * and purges local credentials/environment configuration.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const isForce = args.includes('--force') || args.includes('-f') || args.includes('--purge');
const keepEnv = args.includes('--keep-env');
const keepData = args.includes('--keep-data');
const keepModules = args.includes('--keep-modules');

// Terminal Colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  lime: '\x1b[38;2;204;255;0m',
};

console.log(`
${C.lime}${C.bold}
       /\\_____/\\
      /  o   o  \\      🐾 OPENCAT AI — CLEAN UNINSTALLER 🐾
     ( ==  ^  == )     Autonomous Multi-Agent System Reset
      )         (      Robinhood Chain EVM L2 #4663
     (   _____   )
    ( (  )   (  ) )
   (__(__)___(__)__)
${C.reset}`);

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

function removePath(targetPath, description) {
  const fullPath = path.resolve(rootDir, targetPath);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(` ${C.green}✓${C.reset} Removed ${C.bold}${targetPath}${C.reset} (${description})`);
    } catch (err) {
      console.log(` ${C.red}✗${C.reset} Failed to remove ${targetPath}: ${err.message}`);
    }
  } else {
    console.log(` ${C.gray}•${C.reset} ${targetPath} does not exist (skipped)`);
  }
}

async function main() {
  console.log(` ${C.yellow}⚠ Warning: This operation will uninstall Opencat AI services and clean local data.${C.reset}\n`);

  if (!isForce) {
    const confirm = await askQuestion(` ${C.bold}Are you sure you want to proceed with Clean Uninstall? (y/N): ${C.reset}`);
    if (confirm.trim().toLowerCase() !== 'y' && confirm.trim().toLowerCase() !== 'yes') {
      console.log(`\n ${C.yellow}Uninstall canceled by user.${C.reset}\n`);
      process.exit(0);
    }
  }

  console.log(`\n${C.cyan}${C.bold}🧹 STARTING CLEAN UNINSTALLATION...${C.reset}\n`);

  // 1. PM2 Process Stop & Delete
  console.log(` ${C.bold}[1/5] Stopping PM2 Background Process...${C.reset}`);
  try {
    execSync('npx pm2 delete opencat-agent || npx pm2 delete athena-agent', { stdio: 'ignore' });
    console.log(` ${C.green}✓${C.reset} PM2 daemon ${C.bold}opencat-agent${C.reset} stopped and deleted.`);
  } catch (_err) {
    console.log(` ${C.gray}•${C.reset} No active PM2 process named 'opencat-agent' found.`);
  }

  // 2. Local Database & State Persistence Reset
  console.log(`\n ${C.bold}[2/5] Cleaning Local Database & Session Memory...${C.reset}`);
  if (keepData) {
    console.log(` ${C.yellow}• Keeping database/ directory (--keep-data specified)${C.reset}`);
  } else {
    removePath('database', 'StateStore JSON persistence & trade journal');
  }

  // 3. Environment File Cleanup (.env)
  console.log(`\n ${C.bold}[3/5] Cleaning Credentials & Environment Configuration...${C.reset}`);
  if (keepEnv) {
    console.log(` ${C.yellow}• Keeping .env file (--keep-env specified)${C.reset}`);
  } else {
    let removeEnv = isForce;
    if (!isForce) {
      const ans = await askQuestion(`   Delete local ${C.bold}.env${C.reset} credentials file? (y/N): `);
      removeEnv = ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes';
    }
    if (removeEnv) {
      removePath('.env', 'Private keys, Discord tokens & API keys');
    } else {
      console.log(` ${C.gray}• Retained .env configuration file.${C.reset}`);
    }
  }

  // 4. Build Artifacts & Logs Cleanup
  console.log(`\n ${C.bold}[4/5] Cleaning Build Artifacts & Cache Files...${C.reset}`);
  removePath('dist', 'Compiled TypeScript JavaScript output');
  removePath('.tmp', 'Temporary file cache');
  removePath('opencat.log', 'Console process log');
  removePath('athena.log', 'Console process log');
  removePath('pm2-error.log', 'PM2 error log');
  removePath('pm2-out.log', 'PM2 output log');

  // 5. Node Modules Cleanup (Dependencies)
  console.log(`\n ${C.bold}[5/5] Dependencies Cleanup...${C.reset}`);
  if (keepModules) {
    console.log(` ${C.yellow}• Keeping node_modules/ (--keep-modules specified)${C.reset}`);
  } else {
    let removeDeps = isForce;
    if (!isForce) {
      const ans = await askQuestion(`   Delete ${C.bold}node_modules/${C.reset} folder to free disk space? (y/N): `);
      removeDeps = ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes';
    }
    if (removeDeps) {
      removePath('node_modules', 'Installed npm packages');
    } else {
      console.log(` ${C.gray}• Retained node_modules/ directory.${C.reset}`);
    }
  }

  console.log(`
${C.green}${C.bold}=======================================================${C.reset}
${C.green}${C.bold}  🐾 OPENCAT CLEAN UNINSTALL COMPLETED SUCCESSFULLY!  ${C.reset}
${C.green}${C.bold}=======================================================${C.reset}
   Opencat background daemons have been stopped and local
   cache/state files have been safely wiped clean.
`);
}

main().catch((err) => {
  console.error(`\n${C.red}❌ Uninstall process error:${C.reset}`, err);
  process.exit(1);
});
