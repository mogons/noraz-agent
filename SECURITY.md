# Security Policy - Opencat AI (Robinhood Chain Edition)

Opencat AI takes security and smart contract safety with the utmost seriousness. Because Opencat AI interacts with real-world blockchain networks (Robinhood Chain EVM L2 #4663), Web3 DEX protocols (Uniswap V3), and automated execution mechanisms, strict security standards are embedded directly into our multi-agent architecture.

---

## 🛡️ Core Security Architecture & Safeguards

1. **`DRY_RUN` Mode Default**: Opencat AI initializes in `DRY_RUN=true` mode by default. Real on-chain trading requires explicit enabling of `AUTO_EXECUTE_ENABLED=true` and supplying a verified `EVM_PRIVATE_KEY`.
2. **3-Layer Swarm Consensus Gate ($\ge 80\%$)**: Signal call cards are filtered through Quant & Liquidity, Catalyst & Sentiment, and 12-point Security Audits (GoPlus Labs & GMGN) before delivery to Discord channels or execution routines.
3. **Fail-Closed Security Audit**: Any token flagged as a Honeypot, Blacklisted, Transfer-Pausable, or having unrenounced malicious mint authority is immediately rejected.
4. **Circuit Breaker & 9-Lives Risk Engine (`RiskEngineV2`)**: Automatic global drawdown caps, per-trade position limits, and instantaneous emergency kill-switches halt execution if risk thresholds are breached.
5. **Zero API Key Leakage (`ApiKeyGuardService`)**: Private keys and sensitive API credentials are kept in local `.env` files (never committed to version control). LLM function calls and prompt inputs are sanitized to prevent prompt-injection key extraction.
6. **REST API Guard (`OPENCAT_API_KEY` / `ATHENA_API_KEY`)**: When exposing the native REST API (`src/api/server.ts`), requests can be authenticated via `X-OpenCat-Api-Key` or Bearer tokens with full CORS header isolation.

---

## 📋 Reporting a Vulnerability

If you discover a security vulnerability, key leak risk, or potential exploit vector within Opencat AI, please **DO NOT** create a public GitHub Issue.

Instead, please report vulnerabilities privately:

- **Security Email**: Contact maintainers directly via `security@opencat-ai.org` (or via private Discord DM to Core Maintainers in `#opencat-control-room`).
- **Response Time**: We acknowledge security reports within **24 hours** and aim to release a patch or advisory within **72 hours**.

---

## 🔒 Supported Versions

Only the latest release on the `master` branch is actively supported with security updates.

| Version | Supported |
| :--- | :---: |
| `1.x` (master) | 🟢 Yes |
| `< 1.0` | 🔴 No |
