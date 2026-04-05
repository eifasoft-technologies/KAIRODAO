'use client';

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { CONTRACTS, KAIROTokenABI, LiquidityPoolABI } from '@/lib/contracts';
import { useKairoPrice } from '@/hooks/useKairoPrice';

export function TokenMetrics() {
  const { price, isLoading: priceLoading } = useKairoPrice();

  const { data: totalSupplyRaw } = useReadContract({
    address: CONTRACTS.KAIRO_TOKEN, abi: KAIROTokenABI, functionName: 'totalSupply',
    query: { enabled: !!CONTRACTS.KAIRO_TOKEN, refetchInterval: 30_000 },
  });

  const { data: totalBurnedRaw } = useReadContract({
    address: CONTRACTS.KAIRO_TOKEN, abi: KAIROTokenABI, functionName: 'getTotalBurned',
    query: { enabled: !!CONTRACTS.KAIRO_TOKEN, refetchInterval: 30_000 },
  });

  const { data: balancesRaw } = useReadContract({
    address: CONTRACTS.LIQUIDITY_POOL, abi: LiquidityPoolABI, functionName: 'getBalances',
    query: { enabled: !!CONTRACTS.LIQUIDITY_POOL, refetchInterval: 30_000 },
  });

  const { data: tvlRaw } = useReadContract({
    address: CONTRACTS.LIQUIDITY_POOL, abi: LiquidityPoolABI, functionName: 'getTotalValueLocked',
    query: { enabled: !!CONTRACTS.LIQUIDITY_POOL, refetchInterval: 30_000 },
  });

  const totalSupply = totalSupplyRaw ? Number(formatUnits(totalSupplyRaw as bigint, 18)) : 0;
  const totalBurned = totalBurnedRaw ? Number(formatUnits(totalBurnedRaw as bigint, 18)) : 0;
  const usdtLiquidity = balancesRaw ? Number(formatUnits((balancesRaw as [bigint, bigint])[0], 18)) : 0;
  const tvl = tvlRaw ? Number(formatUnits(tvlRaw as bigint, 18)) : 0;

  const metrics = [
    { label: 'KAIRO Price', value: priceLoading ? '...' : `$${price.toFixed(4)}`, accent: true },
    { label: 'Total Supply', value: totalSupply > 0 ? `${Math.round(totalSupply).toLocaleString()}` : '—', accent: false },
    { label: 'Total Burned', value: totalBurned > 0 ? `${Math.round(totalBurned).toLocaleString()}` : '—', accent: false },
    { label: 'Liquidity (USDT)', value: usdtLiquidity > 0 ? `$${Math.round(usdtLiquidity).toLocaleString()}` : '—', accent: false },
    { label: 'TVL', value: tvl > 0 ? `$${Math.round(tvl).toLocaleString()}` : '—', accent: false },
  ];

  return (
    <div className="glass rounded-xl p-4 mb-6">
      <div className="flex flex-wrap items-center gap-6">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col">
            <span className="text-[10px] text-dark-500 uppercase tracking-wider">{m.label}</span>
            <span className={`text-lg font-bold font-mono ${m.accent ? 'text-primary-400' : 'text-dark-100'}`}>
              {m.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
