'use client';

import { useReadContract } from 'wagmi';
import { useAccount } from 'wagmi';
import { CONTRACTS, AffiliateDistributorABI } from '@/lib/contracts';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Hook to check if the connected wallet is registered (has a referrer set in AffiliateDistributor).
 * A user is considered registered if referrerOf(address) != address(0).
 */
export function useRegistration() {
  const { address } = useAccount();

  const { data: referrerData, isLoading, refetch } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'referrerOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR,
      refetchInterval: 30_000,
    },
  });

  const referrer = referrerData as `0x${string}` | undefined;
  const isRegistered = !!referrer && referrer.toLowerCase() !== ZERO_ADDRESS.toLowerCase();

  return {
    isRegistered,
    referrer: isRegistered ? referrer : null,
    isLoading,
    refetch,
  };
}
