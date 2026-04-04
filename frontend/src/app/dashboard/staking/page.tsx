'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { motion } from 'framer-motion';
import {
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  BoltIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { useStaking } from '@/hooks/useStaking';
import { useReferral } from '@/hooks/useReferral';
import { CONTRACTS, USDTABI } from '@/lib/contracts';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { StakeRow } from '@/components/dashboard/StakeRow';
import { cn } from '@/lib/utils';
import { useWS } from '@/providers/WebSocketProvider';
import { useToast } from '@/providers/ToastProvider';

const TIERS = [
  { name: 'Tier 1', min: 10, max: 499, interval: '8 hours', closings: '3/day' },
  { name: 'Tier 2', min: 500, max: 1999, interval: '6 hours', closings: '4/day' },
  { name: 'Tier 3', min: 2000, max: Infinity, interval: '4 hours', closings: '6/day' },
];

const TIER_COLORS = ['border-dark-600', 'border-accent-500/40', 'border-primary-500/40'];
const TIER_BG_ACTIVE = ['bg-dark-700/50', 'bg-accent-500/10', 'bg-primary-500/10'];

function detectTier(amount: number) {
  if (amount >= 2000) return 2;
  if (amount >= 500) return 1;
  if (amount >= 10) return 0;
  return -1;
}

export default function StakingPage() {
  const { address, isConnected } = useAccount();
  const { stakes, totalStakeValue, isLoadingStakes, stake: doStake, compound, unstake, harvest, isWritePending, isConfirming, refetchStakes } = useStaking();
  const { subscribe } = useWS();
  const { addToast } = useToast();
  const { referrer: storedReferrer } = useReferral();

  const [amount, setAmount] = useState('');
  const [referrer, setReferrer] = useState('');
  const [unstakeModalOpen, setUnstakeModalOpen] = useState(false);
  const [selectedStakeId, setSelectedStakeId] = useState<bigint | null>(null);

  // Auto-fill referrer from localStorage on mount
  useEffect(() => {
    if (storedReferrer && !referrer) {
      setReferrer(storedReferrer);
    }
  }, [storedReferrer]); // eslint-disable-line react-hooks/exhaustive-deps

  // USDT balance
  const { data: usdtBalance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: USDTABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.USDT },
  });

  // USDT allowance
  const { data: usdtAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: USDTABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.STAKING_MANAGER] : undefined,
    query: { enabled: !!address && !!CONTRACTS.USDT && !!CONTRACTS.STAKING_MANAGER },
  });

  const { writeContract: writeApprove, data: approveTx, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveTx,
    query: {
      enabled: !!approveTx,
    },
  });

  const parsedAmount = useMemo(() => {
    const n = parseFloat(amount);
    return isNaN(n) || n <= 0 ? 0 : n;
  }, [amount]);

  const detectedTier = detectTier(parsedAmount);
  const walletBalance = usdtBalance ? Number(formatUnits(usdtBalance as bigint, 18)) : 0;
  const allowance = usdtAllowance ? Number(formatUnits(usdtAllowance as bigint, 18)) : 0;
  const needsApproval = parsedAmount > 0 && allowance < parsedAmount;

  const activeStakes = useMemo(() => stakes.filter((s) => s.active), [stakes]);

  // Stats
  const stats = useMemo(() => {
    let totalStaked = 0, totalEarned = 0, ht = 0;
    for (const s of activeStakes) {
      totalStaked += Number(formatUnits(s.amount, 18));
      totalEarned += Number(formatUnits(s.totalEarned, 18));
      if (s.tier > ht) ht = s.tier;
    }
    return { totalStaked, totalEarned, highestTier: ht, count: activeStakes.length };
  }, [activeStakes]);

  // Unstake modal data
  const unstakeData = useMemo(() => {
    if (selectedStakeId === null) return null;
    const idx = Number(selectedStakeId);
    const s = stakes[idx];
    if (!s) return null;
    const amt = Number(formatUnits(s.amount, 18));
    const harvested = Number(formatUnits(s.harvestedRewards, 18));
    const return80 = amt * 0.8;
    const finalReturn = Math.max(0, return80 - harvested);
    return { amount: amt, harvested, return80, finalReturn };
  }, [selectedStakeId, stakes]);

  const handleApprove = () => {
    const amtBig = parseUnits(amount, 18);
    writeApprove({
      address: CONTRACTS.USDT,
      abi: USDTABI,
      functionName: 'approve',
      args: [CONTRACTS.STAKING_MANAGER, amtBig],
    });
  };

  const handleStake = () => {
    const amtBig = parseUnits(amount, 18);
    const ref = (referrer && referrer.startsWith('0x') ? referrer : '0x0000000000000000000000000000000000000000') as `0x${string}`;
    doStake(amtBig, ref);
    setAmount('');
  };

  const handleUnstakeClick = (id: bigint) => {
    setSelectedStakeId(id);
    setUnstakeModalOpen(true);
  };

  const handleConfirmUnstake = () => {
    if (selectedStakeId !== null) {
      unstake(selectedStakeId);
      setUnstakeModalOpen(false);
      setSelectedStakeId(null);
    }
  };

  const isLoading = isWritePending || isConfirming;

  // Listen for compound events via WebSocket
  useEffect(() => {
    if (!address) return;
    const unsub = subscribe((msg) => {
      if (msg.type === 'compound_event' && msg.data.user.toLowerCase() === address.toLowerCase()) {
        addToast('success', 'Stake Compounded', `Stake #${msg.data.stakeId} +$${msg.data.profit} → $${msg.data.newAmount}`);
        refetchStakes();
      }
    });
    return unsub;
  }, [address, subscribe, addToast, refetchStakes]);

  // Estimated earnings
  const dailyEarnings = parsedAmount > 0 && detectedTier >= 0
    ? parsedAmount * 0.001 * (detectedTier === 2 ? 6 : detectedTier === 1 ? 4 : 3)
    : 0;
  const monthlyEarnings = dailyEarnings * 30;

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <CurrencyDollarIcon className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-dark-200 mb-2">Connect Your Wallet</h2>
        <p className="text-dark-500 text-sm">Connect your wallet to start staking</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dark-50">Staking</h1>
        <p className="text-dark-400 mt-1">Stake USDT to earn KAIRO rewards with 3X capping mechanism</p>
      </div>

      {/* Tier Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {TIERS.map((t, i) => (
          <motion.div
            key={t.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn(
              'rounded-xl p-5 border transition-all',
              detectedTier === i ? TIER_BG_ACTIVE[i] : 'bg-dark-800/40',
              detectedTier === i ? TIER_COLORS[i] : 'border-dark-700/50',
              detectedTier === i && 'ring-1 ring-primary-500/30',
            )}
          >
            <h3 className={cn('font-semibold mb-2', detectedTier === i ? 'text-primary-400' : 'text-dark-300')}>{t.name}</h3>
            <p className="text-sm text-dark-300">${t.min.toLocaleString()} - {t.max === Infinity ? '∞' : `$${t.max.toLocaleString()}`}</p>
            <p className="text-xs text-dark-500 mt-1">Compound: {t.interval} ({t.closings})</p>
            <p className="text-xs text-dark-500">0.1% per interval</p>
          </motion.div>
        ))}
      </div>

      {/* Stake Creation Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-xl p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4 flex items-center gap-2">
          <BoltIcon className="w-5 h-5 text-primary-400" />
          Create New Stake
        </h2>
        <div className="max-w-lg space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-dark-400">Amount (USDT)</label>
              <span className="text-xs text-dark-500">
                Balance: {walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount (min $10)"
                min={10}
                className="w-full px-4 py-3 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-lg font-mono focus:outline-none focus:border-primary-500 transition-colors pr-20"
              />
              <button
                onClick={() => setAmount(walletBalance.toString())}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-medium text-primary-400 bg-primary-500/10 rounded hover:bg-primary-500/20 transition-colors"
              >
                MAX
              </button>
            </div>

            {detectedTier >= 0 && parsedAmount > 0 && (
              <div className={cn('mt-2 p-2.5 rounded-lg border', TIER_BG_ACTIVE[detectedTier], TIER_COLORS[detectedTier])}>
                <p className="text-sm font-medium text-primary-400">
                  {TIERS[detectedTier].name} — Compounds every {TIERS[detectedTier].interval}
                </p>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs text-dark-400">
                    Est. daily: <span className="text-primary-300 font-mono">${dailyEarnings.toFixed(2)}</span>
                  </span>
                  <span className="text-xs text-dark-400">
                    Est. monthly: <span className="text-primary-300 font-mono">${monthlyEarnings.toFixed(2)}</span>
                  </span>
                </div>
              </div>
            )}
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

          <div className="flex items-center gap-2 text-xs text-dark-500">
            <span>Gas estimate on opBNB:</span>
            <span className="font-mono text-dark-400">~$0.001</span>
          </div>

          {needsApproval ? (
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              loading={isApproving || isApproveConfirming}
              disabled={parsedAmount < 10}
              onClick={handleApprove}
            >
              Approve USDT
            </Button>
          ) : (
            <Button
              size="lg"
              variant="primary"
              className="w-full"
              loading={isLoading}
              disabled={parsedAmount < 10 || parsedAmount > walletBalance}
              onClick={handleStake}
            >
              Stake {parsedAmount > 0 ? `$${parsedAmount.toLocaleString()}` : ''}
            </Button>
          )}
        </div>
      </motion.div>

      {/* Active Stakes Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass rounded-xl p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4">Your Active Stakes</h2>

        {isLoadingStakes ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex gap-4 items-center h-12">
                <div className="h-6 w-16 bg-dark-700 rounded" />
                <div className="h-4 flex-1 bg-dark-700 rounded" />
                <div className="h-4 w-24 bg-dark-700 rounded" />
              </div>
            ))}
          </div>
        ) : activeStakes.length === 0 ? (
          <div className="text-center py-12">
            <CurrencyDollarIcon className="w-10 h-10 text-dark-600 mx-auto mb-2" />
            <p className="text-dark-500">No active stakes</p>
            <p className="text-sm text-dark-600 mt-1">Create your first stake above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-dark-700/50">
                  {['#', 'Tier', 'Amount', 'Earned', 'Cap Progress', 'Next Compound', 'Actions'].map((h) => (
                    <th key={h} className="pb-3 text-xs font-medium text-dark-500 uppercase tracking-wider px-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeStakes.map((s, i) => (
                  <StakeRow
                    key={i}
                    stake={s}
                    index={stakes.indexOf(s)}
                    onCompound={compound}
                    onHarvest={harvest}
                    onUnstake={handleUnstakeClick}
                    isLoading={isLoading}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Staking Stats */}
      {activeStakes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CurrencyDollarIcon className="w-4 h-4 text-primary-400" />
              <span className="text-xs text-dark-500">Total Staked</span>
            </div>
            <p className="text-lg font-semibold text-dark-50 font-mono">
              ${stats.totalStaked.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowTrendingUpIcon className="w-4 h-4 text-primary-400" />
              <span className="text-xs text-dark-500">Total Earned</span>
            </div>
            <p className="text-lg font-semibold text-primary-400 font-mono">
              ${stats.totalEarned.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ChartBarIcon className="w-4 h-4 text-accent-400" />
              <span className="text-xs text-dark-500">Active Positions</span>
            </div>
            <p className="text-lg font-semibold text-dark-50 font-mono">{stats.count}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrophyIcon className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-dark-500">Highest Tier</span>
            </div>
            <p className="text-lg font-semibold text-dark-50">{TIERS[stats.highestTier].name}</p>
          </div>
        </motion.div>
      )}

      {/* Unstake Warning Modal */}
      <Modal isOpen={unstakeModalOpen} onClose={() => setUnstakeModalOpen(false)} title="Confirm Unstake">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-400">Warning: Permanent Penalties Apply</p>
              <p className="text-xs text-dark-400 mt-1">This action cannot be undone.</p>
            </div>
          </div>

          {unstakeData && (
            <div className="space-y-3 p-4 rounded-lg bg-dark-900/60">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Stake Amount</span>
                <span className="text-dark-100 font-mono">${unstakeData.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">80% Return</span>
                <span className="text-amber-400 font-mono">${unstakeData.return80.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Minus Harvested</span>
                <span className="text-red-400 font-mono">-${unstakeData.harvested.toFixed(2)}</span>
              </div>
              <div className="border-t border-dark-700/50 pt-2 flex justify-between text-sm font-semibold">
                <span className="text-dark-200">Final Return</span>
                <span className="text-dark-50 font-mono">${unstakeData.finalReturn.toFixed(2)}</span>
              </div>
            </div>
          )}

          <ul className="space-y-1.5 text-xs text-dark-400">
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">•</span>
              You will receive only 80% of your staked amount
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">•</span>
              Harvested rewards will be deducted from the return
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">•</span>
              Unharvested earnings will be permanently forfeited
            </li>
          </ul>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setUnstakeModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" className="flex-1" loading={isLoading} onClick={handleConfirmUnstake}>
              Confirm Unstake
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
