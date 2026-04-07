'use client';

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { contracts, USDT_DECIMALS } from '@/config/contracts';
import { LiquidityPoolABI } from '@/config/abis/LiquidityPool';

export function useKairoPrice() {
  const { data: priceData, isLoading, refetch } = useReadContract({
    address: contracts.liquidityPool,
    abi: LiquidityPoolABI,
    functionName: 'getLivePrice',
    query: {
      refetchInterval: 5000,
      enabled: contracts.liquidityPool !== '0x',
    },
  });

  // getLivePrice returns (usdtBalance * 1e18) / kairoTotalSupply
  // Both MockUSDT and KAIRO use 18 decimals, so price has 18-decimal precision
  // Use formatUnits for safe BigInt -> number conversion (avoids Number() precision loss)
  const price = priceData ? Number(formatUnits(priceData as bigint, USDT_DECIMALS)) : 0;

  return { price, isLoading, refetch };
}
