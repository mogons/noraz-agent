#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const subCommand = (args[0] || 'run').toLowerCase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log(`
                   /\\
                  /  \\
                 / /\\ \\
                / /  \\ \\
               / /____\\ \\
              /__________\\
             |  |  ||  |  |
             |  |  ||  |  |
      🏛️  PARTHENON OF ATHENA CLI  🏛️
  Autonomous Multi-Agent Crypto Intelligence Ecosystem
`);

function runCommand(command, cmdArgs) {
  const child = spawn(command, cmdArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

switch (subCommand) {
  case 'run':
  case 'dev':
  case 'start':
    console.log('🚀 Launching Athena Multi-Agent Engine in Development Mode...\n');
    runCommand('npx', ['tsx', 'watch', 'src/index.ts']);
    break;

  case 'wizard':
  case 'setup':
  case 'config':
    console.log('🧙‍♂️ Launching Athena Interactive Setup Wizard...\n');
    runCommand('node', ['scripts/wizard.js']);
    break;

  case 'terminal':
  case 'tui':
    console.log('🏛️ Launching Parthenon Interactive Terminal TUI...\n');
    runCommand('npx', ['tsx', 'src/cli/tui.ts']);
    break;

  case 'deploy':
  case 'pm2':
    console.log('🌐 Deploying Athena 24/7 Background Process via PM2...\n');
    runCommand('npm', ['run', 'deploy']);
    break;

  case 'test':
    console.log('🧪 Running Athena Automated Test Suite...\n');
    runCommand('npx', ['vitest', 'run']);
    break;

  case 'build':
    console.log('⚙️ Compiling Athena TypeScript Codebase...\n');
    runCommand('npx', ['tsc']);
    break;

  case 'update':
    console.log('🔄 Pulling latest updates from Git & re-building...\n');
    runCommand('npm', ['run', 'update']);
    break;

  case 'doctor':
  case 'check':
    console.log('🩺 Running Athena Diagnostic Doctor...\n');
    runCommand('npx', ['tsx', 'src/cli/doctor.ts']);
    break;

  case 'uninstall':
  case 'purge':
  case 'clean-all':
    console.log('🧹 Launching Athena Clean Uninstaller...\n');
    runCommand('node', ['scripts/uninstall.mjs', ...args.slice(1)]);
    break;

  case 'help':
  case '--help':
  case '-h':
  default:
    console.log(`
🏛️ ATHENA CLI — PARTHENON COMMAND CHEATSHEET:

  athena run (or athena)     - Launch Athena (dev / live bot)
  athena wizard (or setup)   - Parthenon onboarding wizard (.env + providers + backups)
  athena terminal (or tui)   - Open the Parthenon command-center TUI
  athena deploy              - ⛰️ Olympian: deploy 24/7 via PM2 (Mount Olympus)
  athena update              - ⛰️ Olympian: git pull + install + rebuild + notify (Telegram/Discord)
  athena uninstall (or purge)- 🧹 Parthenon clean uninstaller (reset state & PM2)
  athena doctor              - ⛰️ Olympian: run the diagnostic doctor
  athena test                - Run the Vitest suite
  athena build               - Compile TypeScript into /dist
`);
    break;
}
