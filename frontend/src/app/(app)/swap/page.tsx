'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { GlassCard, Button, Input } from '@/components/ui';
import { useSwap } from '@/hooks/useSwap';
import { useKairoPrice } from '@/hooks/useKairoPrice';
import { useApproval } from '@/hooks/useApproval';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import { contracts, KAIRO_DECIMALS, USDT_DECIMALS, SWAP_FEE_BPS } from '@/config/contracts';
import { parseUnits, formatUnits } from 'viem';
import { formatPrice, formatCompact } from '@/lib/utils';
import {
  ArrowsRightLeftIcon,
  ArrowDownIcon,
  FireIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

export default function SwapPage() {
  const { isConnected } = useAccount();
  const [kairoAmount, setKairoAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const { price } = useKairoPrice();
  const { swap, isPending, poolBalances } = useSwap();
  const { kairoFormatted } = useTokenBalances();
  const approval = useApproval(contracts.kairoToken, contracts.liquidityPool);

  // Pool USDT balance (liquidity)
  const poolKairo = poolBalances ? Number(formatUnits(BigInt(poolBalances[0] || 0), KAIRO_DECIMALS)) : 0;
  const poolUsdt = poolBalances ? Number(formatUnits(BigInt(poolBalances[1] || 0), USDT_DECIMALS)) : 0;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-400 to-secondary-400 flex items-center justify-center mb-2 shadow-xl shadow-primary-300/30">
          <ArrowsRightLeftIcon className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-orbitron font-bold text-surface-900">Connect Wallet to Swap</h2>
        <p className="text-surface-500 text-sm">One-way KAIRO to USDT swap with deflationary burn</p>
        <ConnectButton />
      </div>
    );
  }

  const numAmount = Number(kairoAmount) || 0;
  const grossUsdt = numAmount * price;
  const fee = grossUsdt * (SWAP_FEE_BPS / 10000);
  const netUsdt = grossUsdt - fee;
  const slippagePercent = Number(slippage) || 0.5;
  const minOutput = netUsdt * (1 - slippagePercent / 100);
  const kairoAmountBigInt = numAmount > 0 ? parseUnits(kairoAmount, KAIRO_DECIMALS) : BigInt(0);
  const minOutputBigInt = minOutput > 0 ? parseUnits(minOutput.toFixed(6), USDT_DECIMALS) : BigInt(0);
  const needsApproval = numAmount > 0 && !approval.hasAllowance(kairoAmountBigInt);
  const priceImpact = poolKairo > 0 ? (numAmount / poolKairo) * 100 : 0;

  const handleSwap = () => {
    if (needsApproval) {
      approval.approve(kairoAmountBigInt);
      return;
    }
    swap(kairoAmountBigInt, minOutputBigInt);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-orbitron font-bold gradient-text">Swap</h1>
        <p className="text-base text-surface-500 mt-1">One-way swap with 3% fee and deflationary burn</p>
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        {/* Pool Liquidity Info */}
        <GlassCard padding="p-3" variant="gold">
          <p className="text-[10px] uppercase tracking-wider text-surface-400">Pool Liquidity (USDT)</p>
          <p className="text-lg font-mono font-bold text-surface-900">${formatCompact(poolUsdt, 2)}</p>
        </GlassCard>

        <GlassCard variant="gradient">
          <div className="mb-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-primary-400/30">
              <ArrowsRightLeftIcon className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm text-surface-500">KAIRO → USDT</p>
            <p className="text-xs text-surface-400">Swap includes deflationary burn</p>
          </div>

          <div className="space-y-4">
            {/* Input */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-primary-50/60 to-white/70 border-2 border-primary-200/40 hover:border-primary-300 transition-colors">
              <div className="flex justify-between mb-2">
                <span className="text-xs text-surface-500">You Pay</span>
                <button
                  onClick={() => setKairoAmount(Number(kairoFormatted).toFixed(6))}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  MAX: {Number(kairoFormatted).toFixed(2)}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={kairoAmount}
                  onChange={(e) => setKairoAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent text-2xl font-mono font-bold text-surface-900 outline-none flex-1 w-0"
                />
                <span className="text-sm font-semibold text-primary-700 px-3 py-1.5 rounded-xl bg-primary-100 border-2 border-primary-200/60">KAIRO</span>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-secondary-400 flex items-center justify-center shadow-md shadow-primary-300/30">
                <ArrowDownIcon className="w-4 h-4 text-white" />
              </div>
            </div>

            {/* Output */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-accent-50/60 to-white/70 border-2 border-accent-200/40">
              <div className="flex justify-between mb-2">
                <span className="text-xs text-surface-500">You Receive (estimated)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-mono font-bold text-surface-900 flex-1">
                  {netUsdt > 0 ? netUsdt.toFixed(2) : '0.00'}
                </span>
                <span className="text-sm font-semibold text-accent-700 px-3 py-1.5 rounded-xl bg-accent-100 border-2 border-accent-200/60">USDT</span>
              </div>
            </div>

            {/* Details */}
            {numAmount > 0 && (
              <div className="p-4 rounded-xl bg-white/60 border border-surface-200 space-y-2 text-xs">
                <div className="flex justify-between text-surface-500">
                  <span>Rate</span>
                  <span className="font-mono">1 KAIRO = ${formatPrice(price)} USDT</span>
                </div>
                <div className="flex justify-between text-surface-500">
                  <span className="flex items-center gap-1">
                    <FireIcon className="w-3 h-3 text-danger-400" /> Fee (3%)
                  </span>
                  <span className="font-mono">${formatCompact(fee, 4)}</span>
                </div>
                <div className="flex justify-between text-surface-500">
                  <span>Min Output ({slippage}% slippage)</span>
                  <span className="font-mono">${formatCompact(minOutput, 4)}</span>
                </div>
                {priceImpact > 0.01 && (
                  <div className={`flex justify-between ${priceImpact > 5 ? 'text-danger-500 font-semibold' : 'text-surface-500'}`}>
                    <span className="flex items-center gap-1">
                      <InformationCircleIcon className="w-3 h-3" /> Price Impact
                    </span>
                    <span className="font-mono">{priceImpact.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Slippage */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500">Slippage:</span>
              {['0.5', '1', '2'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSlippage(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    slippage === s
                      ? 'bg-primary-50 text-primary-700 border border-primary-200 shadow-sm'
                      : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>

            <Button
              onClick={handleSwap}
              loading={isPending || approval.isPending}
              disabled={numAmount <= 0}
              className="w-full"
            >
              {needsApproval ? 'Approve KAIRO' : 'Swap KAIRO → USDT'}
            </Button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
