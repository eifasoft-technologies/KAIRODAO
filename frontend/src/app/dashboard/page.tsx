'use client';

import { useMemo, useEffect, useCallback, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { motion } from 'framer-motion';
import {
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  GiftIcon,
  SparklesIcon,
  ArrowRightIcon,
  BoltIcon,
  CreditCardIcon,
  ArrowsRightLeftIcon,
  ExclamationTriangleIcon,
  BeakerIcon,
  LinkIcon,
  UserGroupIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useStaking } from '@/hooks/useStaking';
import { useCMS } from '@/hooks/useCMS';
import { useReferral } from '@/hooks/useReferral';
import { CONTRACTS, AffiliateDistributorABI, USDTABI } from '@/lib/contracts';
import { StatCard } from '@/components/ui/StatCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { IncomeBreakdown } from '@/components/dashboard/IncomeBreakdown';
import { useWS } from '@/providers/WebSocketProvider';
import { useToast } from '@/providers/ToastProvider';

const TIER_NAMES = ['Tier 1', 'Tier 2', 'Tier 3'];
const TIER_BG = ['bg-dark-600', 'bg-accent-500/20', 'bg-primary-500/20'];
const TIER_TEXT = ['text-dark-300', 'text-accent-400', 'text-primary-400'];
const COMPOUND_INTERVALS = [8, 6, 4];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { stakes, totalStakeValue, isLoadingStakes, refetchStakes } = useStaking();
  const { claimableRewards, hasClaimed, subscriptionCount } = useCMS();
  const { referralLink } = useReferral();
  const { subscribe } = useWS();
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  // Testnet Faucet — mint MockUSDT
  const { data: usdtBalance, refetch: refetchUsdtBalance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: USDTABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.USDT, refetchInterval: 15_000 },
  });

  const {
    writeContract: writeMint,
    data: mintTxHash,
    isPending: isMintPending,
    reset: resetMint,
  } = useWriteContract();

  const { isLoading: isMintConfirming, isSuccess: isMintSuccess } = useWaitForTransactionReceipt({
    hash: mintTxHash,
  });

  const handleMint = useCallback(() => {
    if (!address) return;
    writeMint({
      address: CONTRACTS.USDT,
      abi: USDTABI,
      functionName: 'mint',
      args: [address, parseUnits('100000', 18)],
    });
  }, [address, writeMint]);

  // React to mint success
  useEffect(() => {
    if (isMintSuccess) {
      addToast('success', 'Faucet', 'Successfully minted 100,000 Test USDT!');
      refetchUsdtBalance();
      resetMint();
    }
  }, [isMintSuccess, addToast, refetchUsdtBalance, resetMint]);

  const formattedUsdtBalance = usdtBalance
    ? Number(formatUnits(usdtBalance as bigint, 18)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';

  const isMinting = isMintPending || isMintConfirming;

  // Affiliate income
  const { data: allIncome } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'getAllIncome',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR, refetchInterval: 30_000 },
  });

  const { data: totalHarvestable } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'getTotalHarvestable',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR, refetchInterval: 30_000 },
  });

  // Direct referral count
  const { data: directCountData } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'directCount',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR, refetchInterval: 30_000 },
  });

  // Team volume
  const { data: teamVolumeData } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'getTeamVolume',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR, refetchInterval: 30_000 },
  });

  const directCount = directCountData ? Number(directCountData as bigint) : 0;
  const teamVolumeUSD = teamVolumeData ? Number(formatUnits(teamVolumeData as bigint, 18)) : 0;

  // Computed values
  const totalStakedUSD = totalStakeValue ? Number(formatUnits(totalStakeValue as bigint, 18)) : 0;
  const harvestableUSD = totalHarvestable ? Number(formatUnits(totalHarvestable as bigint, 18)) : 0;

  const income = useMemo(() => {
    if (!allIncome) return { direct: 0, team: 0, rank: 0, qWeekly: 0, qMonthly: 0 };
    const [d, t, r, w, m] = allIncome as unknown as bigint[];
    return {
      direct: Number(formatUnits(d, 18)),
      team: Number(formatUnits(t, 18)),
      rank: Number(formatUnits(r, 18)),
      qWeekly: Number(formatUnits(w, 18)),
      qMonthly: Number(formatUnits(m, 18)),
    };
  }, [allIncome]);

  const activeStakes = useMemo(() => stakes.filter((s) => s.active), [stakes]);

  const { totalEarned, totalCap, capPercent, highestTier } = useMemo(() => {
    let earned = 0, cap = 0, ht = 0;
    for (const s of activeStakes) {
      earned += Number(formatUnits(s.totalEarned, 18));
      cap += Number(formatUnits(s.originalAmount, 18)) * 3;
      if (s.tier > ht) ht = s.tier;
    }
    return { totalEarned: earned, totalCap: cap, capPercent: cap > 0 ? (earned / cap) * 100 : 0, highestTier: ht };
  }, [activeStakes]);

  const cmsRewards = useMemo(() => {
    if (!claimableRewards) return { loyalty: 0, leadership: 0, total: 0 };
    const [l, ld, t] = claimableRewards as unknown as bigint[];
    return { loyalty: Number(formatUnits(l, 18)), leadership: Number(formatUnits(ld, 18)), total: Number(formatUnits(t, 18)) };
  }, [claimableRewards]);

  const capColor = capPercent >= 80 ? 'danger' : capPercent >= 50 ? 'accent' : 'primary';

  const handleCopyReferral = useCallback(() => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      addToast('success', 'Copied!', 'Referral link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [referralLink, addToast]);

  // Listen for compound events via WebSocket
  useEffect(() => {
    if (!address) return;
    const unsub = subscribe((msg) => {
      if (msg.type === 'compound_event' && msg.data.user.toLowerCase() === address.toLowerCase()) {
        addToast('success', 'Stake Compounded', `Stake #${msg.data.stakeId} earned +$${msg.data.profit}`);
        refetchStakes();
      }
      if (msg.type === 'stake_created' && msg.data.user.toLowerCase() === address.toLowerCase()) {
        addToast('info', 'New Stake Created', `$${msg.data.amount} staked in Tier ${msg.data.tier + 1}`);
        refetchStakes();
      }
    });
    return unsub;
  }, [address, subscribe, addToast, refetchStakes]);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <CurrencyDollarIcon className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-dark-200 mb-2">Connect Your Wallet</h2>
        <p className="text-dark-500 text-sm">Connect your wallet to view your dashboard</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dark-50">Dashboard Overview</h1>
        <p className="text-dark-400 mt-1">Monitor your staking positions, rewards, and team performance</p>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <motion.div {...fadeUp}>
          <StatCard
            label="Total Staked Value"
            value={`$${totalStakedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<CurrencyDollarIcon className="w-5 h-5" />}
            trend={activeStakes.length > 0 ? { value: activeStakes.length, label: 'positions' } : undefined}
          />
          {activeStakes.length > 0 && (
            <div className="mt-2 px-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TIER_BG[highestTier]} ${TIER_TEXT[highestTier]}`}>
                {TIER_NAMES[highestTier]}
              </span>
            </div>
          )}
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
          <div className="glass rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-dark-400 mb-1">Available to Harvest</p>
                <p className="text-2xl font-semibold text-dark-50 font-mono">
                  ${harvestableUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-primary-500/10 text-primary-400">
                <GiftIcon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <IncomeBreakdown {...income} />
            </div>
            {harvestableUSD >= 10 && (
              <Button size="sm" variant="primary" className="w-full mt-3">
                Harvest All
              </Button>
            )}
          </div>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.2 }}>
          <div className="glass rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-dark-400 mb-1">3X Cap Progress</p>
                <p className="text-2xl font-semibold text-dark-50 font-mono">{capPercent.toFixed(1)}%</p>
              </div>
              <div className="p-2 rounded-lg bg-primary-500/10 text-primary-400">
                <ArrowTrendingUpIcon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <ProgressBar value={capPercent} color={capColor} showPercentage={false} />
              <p className="text-xs text-dark-500 mt-2">
                {capPercent < 100
                  ? `${(100 - capPercent).toFixed(1)}% until cap`
                  : 'Cap reached!'}
              </p>
              <p className="text-[10px] text-dark-600 mt-0.5">
                ${totalEarned.toFixed(2)} / ${totalCap.toFixed(2)}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.3 }}>
          <div className="glass rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-dark-400 mb-1">CMS Rewards</p>
                <p className="text-2xl font-semibold text-dark-50 font-mono">
                  {cmsRewards.total.toLocaleString('en-US', { maximumFractionDigits: 2 })} KAIRO
                </p>
              </div>
              <div className="p-2 rounded-lg bg-primary-500/10 text-primary-400">
                <SparklesIcon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-dark-500">Loyalty</span>
                <span className="text-dark-300 font-mono">{cmsRewards.loyalty.toFixed(2)} KAIRO</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-dark-500">Leadership</span>
                <span className="text-dark-300 font-mono">{cmsRewards.leadership.toFixed(2)} KAIRO</span>
              </div>
            </div>
            {cmsRewards.total > 0 && !hasClaimed && activeStakes.length === 0 && (
              <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-3 h-3" /> Stake required to claim
                </p>
              </div>
            )}
            {cmsRewards.total > 0 && !hasClaimed && activeStakes.length > 0 && (
              <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-3 h-3" /> Use It or Lose It
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Active Stakes Summary */}
      <motion.div {...fadeUp} transition={{ delay: 0.4 }} className="glass rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-dark-50">Active Stakes</h2>
          {activeStakes.length > 0 && (
            <Link href="/dashboard/staking" className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors">
              View All <ArrowRightIcon className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {isLoadingStakes ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex gap-4 items-center">
                <div className="h-8 w-16 bg-dark-700 rounded" />
                <div className="h-4 flex-1 bg-dark-700 rounded" />
                <div className="h-4 w-24 bg-dark-700 rounded" />
              </div>
            ))}
          </div>
        ) : activeStakes.length === 0 ? (
          <div className="text-center py-12">
            <CurrencyDollarIcon className="w-10 h-10 text-dark-600 mx-auto mb-2" />
            <p className="text-dark-500">No active stakes found</p>
            <p className="text-sm text-dark-600 mt-1">Create your first stake to start earning</p>
            <Link href="/dashboard/staking">
              <Button size="sm" variant="primary" className="mt-4">
                Stake Now
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-dark-700/50">
                  <th className="pb-2 text-xs font-medium text-dark-500 uppercase tracking-wider">Tier</th>
                  <th className="pb-2 text-xs font-medium text-dark-500 uppercase tracking-wider">Amount</th>
                  <th className="pb-2 text-xs font-medium text-dark-500 uppercase tracking-wider">Earned</th>
                  <th className="pb-2 text-xs font-medium text-dark-500 uppercase tracking-wider">Cap Progress</th>
                </tr>
              </thead>
              <tbody>
                {activeStakes.slice(0, 3).map((s, i) => {
                  const amt = Number(formatUnits(s.amount, 18));
                  const origAmt = Number(formatUnits(s.originalAmount, 18));
                  const earned = Number(formatUnits(s.totalEarned, 18));
                  const cp = origAmt > 0 ? (earned / (origAmt * 3)) * 100 : 0;
                  const cc = cp >= 80 ? 'danger' : cp >= 50 ? 'accent' : 'primary';
                  return (
                    <tr key={i} className="border-b border-dark-700/30">
                      <td className="py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_BG[s.tier]} ${TIER_TEXT[s.tier]}`}>
                          {TIER_NAMES[s.tier]}
                        </span>
                      </td>
                      <td className="py-3 text-sm font-mono text-dark-100">
                        ${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 text-sm font-mono text-primary-400">
                        ${earned.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 min-w-[120px]">
                        <ProgressBar value={cp} color={cc} showPercentage={true} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Referral Link + My Team */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div {...fadeUp} transition={{ delay: 0.45 }}>
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary-500/10 text-primary-400">
                <LinkIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-dark-100">Your Referral Link</h3>
                <p className="text-[10px] text-dark-500">{directCount} direct referral{directCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 text-dark-400 text-xs font-mono truncate">
                {referralLink || 'Connect wallet to generate'}
              </div>
              <button
                onClick={handleCopyReferral}
                disabled={!referralLink}
                className="px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copied ? (
                  <><CheckIcon className="w-3.5 h-3.5" /> Copied</>
                ) : (
                  <><ClipboardDocumentIcon className="w-3.5 h-3.5" /> Copy</>
                )}
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.48 }}>
          <Link href="/dashboard/referrals" className="glass rounded-xl p-5 glass-hover group block h-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-accent-500/10 text-accent-400 group-hover:bg-accent-500/20 transition-colors">
                <UserGroupIcon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-dark-100">My Team</h3>
                <p className="text-[10px] text-dark-500">View your referral network</p>
              </div>
              <ArrowRightIcon className="w-4 h-4 text-dark-500 group-hover:text-accent-400 transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="px-3 py-2 rounded-lg bg-dark-900/60">
                <p className="text-[10px] text-dark-500">Direct Referrals</p>
                <p className="text-lg font-semibold text-dark-50 font-mono">{directCount}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-dark-900/60">
                <p className="text-[10px] text-dark-500">Team Volume</p>
                <p className="text-lg font-semibold text-dark-50 font-mono">
                  ${teamVolumeUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </Link>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div {...fadeUp} transition={{ delay: 0.5 }} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/dashboard/staking" className="glass rounded-xl p-5 glass-hover group">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-500/10 text-primary-400 group-hover:bg-primary-500/20 transition-colors">
              <BoltIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-dark-100">Stake USDT</p>
              <p className="text-xs text-dark-500">Earn 0.1% per compound</p>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/cms" className="glass rounded-xl p-5 glass-hover group">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-accent-500/10 text-accent-400 group-hover:bg-accent-500/20 transition-colors">
              <CreditCardIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-dark-100">Subscribe CMS</p>
              <p className="text-xs text-dark-500">Earn KAIRO loyalty rewards</p>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/trading" className="glass rounded-xl p-5 glass-hover group">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
              <ArrowsRightLeftIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-dark-100">Create Order</p>
              <p className="text-xs text-dark-500">Trade KAIRO P2P</p>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Testnet Faucet */}
      <motion.div {...fadeUp} transition={{ delay: 0.6 }} className="mt-6">
        <div className="glass rounded-xl p-6 border border-cyan-500/20 bg-cyan-500/[0.03]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <BeakerIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-dark-50">Testnet Faucet</h2>
              <p className="text-xs text-dark-500">Mint test USDT for development &amp; testing on opBNB testnet</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-dark-500 mb-1">Your USDT Balance</p>
              <p className="text-2xl font-semibold text-dark-50 font-mono">${formattedUsdtBalance}</p>
            </div>
            <button
              onClick={handleMint}
              disabled={isMinting || !isConnected}
              className="relative px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200
                bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/20
                hover:shadow-cyan-500/40 hover:scale-[1.02]
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-cyan-500/20"
            >
              {isMinting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isMintConfirming ? 'Confirming...' : 'Minting...'}
                </span>
              ) : (
                'Mint 100,000 Test USDT'
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
