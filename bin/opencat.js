#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const subCommand = (args[0] || 'run').toLowerCase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ANSI Color Tokens from OpenCat Palette
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  lime: '\x1b[38;2;204;255;0m',      // #CCFF00 Robinhood Green (Legendary Hero)
  pink: '\x1b[38;2;255;183;178m',    // #FFB7B2 Pastel Pink
  lavender: '\x1b[38;2;214;199;255m',// #D6C7FF Lavender Purple
  cyan: '\x1b[38;2;128;222;234m',    // #80DEEA Retro Cyan
  yellow: '\x1b[38;2;255;245;157m',  // #FFF59D Pastel Yellow
  gold: '\x1b[38;2;255;215;0m',      // #FFD700 Golden Fortune
  red: '\x1b[38;2;229;57;53m',       // #E53935 Maneki-Neko Red
  green: '\x1b[38;2;0;230;118m',     // #00E676 Jade Spirit
};

console.log(`
${C.lime}${C.bold}       /\\_____/\\
      /  ${C.pink}■${C.lime}   ${C.pink}■${C.lime}  \\      ${C.lime}🐾 OPENCAT AI CLI 🐾${C.reset}
${C.lime}     ( ==  ${C.pink}^${C.lime}  == )     ${C.cyan}Autonomous Multi-Agent Trading Swarm${C.reset}
${C.lime}      )    ${C.yellow}~${C.lime}    (      ${C.lavender}Robinhood Chain EVM L2 • Chain ID: 4663${C.reset}
${C.lime}     (   _____   )     ${C.gold}"Chill trades, 9 lives, sharp alpha."${C.reset}
${C.lime}    ( (  )   (  ) )
   (__(__)___(__)__)${C.reset}
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
    console.log(`${C.lime}🚀 Launching OpenCat Multi-Agent Engine in Development Mode...${C.reset}\n`);
    runCommand('npx', ['tsx', 'watch', 'src/index.ts']);
    break;

  case 'onboard':
  case 'wizard':
  case 'setup':
  case 'config':
    console.log(`${C.pink}🧙‍♂️ Launching OpenCat Interactive Onboarding Wizard...${C.reset}\n`);
    runCommand('node', ['scripts/wizard.js']);
    break;

  case 'terminal':
  case 'tui':
    console.log(`${C.cyan}🐾 Launching OpenCat Interactive Command Center TUI...${C.reset}\n`);
    runCommand('npx', ['tsx', 'src/cli/tui.ts']);
    break;

  case 'deploy':
  case 'pm2':
    console.log(`${C.lime}🌐 Deploying OpenCat 24/7 Background Process via PM2...${C.reset}\n`);
    runCommand('npm', ['run', 'deploy']);
    break;

  case 'test':
    console.log(`${C.lavender}🧪 Running OpenCat Automated Test Suite...${C.reset}\n`);
    runCommand('npx', ['vitest', 'run']);
    break;

  case 'build':
    console.log(`${C.yellow}⚙️ Compiling OpenCat TypeScript Codebase...${C.reset}\n`);
    runCommand('npx', ['tsc']);
    break;

  case 'update':
    console.log(`${C.cyan}🔄 Pulling latest updates from Git & re-building...${C.reset}\n`);
    runCommand('npm', ['run', 'update']);
    break;

  case 'doctor':
  case 'check':
    console.log(`${C.green}🩺 Running OpenCat Diagnostic Doctor...${C.reset}\n`);
    runCommand('npx', ['tsx', 'src/cli/doctor.ts']);
    break;

  case 'uninstall':
  case 'purge':
  case 'clean-all':
    console.log(`${C.red}🧹 Launching OpenCat Clean Uninstaller...${C.reset}\n`);
    runCommand('node', ['scripts/uninstall.mjs', ...args.slice(1)]);
    break;

  case 'help':
  case '--help':
  case '-h':
  default:
    console.log(`
${C.lime}${C.bold}🐾 OPENCAT AI CLI — COMMAND CHEATSHEET:${C.reset}

  ${C.cyan}opencat run${C.reset} (or opencat)       - Launch OpenCat AI (dev / live bot)
  ${C.cyan}opencat onboard${C.reset} (or wizard)   - Interactive onboarding wizard (.env + keys + strategies)
  ${C.cyan}opencat terminal${C.reset} (or tui)     - Open the OpenCat Command Center TUI
  ${C.cyan}opencat deploy${C.reset}                - 🌲 24/7 background deployment via PM2 (Cat Den)
  ${C.cyan}opencat update${C.reset}                - 🔄 git pull + install + rebuild + notify
  ${C.cyan}opencat doctor${C.reset}                - 🩺 Run the diagnostic health doctor
  ${C.cyan}opencat test${C.reset}                  - 🧪 Run the full Vitest suite
  ${C.cyan}opencat build${C.reset}                 - ⚙️ Compile TypeScript into /dist
  ${C.cyan}opencat uninstall${C.reset} (or purge) - 🧹 Clean uninstaller (reset state & purge PM2)
`);
    break;
}
