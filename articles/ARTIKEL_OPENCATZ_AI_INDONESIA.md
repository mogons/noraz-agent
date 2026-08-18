# 🐾 Mengenal Opencatz AI: Pasukan AI Agent Otonom Pemburu Alpha di Robinhood Chain

> *"Chill trades, 9 lives, razor-sharp on-chain alpha."* — **Opencatz AI** 🐾⚡
>
> 🌐 **Website Resmi:** [https://opencatz.xyz](https://opencatz.xyz)  
> 📖 **Dokumentasi:** [https://opencatz.xyz/docs](https://opencatz.xyz/docs)  
> 💻 **Web Terminal Emulator:** [https://opencatz.xyz/terminal](https://opencatz.xyz/terminal)  
> 🔗 **GitHub Repository:** [https://github.com/dizcorvus/opencatz-ai-robinhood-chain](https://github.com/dizcorvus/opencatz-ai-robinhood-chain)  
>
> ⚠️ **Disclaimer Awal (NFA & DYOR):** Seluruh konten dalam artikel ini ditujukan untuk edukasi, eksplorasi teknologi Web3, dan riset kuantitatif. Trading aset kripto on-chain, meme coin, liquidity pool, dan NFT memiliki risiko volatilitas tinggi. Selalu lakukan riset mandiri (*Do Your Own Research*), gunakan manajemen risiko yang terukur, dan jangan pernah menggunakan dana darurat. *Not Financial Advice.*

---

## 1. Masalah Nyata On-Chain: Kenapa Manual Screening Bikin Capek?

Kalau kamu pernah aktif trading di jaringan Layer-2 baru, kamu pasti paham situasinya: ratusan token baru lahir setiap jam, linimasa X (Twitter) langsung dibanjiri narasi koin baru, dan chart harga bergerak sangat liar.

Peluang profit di ekosistem baru memang sangat besar, namun realita trading on-chain memiliki tantangan berat:
* **Banjir Koin Scam & Rugpull:** Sekitar 90% token baru yang baru dideploy biasanya berakhir jadi honeypot, likuiditas ditarik dev (*rugpull*), atau langsung dihajar sniper bot.
* **Keterbatasan Fisik Manusia:** Pasar crypto bergerak 24/7 tanpa henti. Sering kali momentum rotasi likuiditas besar atau alpha terbaik justru terjadi jam 3 pagi saat kita sedang tidur.
* **Fragmentasi Data & Tab Berantakan:** Mau riset satu token saja harus membuka DexScreener (chart), GoPlus (audit kontrak), GMGN (pelacakan smart money), Twitter/X (sentimen), dan Krystal (pool likuiditas). Sangat melelahkan dan memakan waktu.
* **Trading Emosional & FOMO:** Melihat candle hijau panjang langsung mendorong beli di puncak, lalu panik jual saat terjadi koreksi normal.

Dari masalah nyata inilah **Opencatz AI** diciptakan. Opencatz AI bukan sekadar bot alert webhook biasa, melainkan ekosistem **Multi-Agent Swarm Intelligence** otonom yang memantau Robinhood Chain 24/7, menyaring noise lewat konsensus berlapis, dan mengirimkan sinyal trading siap eksekusi ke Discord, Terminal TUI, dan Telegram.

---

## 2. Jaringan Spesialis: Robinhood Chain (EVM L2 #4663)

Opencatz AI tidak dibuat campur aduk dengan bridge lintas-rantai yang lambat dan rawan eksploit. Sistem ini dirancang native dan fokus 100% pada **Robinhood Chain**.

| Parameter Jaringan | Spesifikasi |
| :--- | :--- |
| **Nama Jaringan** | Robinhood Chain (EVM Layer 2) |
| **Chain ID** | `4663` |
| **Native Asset** | `ETH` |
| **Canonical RPC** | `https://rpc.mainnet.chain.robinhood.com` |
| **Block Explorer** | `https://robinhoodchain.blockscout.com` |
| **Primary DEX Venue** | Uniswap V3 Router (Robinhood Chain L2) |
| **Karakteristik** | Eksekusi sub-detik dengan gas fee sangat murah |

Fokus pada satu rantai tunggal memastikan latensi super rendah, keandalan eksekusi swap, dan bebas dari risiko jembatan bridge.

---

## 3. Bedah Arsitektur Swarm: Cara Kerja Multi-Agent Opencatz

Opencatz AI mendistribusikan beban kerja ke 5 sub-agent screening spesialis, 1 mesin konsensus swarm, dan modul manajemen risiko otomatis:

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

### Lima Sub-Agent Screening Spesialis
1. 🌸 **Meme Robinhood Agent (`#call-meme-robinhood`):** Berburu token meme potensial via GMGN OpenAPI & GoPlus Security. Filter bawaan: volume 24 jam minimal $25k, likuiditas minimal $5k, fee pool minimal $250, dan wajib lolos audit keamanan kontrak.
2. 🌊 **LP Velocity Agent (`#call-lp-robinhood`):** Memantau Concentrated Liquidity Uniswap V3 via Krystal Cloud API (`ethereum@4663`) dengan kriteria TVL ≥ $10k, volume 24 jam ≥ $100k, dan rasio Fee/TVL ≥ 2% untuk passive income.
3. 🔮 **NFT Sniper Agent (`#call-nft-robinhood`):** Memantau pasar NFT seperti Catz NFT di OpenSea REST API v2 dengan filter kenaikan floor ≥ +10%/jam, lonjakan volume ≥ 1.5x, dan sales velocity minimal 3 transaksi/jam.
4. ☀️ **Alpha Scraper & Sentimen X (`#call-alpha-robinhood`):** Mengikis narasi koin baru di Robinhood Chain dalam 1 jam terakhir dan mengevaluasi sentimen sosial via official X API v2.
5. 🐋 **ETH Whale Tracker (`#call-whale-eth`):** Melacak pergerakan modal besar institusional di Hyperliquid L1 (posisi perpetual ETH ≥ $500k dan order flow spot ≥ $50k).

### 3-Layer Swarm Consensus Engine (Minimal 80%)
Tidak ada satu agen pun yang dapat memposting sinyal tanpa persetujuan swarm. Setiap kandidat token diuji lewat 3 lapisan filter:
* **Layer Kuantitatif & Likuiditas (35%):** Kedalaman pool, slippage, rasio volume/market cap.
* **Layer Katalis & Sentimen (35%):** Volume velocity, sentimen sosial, akumulasi smart money.
* **Layer Audit Keamanan (30%):** Deteksi honeypot, mintability, blacklist, dan kepemilikan dev (*fail-closed*).

Jika skor gabungan kurang dari **80%**, sinyal otomatis ditolak. Dilengkapi juga dengan **Cross-Agent Conflict Veto**: jika agen whale mendeteksi sinyal SHORT atau dumping pada aset yang sama, sistem langsung membatalkan rekomendasi BUY dari agen lain.

### 9-Lives Risk Engine & Position Manager
Setelah posisi terbuka, Position Manager otomatis mengawal:
* **Circuit Breaker:** Pengaman darurat yang menghentikan bot otomatis saat drawdown pasar harian mencapai batas toleransi.
* **Take Profit (TP) Bertingkat:** Peringatan profit otomatis di target +100% (2x) dan +200% (3x).
* **Stop Loss (SL) Disiplin:** Batas proteksi modal tegas di angka -20%.
* **Dynamic Trailing Stop:** Mengunci profit yang telah diperoleh saat harga terus naik.
* **Peringatan LP Out-of-Range:** Notifikasi instan saat harga keluar dari rentang konsentrasi likuiditas Uniswap V3.

---

## 4. Kustomisasi Penuh & Custom Strategy Compiler

Opencatz AI memberikan kebebasan penuh bagi trader untuk merancang gaya trading masing-masing:
* **Kompilasi Bahasa Manusia (Natural Language Prompt):** Kamu cukup menulis aturan screening menggunakan bahasa sehari-hari (misal: *"Hanya cari token meme yang dipegang minimal 3 smart wallet dan likuiditas di atas $15k"*). Saat bot pertama kali booting, prompt ini otomatis dikompilasi menjadi modul strategi sandboxed `.mjs` yang aman.
* **Preset Strategi Siap Pakai:**
  * *Loosened Default:* Menghasilkan sinyal ~2x lebih aktif untuk trader yang menyukai frekuensi tinggi, dengan tetap menjaga batas kualitas 80%.
  * *Standard:* Filter ketat dan konservatif.
  * *Numeric Editor:* Mengubah parameter angka secara langsung lewat antarmuka onboarding atau Discord chat.
* **Folder Indikator Kustom (`indicators/`):** Tempat menyematkan formula indikator teknikal kustom buatanmu sendiri.

---

## 5. 💡 Tips Hemat: Jalankan 100% Gratis Pakai OpenRouter Free Tier

Kamu bisa menjalankan Opencatz AI secara penuh **tanpa biaya langganan AI sepeser pun ($0/bulan)**:
1. Buat akun di [OpenRouter.ai](https://openrouter.ai) dan dapatkan API key gratis.
2. Saat onboarding, pilih provider `openrouter` dan gunakan model gratis berkualitas tinggi (seperti `meta-llama/llama-3.3-70b-instruct:free` atau `deepseek/deepseek-r1:free`).
3. Opencatz AI dirancang sangat efisien. Seluruh komputasi berat, filtering data, dan audit keamanan dijalankan menggunakan kalkulasi matematis lokal. LLM hanya dipanggil untuk tugas penalaran tingkat tinggi (sentimen tweet dan interaksi chat control room). Biaya operasional bot benar-benar **$0**!

---

## 6. Tiga Mode Eksekusi & Pusat Kendali Multi-Platform

### Mode Eksekusi
1. **`DRY_RUN` (Default):** Simulasi pasar 100% realistis dengan harga live Uniswap V3 tanpa memotong saldo dompet asli. Sangat aman untuk pemula dan pengujian strategi.
2. **`SIGNAL_ONLY`:** Bot bekerja sebagai radar intelijen murni yang membagikan call card lengkap dengan tautan swap untuk eksekusi manual.
3. **`AUTO_EXECUTE`:** Bot mengeksekusi swap otomatis di on-chain via Viem saat sinyal mencapai konsensus ≥ 80% dan lolos seluruh aturan manajemen risiko.

### Antarmuka Multi-Platform
* **🎮 Discord Command Center:** Kategori `🐾 OPENCATZ COMMAND CENTER` dengan 6 channel otomatis dan 22 slash command.
* **💻 Terminal TUI (`opencatz terminal`):** Tampilan konsol 24-bit TrueColor ANSI yang responsif untuk VPS Linux.
* **📱 Telegram Notification Bridge:** Notifikasi push real-time ke smartphone dengan tombol aksi cepat.
* **🌐 Web Dashboard REST API (Port 3000):** Siap dihubungkan ke dashboard web Next.js atau aplikasi mobile kustom.

---

## 7. 🎟️ Live Deployment di PX Identities Discord (Khusus Holders 404 Identities)

Bagi kamu yang ingin langsung menikmati sinyal tanpa perlu setup server atau VPS sendiri: **Opencatz AI akan segera hadir secara live 24/7 di server Discord PX Identities!**

Seluruh holder koleksi **404 Identities (Robinhood Chain)** akan mendapatkan akses eksklusif:
* Akses penuh ke seluruh channel screening sinyal real-time.
* Audit smart contract on-demand langsung di Discord.
* Notifikasi pergerakan whale dan rangkuman alpha harian tanpa biaya server tambahan.

---

## 8. Panduan Instalasi Langkah Demi Langkah

### Prasyarat
* **Node.js** versi 22.12 ke atas ([Unduh Node.js](https://nodejs.org))
* **Git**
* **Discord Bot Token** dari Discord Developer Portal

### Langkah 1: Clone Repositori
```bash
git clone https://github.com/dizcorvus/opencatz-ai-robinhood-chain.git
cd "Opencatz AI (Robinhood Chain)"
```

### Langkah 2: Setup Otomatis 1-Klik
* **Pengguna Windows (PowerShell):**
  ```powershell
  .\setup.bat
  ```
* **Pengguna Linux / macOS / VPS:**
  ```bash
  bash setup.sh
  ```

### Langkah 3: Konfigurasi Interaktif (`opencatz onboard`)
Jalankan wizard konfigurasi:
```bash
opencatz onboard
```
Wizard akan memandu pengaturan mode eksekusi, token Discord/Telegram, AI provider, serta API key data (GMGN, Krystal Cloud, OpenSea, GoPlus, Uniswap, X API v2) beserta kunci cadangannya (`*_BACKUP_KEYS`).

### Langkah 4: Jalankan Bot
* **Mode Development:** `opencatz run`
* **Mode Terminal TUI:** `opencatz terminal`
* **Mode Produksi 24/7 (PM2 Daemon):** `opencatz deploy`

> ✨ Saat pertama kali bot online di server Discord, Opencatz akan **otomatis membuat kategori `🐾 OPENCATZ COMMAND CENTER`, 6 channel, dan mendaftarkan seluruh 22 slash command**.

### Perintah Penting
* `/analyze [address]`: Audit instan 3 lapis untuk sembarang kontrak token.
* `/wallet balance / setup`: Kelola burner wallet dan cek saldo on-chain.
* `/alert set [token] [target]`: Pasang alarm target harga otomatis.
* `/journal summary / export`: Rekap win-rate dan ekspor riwayat trading ke CSV.
* `opencatz doctor`: Diagnostik menyeluruh koneksi RPC, API key, dan status sub-agent.
* `opencatz update`: Pembaruan otomatis 1-perintah (git pull, build, restart PM2).

---

## 9. 🌟 Open Source & Bocoran Edisi Mendatang

Opencatz AI adalah proyek **100% Open-Source** di bawah lisensi MIT. Kami mengundang seluruh developer, trader on-chain, dan peneliti AI untuk berkolaborasi dan berkontribusi.

🔗 **GitHub Repository:** [https://github.com/dizcorvus/opencatz-ai-robinhood-chain](https://github.com/dizcorvus/opencatz-ai-robinhood-chain)

Sebagai penutup, arsitektur di Robinhood Chain ini adalah pondasi awal. Tim sedang mengembangkan **Opencatz AI Multi-Chain Edition** (Solana, Base, Arbitrum, BSC) serta **Premium Swarm Execution Engine**. Ikuti terus pembaruannya di [opencatz.xyz](https://opencatz.xyz)!
