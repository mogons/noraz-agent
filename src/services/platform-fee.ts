import { isAddress, parseEther, type Address } from 'viem';
import { isDryRun as isDryRunMode } from '../config/config.js';
import type { WalletService } from './wallet-service.js';

/** 1% of the ETH size of a live buy or sell, paid in Robinhood ETH. */
export const TRADE_FEE_RATE = 0.01;
export const ROBINHOOD_CHAIN_ID = 4663;

const DEFAULT_PLATFORM_URL = 'https://api.noraz.space';
const NATIVE = '0x0000000000000000000000000000000000000000';

export interface TradeFee {
  feeTxHash: string;
  feeEth: number;
}

/** Native ETH transfer appended to a buy or sell. The address is read from the platform. */
export interface FeeInstruction {
  kind: 'fee';
  chainId: typeof ROBINHOOD_CHAIN_ID;
  to: Address;
  value: bigint;
  data: '0x';
  feeEth: number;
}

let warned = false;

/** ETH leg of a fill. Token-to-token swaps have no ETH size, so no fee is guessed. */
export function tradeSizeEth(fromToken: string, toToken: string, amountIn: number, amountOut: number): number {
  const from = fromToken.toLowerCase();
  const to = toToken.toLowerCase();
  if (from === NATIVE || from === 'eth') return amountIn;
  if (to === NATIVE || to === 'eth') return amountOut;
  return 0;
}

export function feeEthFor(amountEth: number): number {
  if (!(amountEth > 0)) return 0;
  return amountEth * TRADE_FEE_RATE;
}

/** Fee wallet from the platform API. The address is PLATFORM_FEE_ADDRESS on the backend. */
export async function fetchFeeWallet(): Promise<Address | null> {
  const root = (process.env.NORAZ_PLATFORM_URL ?? DEFAULT_PLATFORM_URL).replace(/\/$/, '');
  try {
    const res = await fetch(`${root}/platform/fee`);
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: string | null };
    if (body.address && isAddress(body.address)) return body.address;
  } catch {
    return null;
  }
  return null;
}

/** Build the fee-send instruction for this buy or sell. Null when the platform has no wallet set. */
export async function buildFeeInstruction(amountEth: number, side: 'buy' | 'sell'): Promise<FeeInstruction | null> {
  const feeEth = feeEthFor(amountEth);
  if (!(feeEth > 0)) return null;
  const to = await fetchFeeWallet();
  if (!to) {
    if (!warned) {
      warned = true;
      console.warn('[FEE] Platform fee wallet is unset. This trade will not count as volume.');
    }
    return null;
  }
  const value = parseEther(feeEth.toFixed(18));
  if (value <= 0n) return null;
  console.log(`[${side.toUpperCase()}] fee instruction: send ${feeEth} ETH on Robinhood to ${to}`);
  return { kind: 'fee', chainId: ROBINHOOD_CHAIN_ID, to, value, data: '0x', feeEth };
}

/** Broadcast the fee instruction. Dry-run does not send, so the fill will not count. */
export async function executeFeeInstruction(
  wallet: WalletService | undefined,
  instruction: FeeInstruction | null,
): Promise<TradeFee | null> {
  if (!instruction || !wallet?.hasWallet('evm') || isDryRunMode()) return null;
  try {
    const sent = await wallet.sendEvm(instruction.chainId, instruction.to, instruction.feeEth);
    console.log(`[FEE] Sent ${instruction.feeEth} ETH to ${instruction.to} (${sent.txHash}).`);
    return { feeTxHash: sent.txHash, feeEth: instruction.feeEth };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[FEE] Robinhood ETH fee failed: ${message}. This trade will not count as volume.`);
    return null;
  }
}
