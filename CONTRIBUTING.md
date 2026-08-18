# Contributing to Opencatz AI (Robinhood Chain Edition)

Thank you for your interest in contributing to **Opencatz AI**! We welcome bug fixes, strategy modules, new sub-agent screeners, documentation improvements, and Web3 integrations for Robinhood Chain L2 (#4663).

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: `>= 22.12`
- **Git**: Installed and configured

### 2. Environment Setup
```bash
# Clone the repository
git clone https://github.com/dizcorvus/opencat-ai-robinhood-chain.git
cd opencat-ai-robinhood-chain

# Install dependencies
npm install

# Run interactive onboarding wizard
opencatz onboard   # or: npm run wizard
```

---

## 🛠️ Development Workflow

```bash
# Start bot in development mode (hot-reload)
npm run dev

# Build TypeScript production bundle
npm run build

# Run unit test suite
npm test
```

---

## 📐 Coding Conventions & Guidelines

1. **Strict TypeScript Typing**: Avoid using `any`. Define clear interfaces for Token Signals, Audit Results, Swarm Scores, and Discord Contexts.
2. **Sub-Agent Isolation**: Keep screening sub-agents decoupled from trade execution routines. Sub-agents must submit candidate signals to the `Swarm Consensus Engine` before emitting to Discord or Telegram channels.
3. **Safety & Execution Modes First**: Always respect `getExecutionMode()`. Live trades must occur strictly in `AUTO_EXECUTE` mode with verified private keys. `DRY_RUN` simulates fills using live market pricing without broadcasting.
4. **Deterministic Filtering**: Keep screening and security audits fast, local, and token-cost-optimized. Reserve LLM calls for complex NLU reasoning in the command room.
5. **Full Test Coverage**: Every new feature or bugfix should include corresponding unit tests in `tests/`. Verify `npm test` passes 100% before opening a Pull Request.

---

## 🔀 Submitting Pull Requests

1. Fork the repository and create a feature branch (`git checkout -b feat/my-new-feature`).
2. Commit your changes following conventional commit syntax (`feat(domain): description` or `fix(agent): description`).
3. Ensure `npm run build` and `npm test` pass cleanly.
4. Open a Pull Request against the `master` branch with a clear summary of your changes.
