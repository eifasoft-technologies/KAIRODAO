'use client';

import { useReadContract } from 'wagmi';
import { useAccount } from 'wagmi';
import { CONTRACTS, AffiliateDistributorABI, StakingManagerABI } from '@/lib/contracts';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Hook to check if the connected wallet is registered.
 * A user is considered registered if:
 *   - referrerOf(address) != address(0) in AffiliateDistributor, OR
 *   - getUserStakeCount(address) > 0 in StakingManager (staking is the registration action)
 */
export function useRegistration() {
  const { address } = useAccount();

  const { data: referrerData, isLoading: refLoading, refetch } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'referrerOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR,
      refetchInterval: 15_000,
    },
  });

  const { data: stakeCount, isLoading: stakeLoading } = useReadContract({
    address: CONTRACTS.STAKING_MANAGER,
    abi: StakingManagerABI,
    functionName: 'getUserStakeCount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!CONTRACTS.STAKING_MANAGER,
      refetchInterval: 15_000,
    },
  });

  const referrer = referrerData as `0x${string}` | undefined;
  const hasReferrer = !!referrer && referrer.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const hasStake = !!stakeCount && Number(stakeCount) > 0;

  // User is registered if they have a referrer OR have staked
  const isRegistered = hasReferrer || hasStake;
  const isLoading = refLoading || stakeLoading;

  return {
    isRegistered,
    referrer: hasReferrer ? referrer : null,
    isLoading,
    refetch,
  };
}
