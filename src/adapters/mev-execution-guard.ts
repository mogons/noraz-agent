import { Connection, Transaction } from '@solana/web3.js';
import { createPublicClient, http } from 'viem';

export interface TransactionSimulationResult {
  success: boolean;
  estimatedGasUnits?: number;
  simulatedSlippagePercent?: number;
  errorMessage?: string;
}

export class MEVExecutionGuard {
  private solanaRpc: string;
  private evmRpc: string;

  constructor() {
    this.solanaRpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.evmRpc = process.env.EVM_RPC_URL || process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  }

  public async simulateTransaction(chain: 'solana' | 'evm', txPayload: any): Promise<TransactionSimulationResult> {
    try {
      if (chain === 'solana') {
        if (!txPayload?.serializedTransaction) {
          return { success: false, errorMessage: 'Missing serializedTransaction for Solana simulation.' };
        }
        const connection = new Connection(this.solanaRpc, 'confirmed');
        const tx = Transaction.from(Buffer.from(txPayload.serializedTransaction, 'base64'));
        const sim = await connection.simulateTransaction(tx);
        if (sim.value.err) {
          return { success: false, errorMessage: String(sim.value.err) };
        }
        return { success: true, estimatedGasUnits: sim.value.unitsConsumed ?? undefined, simulatedSlippagePercent: 0 };
      }

      if (chain === 'evm') {
        if (!txPayload?.from || !txPayload?.to || !txPayload?.data) {
          return { success: false, errorMessage: 'Missing from/to/data for EVM simulation.' };
        }
        const client = createPublicClient({ transport: http(this.evmRpc) });
        const gas = await client.estimateGas({
          account: txPayload.from,
          to: txPayload.to,
          data: txPayload.data,
          value: txPayload.value ? BigInt(txPayload.value) : undefined,
        });
        return { success: true, estimatedGasUnits: Number(gas), simulatedSlippagePercent: 0 };
      }
      return { success: false, errorMessage: 'Unknown chain.' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, errorMessage: message };
    }
  }

  public getDynamicPriorityFeeGwei(chain: 'solana' | 'evm'): number {
    if (chain === 'solana') return Number(process.env.SOLANA_PRIORITY_FEE_MICRO || 0);
    return Number(process.env.EVM_PRIORITY_FEE_GWEI || 0);
  }
}

export const globalMEVExecutionGuard = new MEVExecutionGuard();
