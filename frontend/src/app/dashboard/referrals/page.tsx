'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { motion } from 'framer-motion';
import {
  UserGroupIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ShareIcon,
  LinkIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  ArrowUpIcon,
} from '@heroicons/react/24/outline';
import { CONTRACTS, AffiliateDistributorABI } from '@/lib/contracts';
import { StatCard } from '@/components/ui/StatCard';
import { ReferralTree, type ReferralNode } from '@/components/dashboard/ReferralTree';
import { formatAddress } from '@/lib/utils';
import { useReferral } from '@/hooks/useReferral';
import { useToast } from '@/providers/ToastProvider';
import { QualifierPools } from '@/components/dashboard/QualifierPools';

export default function ReferralsPage() {
  const { address, isConnected } = useAccount();
  const { referralLink } = useReferral();
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  // Direct referrals
  const { data: directReferrals } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'getDirectReferrals',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR },
  });

  // Team volume
  const { data: teamVolume } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'getTeamVolume',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR },
  });

  // My upline (who referred me)
  const { data: myReferrer } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'referrerOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR },
  });

  // All income (for total earned display)
  const { data: allIncome } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'getAllIncome',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR },
  });

  // Direct count from contract
  const { data: directCountData } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'directCount',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.AFFILIATE_DISTRIBUTOR },
  });

  const directCount = directCountData ? Number(directCountData as bigint) : (directReferrals as string[] | undefined)?.length ?? 0;
  const teamVolumeUSD = teamVolume ? Number(formatUnits(teamVolume as bigint, 18)) : 0;

  // Build tree data from direct referrals (mock deeper levels for display)
  const treeData: ReferralNode[] = useMemo(() => {
    if (!directReferrals) return [];
    return (directReferrals as string[]).map((addr) => ({
      address: addr,
      volume: 0,
      level: 1,
      children: [],
    }));
  }, [directReferrals]);

  const handleCopy = useCallback(() => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      addToast('success', 'Copied!', 'Referral link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [referralLink, addToast]);

  const totalEarned = useMemo(() => {
    if (!allIncome) return 0;
    const [d, t, r, w, m] = allIncome as unknown as bigint[];
    return Number(formatUnits(d + t + r + w + m, 18));
  }, [allIncome]);

  const uplineAddress = myReferrer as string | undefined;
  const hasUpline = uplineAddress && uplineAddress !== '0x0000000000000000000000000000000000000000';

  const shareTwitter = () => {
    const text = encodeURIComponent(`Join me on KAIRO DeFi! Stake USDT and earn KAIRO rewards. ${referralLink}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const shareTelegram = () => {
    const text = encodeURIComponent(`Join me on KAIRO DeFi! Stake USDT and earn KAIRO rewards.`);
    const url = encodeURIComponent(referralLink);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank');
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <UserGroupIcon className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-dark-200 mb-2">Connect Your Wallet</h2>
        <p className="text-dark-500 text-sm">Connect your wallet to view your referral network</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dark-50">Referral System</h1>
        <p className="text-dark-400 mt-1">Build your team and earn from 5 levels of referral rewards</p>
      </div>

      {/* Referral Link Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-xl p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4 flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-primary-400" />
          Your Referral Link
        </h2>
        <div className="flex gap-2 mb-4">
          <div className="flex-1 px-4 py-2.5 rounded-lg bg-dark-900 border border-dark-700 text-dark-300 text-sm font-mono truncate">
            {referralLink || 'Connect wallet to generate'}
          </div>
          <button
            onClick={handleCopy}
            className="px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-all flex items-center gap-2 shrink-0"
          >
            {copied ? (
              <>
                <CheckIcon className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <ClipboardDocumentIcon className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={shareTwitter}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-dark-100 text-sm transition-colors border border-dark-700/50"
          >
            <ShareIcon className="w-4 h-4" />
            Twitter
          </button>
          <button
            onClick={shareTelegram}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-dark-100 text-sm transition-colors border border-dark-700/50"
          >
            <ShareIcon className="w-4 h-4" />
            Telegram
          </button>
        </div>

        {/* QR Code placeholder */}
        <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-dark-900/40 border border-dark-700/30">
          <div className="w-20 h-20 rounded-lg bg-dark-800 border border-dark-700 flex items-center justify-center text-dark-600 text-xs">
            QR
          </div>
          <div>
            <p className="text-xs text-dark-400">Scan to use referral link</p>
            <p className="text-[10px] text-dark-600 mt-0.5 font-mono break-all">{referralLink}</p>
          </div>
        </div>
      </motion.div>

      {/* My Upline */}
      {hasUpline && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="glass rounded-xl p-4 mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-500/10 text-accent-400">
              <ArrowUpIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-dark-500">Your Upline (Referred by)</p>
              <p className="text-sm font-mono text-dark-200">{formatAddress(uplineAddress!)}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Referral Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <StatCard
          label="Direct Referrals"
          value={directCount.toString()}
          icon={<UserGroupIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Team Volume"
          value={`$${teamVolumeUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon={<CurrencyDollarIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Total Earned"
          value={`$${totalEarned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={<CurrencyDollarIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Referral Addresses"
          value={(directReferrals as string[] | undefined)?.length.toString() ?? '0'}
          icon={<UserGroupIcon className="w-5 h-5" />}
        />
      </motion.div>

      {/* 5-Level Tree */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-xl p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4">Referral Tree (5 Levels)</h2>
        <ReferralTree data={treeData} />
      </motion.div>

      {/* Team Volume Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-xl p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4">Volume by Level</h2>
        {directCount === 0 ? (
          <div className="text-center py-8">
            <p className="text-dark-500">No team data yet</p>
            <p className="text-xs text-dark-600 mt-1">Invite referrals to see volume breakdown</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-dark-700/50">
                  <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">Level</th>
                  <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider"># Users</th>
                  <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">Volume</th>
                  <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">% of Total</th>
                  <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 15 }, (_, i) => {
                  const lvl = i + 1;
                  const users = lvl === 1 ? directCount : 0;
                  const vol = lvl === 1 ? teamVolumeUSD : 0;
                  const pct = teamVolumeUSD > 0 ? (vol / teamVolumeUSD) * 100 : 0;
                  return (
                    <tr key={lvl} className="border-b border-dark-700/30">
                      <td className="py-2.5 text-sm">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-400">
                          L{lvl}
                        </span>
                      </td>
                      <td className="py-2.5 text-sm text-dark-300 font-mono">{users}</td>
                      <td className="py-2.5 text-sm text-dark-100 font-mono">${vol.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td className="py-2.5 text-sm text-dark-400 font-mono">{pct.toFixed(1)}%</td>
                      <td className="py-2.5 w-32">
                        <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full transition-all"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Leg Balance Indicator */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass rounded-xl p-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4">Leg Balance</h2>
        <div className="p-4 rounded-lg bg-dark-900/40 border border-dark-700/30 mb-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-dark-200 font-medium">50% Max Per Leg Rule</p>
              <p className="text-xs text-dark-400 mt-1">
                For rank qualification, no single referral leg can contribute more than 50% of your total team volume.
                Build balanced legs for optimal rank progression.
              </p>
            </div>
          </div>
        </div>

        {directCount === 0 ? (
          <div className="text-center py-8">
            <p className="text-dark-500">No legs to display</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(directReferrals as string[] | undefined)?.slice(0, 10).map((addr, i) => {
              const legPct = directCount > 0 ? 100 / directCount : 0;
              const isOverLimit = legPct > 50;
              return (
                <div key={addr} className="flex items-center gap-3">
                  <span className="text-xs text-dark-500 w-6 text-right font-mono">{i + 1}</span>
                  <span className="text-xs text-dark-300 font-mono w-24">{formatAddress(addr)}</span>
                  <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isOverLimit ? 'bg-red-500' : 'bg-primary-500'}`}
                      style={{ width: `${Math.min(legPct, 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono ${isOverLimit ? 'text-red-400' : 'text-dark-400'}`}>
                    {legPct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Qualifier Pools */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4">Qualifier Pools</h2>
        <QualifierPools />
      </motion.div>
    </div>
  );
}
