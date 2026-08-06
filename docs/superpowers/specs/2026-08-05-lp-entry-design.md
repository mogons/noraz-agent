# Design Specification: Concentrated Liquidity (LP) Entry Execution

This document details the design and architecture for executing autonomous Concentrated Liquidity Pool (LP) deposits on Solana (Meteora DLMM) and EVM (Robinhood Chain) via the Athena bot interface.

---

## 1. Objectives

- **Simulated & Live Execution**: Support both `DRY_RUN` (simulated) and live blockchain executions.
- **Solana (Meteora DLMM)**: Add concentrated liquidity on Solana using the `@meteora-ag/dlmm` SDK with customizable bin distributions (Spot, Curve, Bid-Ask).
- **EVM (Robinhood Chain)**: Add concentrated liquidity on Robinhood Chain's Uniswap deployment using `viem` to write to the `NonfungiblePositionManager` contract within specific price/tick boundaries.
- **Discord Controls**: Hook up the `execute_lp_add_` buttons in Discord LP Call Cards to trigger liquidity deposits.

---

## 2. API & Data Structures

### Solana LP Request & Result
```typescript
export interface SolanaLPRequest {
  poolAddress: string;
  amountSol: number;
  distributionType: 'Spot' | 'Curve' | 'Bid-Ask';
}

export interface SolanaLPResult {
  success: boolean;
  txHash?: string;
  simulated: boolean;
  error?: string;
}
```

### EVM LP Request & Result
```typescript
export interface EVMLPRequest {
  poolAddress: string;
  amountEth: number;
  minPrice: number;
  maxPrice: number;
}

export interface EVMLPResult {
  success: boolean;
  txHash?: string;
  simulated: boolean;
  error?: string;
}
```

---

## 3. Component Details

### A. Solana Adapter (`src/adapters/solana-adapter.ts`)
We will add `executeAddLiquidityMeteora` to the existing `SolanaTradeAdapter` class.
- **Dry-Run Mode**: Returns a simulated success payload with a mocked transaction hash.
- **Live Mode**:
  1. Initializes the `DLMM` pool instance using the Meteora SDK.
  2. Wraps and swaps native SOL to ensure correct ratio of Token A / Token B.
  3. Prepares the liquidity addition transaction based on the selected bin distribution model.
  4. Signs and broadcasts transaction.

### B. EVM Adapter (`src/adapters/evm-adapter.ts`)
We will add `executeAddLiquidityUniswap` to the existing `EVMTradeAdapter` class.
- **Dry-Run Mode**: Returns a simulated success payload.
- **Live Mode**:
  1. Interacts with the Uniswap `NonfungiblePositionManager` contract deployed on Robinhood Chain using `viem`.
  2. Encodes the tick ranges corresponding to `minPrice` and `maxPrice`.
  3. Executes the multi-call transaction (approve token, wrap ETH, mint LP position).

### C. Discord Interaction Handler (`src/discord/handlers/interaction-handler.ts`)
Add a case in `handleButtonPress` to capture `execute_lp_add_${symbol}` custom IDs:
1. Parse the pool symbol and metadata from the interaction.
2. Call the corresponding adapter method based on the network domain (Solana or EVM).
3. Post the success card/confirmation to the user.

---

## 4. Verification & Testing

### Dry Run Verification
- Click `Add Liquidity` on Solana and EVM signal cards in Discord.
- Verify that a success message is returned instantly with a simulated transaction hash.

### Build Verification
- Execute `npx tsc --noEmit` and `npm run build` to verify no compile-time regressions are introduced.
