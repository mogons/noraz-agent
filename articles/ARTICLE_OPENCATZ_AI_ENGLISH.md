# 🐾 Inside Opencatz AI: The Autonomous Multi-Agent Trading Swarm on Robinhood Chain

> *"Chill trades, 9 lives, razor-sharp on-chain alpha."* — **Opencatz AI** 🐾⚡
>
> 🌐 **Official Website:** [https://opencatz.xyz](https://opencatz.xyz)  
> 📖 **Documentation:** [https://opencatz.xyz/docs](https://opencatz.xyz/docs)  
> 💻 **Web Terminal Emulator:** [https://opencatz.xyz/terminal](https://opencatz.xyz/terminal)  
> 🔗 **GitHub Repository:** [https://github.com/dizcorvus/opencatz-ai-robinhood-chain](https://github.com/dizcorvus/opencatz-ai-robinhood-chain)  
>
> ⚠️ **Upfront Disclaimer (NFA & DYOR):** This article is strictly for educational, research, and technical exploratory purposes. Trading on-chain crypto assets, meme tokens, liquidity pools, and NFTs carries substantial financial risk. Always Do Your Own Research (DYOR) and employ strict capital risk management. *Not Financial Advice.*

---

## 1. The On-Chain Reality: Why Manual Screening Falls Short

Trading on a newly launched Layer-2 network is exhilarating, but anyone active on-chain understands the harsh reality: hundreds of new contracts deploy every hour, social feeds are saturated with promotional noise, and liquidity moves at sub-second velocity.

While the upside in new ecosystems is immense, individual traders face steep obstacles:
* **Overwhelming Scam Influx & Rugpulls:** Approximately 90% of newly deployed tokens end up as honeypots, developer liquidity removals (rugpulls), or illiquid pools dominated by automated sniper bots.
* **Human Physical Fatigue:** Crypto markets operate 24/7. High-conviction alpha and critical liquidity migrations frequently occur at 3:00 AM while you are asleep.
* **Severe Tool Fragmentation:** Vetting a single token requires juggling DexScreener (charts), GoPlus (contract security), GMGN (smart money flows), Twitter/X (sentiment), and Krystal (pool yields). It is exhausting and slow.
* **Emotional Traps & FOMO:** Seeing sudden green candles tempts traders to buy at local tops, only to panic sell during standard market corrections.

**Opencatz AI** was engineered to solve these exact structural problems. Rather than acting as a simple alert webhook, it is a comprehensive **Multi-Agent Swarm Intelligence** that autonomously monitors Robinhood Chain 24/7, filters noise through strict multi-agent consensus, and delivers actionable intelligence to Discord, an interactive terminal console, or Telegram.

---

## 2. Dedicated Single-Chain Focus: Robinhood Chain (EVM L2 #4663)

Opencatz AI avoids fragile cross-chain bridges and complex routing layers by operating natively and exclusively on **Robinhood Chain**.

| Network Parameter | Specification |
| :--- | :--- |
| **Network Name** | Robinhood Chain (EVM Layer 2) |
| **Chain ID** | `4663` |
| **Native Asset** | `ETH` |
| **Canonical RPC** | `https://rpc.mainnet.chain.robinhood.com` |
| **Block Explorer** | `https://robinhoodchain.blockscout.com` |
| **Primary DEX Venue** | Uniswap V3 Router (Robinhood Chain L2) |
| **Execution Profile** | Sub-second transaction finality with negligible gas fees |

Focusing on a dedicated single-chain stack guarantees ultra-low latency, reliable swap execution, and zero bridge-related vulnerability vectors.

---

## 3. System Architecture: How the Swarm Operates

Opencatz AI divides screening and trading responsibilities across 5 specialist screening agents, a central consensus gate, and post-execution risk managers:

```
                          USER INTERFACE PLATFORMS
              (Discord Command Center · Terminal TUI · Telegram Bridge)
                                      │
                                      ▼
                   ┌───────────────────────────────────┐
                   │       OPENCATZ CORE HUB           │
                   │   #opencatz-control-room · chat   │
                   │   risk gate · 9-lives risk engine │
                   │   wallet service · trade journal  │
                   └──────────────────┬────────────────┘
                                      │ candidate signals
     ┌────────────────┬───────────────┼───────────────┬────────────────┐
     ▼                ▼               ▼               ▼                ▼
 ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
 │  MEME AGENT  │ │ LP VELOCITY  │ │  NFT AGENT   │ │ ALPHA SCRAPER│ │ ETH WHALES   │
 │meme-robinhood│ │ lp-robinhood │ │    nft       │ │alpha-robinhood│ │ whale-eth    │
 │ GMGN + GoPlus│ │ Krystal Cloud│ │   OpenSea    │ │X API v2 / Web│ │ Hyperliquid  │
 │vol 24h ≥ $25k│ │Fee/TVL ≥ 2%  │ │floor +10%/1h │ │1h rh alpha   │ │perps ≥ $500k │
 │liq ≥ $5k     │ │TVL ≥ $10k    │ │sales ≥ 3/h   │ │sentiment high│ │spot ≥ $50k   │
 └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
        └────────────────┴───────────────┼────────────────┴────────────────┘
                                         ▼
                   ┌────────────────────────────────────┐
                   │   SWARM CONSENSUS ENGINE (≥ 80%)   │
                   │  Quant · Catalyst · Security Audit │
                   └────────────────┬───────────────────┘
                                    │ only ≥ 80% confidence
                                    ▼
          MULTI-PLATFORM DISPATCH (Discord · Terminal TUI · Telegram)
                                    │
                                    ▼
                        WALLET TRACKER & POSITION MANAGER
```

### Five Specialist Screening Sub-Agents
1. 🌸 **Meme Robinhood Agent (`#call-meme-robinhood`):** Screens emerging tokens via GMGN OpenAPI & GoPlus Security. Strict default filters: 24h volume ≥ $25k, liquidity ≥ $5k, fee pool ≥ $250, and mandatory smart contract security verification.
2. 🌊 **LP Velocity Agent (`#call-lp-robinhood`):** Scans concentrated liquidity pools on Uniswap V3 via Krystal Cloud API (`ethereum@4663`), filtering for TVL ≥ $10k, 24h volume ≥ $100k, and daily Fee/TVL ≥ 2% for passive yield farmers.
3. 🔮 **NFT Sniper Agent (`#call-nft-robinhood`):** Monitors NFT collections such as Catz NFT on OpenSea REST API v2, detecting floor surges ≥ +10%/1h, volume spikes ≥ 1.5x, and sales velocity ≥ 3 transactions/hour.
4. ☀️ **Alpha Scraper & Sentiment (`#call-alpha-robinhood`):** Harvests 1-hour narrative shifts on Robinhood Chain paired with real-time social sentiment analysis via official X (Twitter) API v2.
5. 🐋 **ETH Whale Tracker (`#call-whale-eth`):** Tracks institutional capital movements on Hyperliquid L1, monitoring ETH perpetual positions ≥ $500k and spot order flow ≥ $50k.

### 3-Layer Swarm Consensus Engine (≥ 80% Confidence Floor)
No individual agent has authority to broadcast signals autonomously. Candidate tokens must undergo a 3-layer quantitative evaluation:
* **Quant & Liquidity Layer (35%):** Depth, slippage, and volume-to-market-cap ratios.
* **Catalyst & Sentiment Layer (35%):** Volume velocity, social sentiment, and smart money accumulation.
* **Security Audit Layer (30%):** Automated anti-honeypot, mintability, blacklist, and ownership checks (*fail-closed* architecture).

Signals scoring below **80%** are immediately discarded. Furthermore, a **Cross-Agent Conflict Veto** cancels BUY recommendations if whale agents detect opposing SHORT or distribution signals on the same underlying asset.

### 9-Lives Risk Engine & Position Manager
Post-execution, the Position Manager safeguards capital:
* **Circuit Breaker:** Emergency shutdown mechanism halting active trading if daily drawdown thresholds are breached.
* **Multi-Tier Take Profit (TP):** Automated profit milestones at +100% (2x) and +200% (3x).
* **Disciplined Stop Loss (SL):** Firm capital preservation boundary at -20%.
* **Dynamic Trailing Stop:** Protects accrued gains as price moves favorably.
* **LP Out-of-Range Alerts:** Real-time warnings when spot price drifts outside active Uniswap V3 liquidity ticks.

---

## 4. Full Strategy Customization & Plain English Compiler

Opencatz AI adapts completely to your personal trading approach:
* **Plain English Strategy Compiler:** Define custom screening criteria using natural language (e.g. *"Only hunt meme tokens held by 3+ smart wallets with liquidity over $15k"*). At startup, the compiler converts this prompt into a validated, sandboxed `.mjs` module.
* **Screening Presets:**
  * *Loosened Default:* Yields ~2x more signals for active traders while maintaining the strict 80% quality threshold.
  * *Standard:* Highly conservative baseline filtering.
  * *Numeric Editor:* Fine-tune numerical thresholds directly during onboarding or via Discord chat.
* **Custom Indicators (`indicators/`):** Dedicated directory for adding custom technical indicators and quantitative formulas.

---

## 5. 💡 Pro-Tip: Run 100% Free with OpenRouter Free Tier

You can operate Opencatz AI around the clock **with zero AI subscription costs ($0/month)**:
1. Create a free account at [OpenRouter.ai](https://openrouter.ai) and generate an API key.
2. Select high-performance free models such as `meta-llama/llama-3.3-70b-instruct:free` or `deepseek/deepseek-r1:free`.
3. Opencatz AI performs all heavy filtering, math scoring, and security audits locally via deterministic code. The LLM is invoked only for high-level reasoning (sentiment analysis and control room chat queries). Operational overhead remains **strictly $0**!

---

## 6. Execution Modes & Multi-Platform Command Center

### Execution Modes
1. **`DRY_RUN` (Default):** Realistic market simulation using real-time Uniswap V3 quotes and gas calculations without capital risk.
2. **`SIGNAL_ONLY`:** Operates purely as an intelligence radar, posting structured call cards with direct swap links for manual execution.
3. **`AUTO_EXECUTE`:** Fully autonomous on-chain trading via Viem and Uniswap V3 when swarm consensus reaches ≥ 80% and risk checks pass.

### Multi-Platform Interfaces
* **🎮 Discord Command Center:** Auto-provisions `🐾 OPENCATZ COMMAND CENTER` category, 6 specialized channels, and 22 slash commands.
* **💻 Terminal TUI (`opencatz terminal`):** Interactive 24-bit TrueColor ANSI dashboard for VPS and headless server management.
* **📱 Telegram Notification Bridge:** High-priority mobile push notifications with interactive callback buttons.
* **🌐 Web Dashboard REST API (Port 3000):** Ready to connect with Next.js dashboards or mobile applications.

---

## 7. 🎟️ Live Deployment in PX Identities Discord (404 Identities Holders)

For traders seeking zero-infrastructure access: **Opencatz AI will be deployed live 24/7 in the PX Identities Discord server!**

Holders of the **404 Identities (Robinhood Chain)** collection receive complimentary access:
* Real-time screening signals across all dedicated channels.
* On-demand smart contract audits directly inside Discord.
* Live whale tracking and daily market summaries with zero server maintenance.

---

## 8. Step-by-Step Installation Guide

### Prerequisites
* **Node.js** version 22.12 or newer ([Download Node.js](https://nodejs.org))
* **Git**
* **Discord Bot Token** from Discord Developer Portal

### Step 1: Clone the Repository
```bash
git clone https://github.com/dizcorvus/opencatz-ai-robinhood-chain.git
cd "Opencatz AI (Robinhood Chain)"
```

### Step 2: Automated 1-Click Setup
* **Windows (PowerShell):**
  ```powershell
  .\setup.bat
  ```
* **Linux / macOS / VPS:**
  ```bash
  bash setup.sh
  ```

### Step 3: Interactive Onboarding (`opencatz onboard`)
Run the onboarding wizard:
```bash
opencatz onboard
```
Configure execution mode, Discord/Telegram credentials, AI provider, and data API keys (GMGN, Krystal Cloud, OpenSea, GoPlus, Uniswap, X API v2) alongside backup key arrays (`*_BACKUP_KEYS`).

### Step 4: Launch the Swarm
* **Development Mode:** `opencatz run`
* **Terminal TUI Console:** `opencatz terminal`
* **24/7 Production Background Daemon (PM2):** `opencatz deploy`

> ✨ Upon bot initialization, Opencatz **automatically creates the `🐾 OPENCATZ COMMAND CENTER` category, configures all 6 channels, and registers all 22 slash commands**.

### Essential Commands
* `/analyze [address]`: Instant 3-layer security and liquidity audit for any contract.
* `/wallet balance / setup`: Manage burner wallet and inspect on-chain balance.
* `/alert set [token] [target]`: Set automated price alerts with Discord notifications.
* `/journal summary / export`: Review trading performance and export trade logs to CSV.
* `opencatz doctor`: Complete diagnostic check across RPC endpoints, API keys, and sub-agents.
* `opencatz update`: Single-command auto-update (git pull, build, PM2 daemon restart).

---

## 9. 🌟 Open Source & Roadmap

Opencatz AI is **100% Open-Source** under the MIT license. We welcome developers, quants, and crypto researchers to collaborate, build new screening sub-agents, and contribute custom strategy modules.

🔗 **GitHub Repository:** [https://github.com/dizcorvus/opencatz-ai-robinhood-chain](https://github.com/dizcorvus/opencatz-ai-robinhood-chain)

The Robinhood Chain edition represents the foundation of the ecosystem. The team is actively developing **Opencatz AI Multi-Chain Edition** (Solana, Base, Arbitrum, BSC) and a **Premium Swarm Execution Engine**. Stay updated at [opencatz.xyz](https://opencatz.xyz)!
