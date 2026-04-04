'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  SparklesIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  GiftIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { useCMS } from '@/hooks/useCMS';
import { useStaking } from '@/hooks/useStaking';
import { useReferral } from '@/hooks/useReferral';
import { CONTRACTS, USDTABI } from '@/lib/contracts';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CountdownTimer } from '@/components/dashboard/CountdownTimer';

export default function CMSPage() {
  const { address, isConnected } = useAccount();
  const {
    claimableRewards,
    maxClaimable,
    excessToDelete,
    subscriptionCount,
    remainingSubscriptions,
    deadline,
    hasClaimed,
    canClaimResult,
    subscribe,
    claimRewards,
    isWritePending,
    isConfirming,
  } = useCMS();
  const { stakes } = useStaking();
  const { referrer: storedReferrer } = useReferral();

  const [subAmount, setSubAmount] = useState('1');
  const [referrer, setReferrer] = useState('');
  const [claimModalOpen, setClaimModalOpen] = useState(false);

  // Auto-fill referrer from localStorage on mount
  useEffect(() => {
    if (storedReferrer && !referrer) {
      setReferrer(storedReferrer);
    }
  }, [storedReferrer]); // eslint-disable-line react-hooks/exhaustive-deps

  // USDT allowance for CMS
  const { data: usdtAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: USDTABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.CMS] : undefined,
    query: { enabled: !!address && !!CONTRACTS.USDT && !!CONTRACTS.CMS },
  });

  const { writeContract: writeApprove, data: approveTx, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveTx,
    query: { enabled: !!approveTx },
  });

  const parsedSubAmount = Math.max(1, parseInt(subAmount) || 1);
  const totalCost = parsedSubAmount * 10;
  const allowance = usdtAllowance ? Number(formatUnits(usdtAllowance as bigint, 18)) : 0;
  const needsApproval = totalCost > allowance;

  const deadlineTimestamp = deadline ? Number(deadline as bigint) : 1714521600;
  const remaining = remainingSubscriptions ? Number(remainingSubscriptions as bigint) : 10000;
  const userSubs = subscriptionCount ? Number(subscriptionCount as bigint) : 0;

  const rewards = useMemo(() => {
    if (!claimableRewards) return { loyalty: 0, leadership: 0, total: 0 };
    const [l, ld, t] = claimableRewards as unknown as bigint[];
    return { loyalty: Number(formatUnits(l, 18)), leadership: Number(formatUnits(ld, 18)), total: Number(formatUnits(t, 18)) };
  }, [claimableRewards]);

  const maxClaim = maxClaimable ? Number(formatUnits(maxClaimable as bigint, 18)) : 0;
  const excess = excessToDelete ? Number(formatUnits(excessToDelete as bigint, 18)) : 0;
  const hasActiveStake = stakes.some((s) => s.active);
  const userHasClaimed = hasClaimed as boolean | undefined;

  const canClaimInfo = useMemo(() => {
    if (!canClaimResult) return { eligible: false, reason: '' };
    const [eligible, reason] = canClaimResult as [boolean, string];
    return { eligible, reason };
  }, [canClaimResult]);

  const userAmount = rewards.total > 0 ? Math.min(rewards.total, maxClaim) * 0.9 : 0;
  const systemAmount = rewards.total > 0 ? Math.min(rewards.total, maxClaim) * 0.1 : 0;

  const handleApprove = () => {
    const amtBig = parseUnits(totalCost.toString(), 18);
    writeApprove({
      address: CONTRACTS.USDT,
      abi: USDTABI,
      functionName: 'approve',
      args: [CONTRACTS.CMS, amtBig],
    });
  };

  const handleSubscribe = () => {
    const ref = (referrer && referrer.startsWith('0x') ? referrer : '0x0000000000000000000000000000000000000000') as `0x${string}`;
    subscribe(BigInt(parsedSubAmount), ref);
  };

  const isLoading = isWritePending || isConfirming;

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <SparklesIcon className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-dark-200 mb-2">Connect Your Wallet</h2>
        <p className="text-dark-500 text-sm">Connect your wallet to subscribe and claim rewards</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dark-50">Core Membership Subscription</h1>
        <p className="text-dark-400 mt-1">Subscribe to earn loyalty and leadership KAIRO rewards</p>
      </div>

      {/* CMS Status Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        <div className="glass rounded-xl p-5">
          <p className="text-sm text-dark-400 mb-2">Deadline</p>
          <CountdownTimer targetTimestamp={deadlineTimestamp} compact />
        </div>
        <div className="glass rounded-xl p-5">
          <p className="text-sm text-dark-400">Remaining Slots</p>
          <p className="text-lg font-semibold text-dark-50 font-mono mt-1">{remaining.toLocaleString()} / 10,000</p>
          <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${((10000 - remaining) / 10000) * 100}%` }}
            />
          </div>
        </div>
        <div className="glass rounded-xl p-5">
          <p className="text-sm text-dark-400">Your Subscriptions</p>
          <p className="text-lg font-semibold text-dark-50 font-mono mt-1">{userSubs}</p>
        </div>
        <div className="glass rounded-xl p-5">
          <p className="text-sm text-dark-400">Claimable Rewards</p>
          <p className="text-lg font-semibold text-primary-400 font-mono mt-1">
            {rewards.total.toLocaleString('en-US', { maximumFractionDigits: 2 })} KAIRO
          </p>
        </div>
      </motion.div>

      {/* Subscribe Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-xl p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4 flex items-center gap-2">
          <CurrencyDollarIcon className="w-5 h-5 text-primary-400" />
          Purchase Subscription
        </h2>
        <div className="max-w-lg space-y-4">
          <div>
            <label className="block text-sm text-dark-400 mb-1">Number of Subscriptions</label>
            <input
              type="number"
              min={1}
              value={subAmount}
              onChange={(e) => setSubAmount(e.target.value)}
              placeholder="1"
              className="w-full px-4 py-3 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-lg font-mono focus:outline-none focus:border-primary-500 transition-colors"
            />
            <div className="mt-2 p-3 rounded-lg bg-dark-900/60 border border-dark-700/30">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">{parsedSubAmount} × 10 USDT</span>
                <span className="text-dark-100 font-mono font-semibold">{totalCost} USDT</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-dark-500">Loyalty reward</span>
                <span className="text-primary-400 font-mono">{parsedSubAmount * 5} KAIRO</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-dark-400 mb-1">Referrer Address (optional)</label>
            <input
              type="text"
              value={referrer}
              onChange={(e) => setReferrer(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-sm focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>

          {needsApproval ? (
            <Button size="lg" variant="secondary" className="w-full" loading={isApproving || isApproveConfirming} onClick={handleApprove}>
              Approve USDT
            </Button>
          ) : (
            <Button size="lg" variant="primary" className="w-full" loading={isLoading} onClick={handleSubscribe}>
              Subscribe ({totalCost} USDT)
            </Button>
          )}
        </div>
      </motion.div>

      {/* Rewards Display */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6"
      >
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <GiftIcon className="w-5 h-5 text-primary-400" />
            <h3 className="text-sm font-semibold text-dark-200">Loyalty Rewards</h3>
          </div>
          <p className="text-2xl font-bold font-mono text-primary-400">
            {rewards.loyalty.toLocaleString('en-US', { maximumFractionDigits: 2 })} KAIRO
          </p>
          <p className="text-xs text-dark-500 mt-1">5 KAIRO per subscription</p>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheckIcon className="w-5 h-5 text-accent-400" />
            <h3 className="text-sm font-semibold text-dark-200">Leadership Rewards</h3>
          </div>
          <p className="text-2xl font-bold font-mono text-accent-400">
            {rewards.leadership.toLocaleString('en-US', { maximumFractionDigits: 2 })} KAIRO
          </p>
          <p className="text-xs text-dark-500 mt-1">From referral tree subscriptions</p>
        </div>
      </motion.div>

      {/* Claim Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-xl p-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4">Claim Rewards</h2>

        {/* No subscriptions */}
        {userSubs === 0 && (
          <div className="text-center py-8">
            <SparklesIcon className="w-10 h-10 text-dark-600 mx-auto mb-2" />
            <p className="text-dark-500">Subscribe first to earn rewards</p>
            <p className="text-xs text-dark-600 mt-1">Purchase subscriptions above to start earning KAIRO</p>
          </div>
        )}

        {/* Already claimed */}
        {userSubs > 0 && userHasClaimed && (
          <div className="text-center py-8">
            <CheckCircleIcon className="w-12 h-12 text-primary-400 mx-auto mb-3" />
            <p className="text-lg font-semibold text-primary-400">Rewards Already Claimed</p>
            <p className="text-sm text-dark-500 mt-1">You have successfully claimed your CMS rewards</p>
          </div>
        )}

        {/* No active stake */}
        {userSubs > 0 && !userHasClaimed && !hasActiveStake && (
          <div>
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-400">Active Stake Required</p>
                  <p className="text-xs text-dark-400 mt-1">
                    You must have an active stake to claim CMS rewards. Stake USDT first to unlock claiming.
                  </p>
                </div>
              </div>
            </div>
            <Link href="/dashboard/staking">
              <Button variant="primary" size="md">Stake USDT First</Button>
            </Link>
          </div>
        )}

        {/* Can claim */}
        {userSubs > 0 && !userHasClaimed && hasActiveStake && rewards.total > 0 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-dark-900/60 border border-dark-700/30 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Total Claimable</span>
                <span className="text-dark-100 font-mono font-semibold">{rewards.total.toFixed(2)} KAIRO</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Max Claimable (based on stake)</span>
                <span className="text-dark-100 font-mono font-semibold">{maxClaim.toFixed(2)} KAIRO</span>
              </div>
            </div>

            {/* Excess warning */}
            {excess > 0 && (
              <div className="p-4 rounded-lg bg-red-500/10 border-2 border-red-500/30">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="w-6 h-6 text-red-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-red-400 uppercase">
                      Warning: Claiming now will permanently delete {excess.toFixed(2)} KAIRO
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-dark-400">
                      <li>Your stake allows claiming up to <span className="text-dark-200 font-mono">{maxClaim.toFixed(2)} KAIRO</span></li>
                      <li>Excess of <span className="text-red-400 font-mono">{excess.toFixed(2)} KAIRO</span> will be destroyed forever</li>
                      <li className="text-amber-400 font-medium">Consider increasing your stake before claiming</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div className="p-4 rounded-lg bg-dark-900/40 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">90% to you</span>
                <span className="text-primary-400 font-mono">{userAmount.toFixed(2)} KAIRO</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">10% to system</span>
                <span className="text-dark-300 font-mono">{systemAmount.toFixed(2)} KAIRO</span>
              </div>
            </div>

            <Button
              size="lg"
              variant="primary"
              className="w-full"
              loading={isLoading}
              onClick={() => setClaimModalOpen(true)}
            >
              Claim Rewards
            </Button>
          </div>
        )}
      </motion.div>

      {/* Claim Confirmation Modal */}
      <Modal isOpen={claimModalOpen} onClose={() => setClaimModalOpen(false)} title="Confirm Claim">
        <div className="space-y-4">
          {excess > 0 && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-400">
                    {excess.toFixed(2)} KAIRO will be permanently deleted
                  </p>
                  <p className="text-xs text-dark-400 mt-1">
                    This cannot be undone. Consider increasing your stake to claim more.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 rounded-lg bg-dark-900/60 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-dark-400">You will receive</span>
              <span className="text-primary-400 font-mono font-semibold">{userAmount.toFixed(2)} KAIRO</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dark-400">System fee (10%)</span>
              <span className="text-dark-300 font-mono">{systemAmount.toFixed(2)} KAIRO</span>
            </div>
            {excess > 0 && (
              <div className="flex justify-between text-sm border-t border-dark-700/50 pt-2">
                <span className="text-dark-400">Permanently deleted</span>
                <span className="text-red-400 font-mono font-semibold">{excess.toFixed(2)} KAIRO</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setClaimModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              loading={isLoading}
              onClick={() => {
                claimRewards();
                setClaimModalOpen(false);
              }}
            >
              Confirm Claim
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
