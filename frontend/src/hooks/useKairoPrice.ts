'use client';

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { CONTRACTS, LiquidityPoolABI } from '@/lib/contracts';

export function useKairoPrice() {
  const { data, isLoading, isError, refetch } = useReadContract({
    address: CONTRACTS.LIQUIDITY_POOL,
    abi: LiquidityPoolABI,
    functionName: 'getLivePrice',
    query: {
      enabled: !!CONTRACTS.LIQUIDITY_POOL,
      refetchInterval: 15_000, // Refresh every 15 seconds
    },
  });

  const price = data ? Number(formatUnits(data, 18)) : 0;

  return {
    price,
    rawPrice: data,
    isLoading,
    isError,
    refetch,
  };
}
