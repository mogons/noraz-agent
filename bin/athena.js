#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import fileURLToPath from 'url';

const args = process.argv.slice(2);
const subCommand = (args[0] || 'run').toLowerCase();

const rootDir = process.cwd();

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

  case 'help':
  case '--help':
  case '-h':
  default:
    console.log(`
🏛️ ATHENA CLI COMMAND CHEATSHEET:

  athena run (or athena)     - Launch Athena Multi-Agent Engine (Development / Live Bot)
  athena wizard (or setup)   - Launch Interactive Configuration Wizard for .env & Tokens
  athena terminal (or tui)   - Launch Parthenon Interactive Terminal TUI
  athena deploy              - Deploy 24/7 Background Daemon via PM2 Process Manager
  athena test                - Run Automated Unit Test Suite (Vitest)
  athena build               - Compile TypeScript Codebase into /dist
  athena update              - Pull Latest Git Updates, Install, & Re-build
`);
    break;
}
