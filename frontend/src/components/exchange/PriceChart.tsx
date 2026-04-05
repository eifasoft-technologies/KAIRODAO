'use client';

import { useMemo } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { CONTRACTS, LiquidityPoolABI } from '@/lib/contracts';

interface PriceChartProps {
  currentPrice: number;
}

interface PriceSnapshot {
  price: bigint;
  timestamp: bigint;
  usdtBalance: bigint;
  kairoSupply: bigint;
}

export function PriceChart({ currentPrice }: PriceChartProps) {
  const { data: snapshots, isLoading } = useReadContract({
    address: CONTRACTS.LIQUIDITY_POOL,
    abi: LiquidityPoolABI,
    functionName: 'getLatestSnapshots',
    args: [BigInt(24)],
    query: {
      enabled: !!CONTRACTS.LIQUIDITY_POOL,
      refetchInterval: 30_000,
    },
  });

  const data = useMemo(() => {
    if (!snapshots || !(snapshots as PriceSnapshot[]).length) {
      // Show current price as single point if no snapshots
      return [{ time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), price: currentPrice }];
    }
    // Snapshots come newest-first from the contract, reverse for chronological order
    return [...(snapshots as PriceSnapshot[])].reverse().map((s) => ({
      time: new Date(Number(s.timestamp) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      price: Number(formatUnits(s.price, 18)),
    }));
  }, [snapshots, currentPrice]);

  const priceChange = data.length >= 2 ? ((data[data.length - 1].price - data[0].price) / data[0].price) * 100 : 0;
  const isPositive = priceChange >= 0;

  return (
    <div className="glass rounded-xl p-4">
      {/* Price header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-dark-500">KAIRO / USDT</p>
          <p className="text-2xl font-bold font-mono text-dark-50">${currentPrice.toFixed(4)}</p>
        </div>
        <div className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-mono font-semibold ${isPositive ? 'bg-primary-500/10 text-primary-400' : 'bg-red-500/10 text-red-400'}`}>
          {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
          <span className="text-xs">24h</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[200px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-dark-500 text-sm">Loading price history...</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isPositive ? '#06b6d4' : '#ef4444'} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={isPositive ? '#06b6d4' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} domain={['dataMin', 'dataMax']} tickFormatter={(v) => `$${v.toFixed(2)}`} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', fontSize: '12px', color: '#f8fafc' }}
                formatter={(value: number) => [`$${value.toFixed(4)}`, 'Price']}
              />
              <Area type="monotone" dataKey="price" stroke={isPositive ? '#06b6d4' : '#ef4444'} fill="url(#priceGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
