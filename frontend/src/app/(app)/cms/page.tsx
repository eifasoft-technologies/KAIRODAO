'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { GlassCard, Button, Input, ProgressBar } from '@/components/ui';
import { useCMS } from '@/hooks/useCMS';
import { useApproval } from '@/hooks/useApproval';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import { useRegistration } from '@/hooks/useRegistration';
import { contracts, CMS_PRICE_USDT, CMS_MAX_SUBSCRIPTIONS, USDT_DECIMALS } from '@/config/contracts';
import { parseUnits, zeroAddress, isAddress } from 'viem';
import {
  TicketIcon,
  GiftIcon,
  SparklesIcon,
  FireIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

export default function CMSPage() {
  const { isConnected } = useAccount();
  const [amount, setAmount] = useState('1');
  const { totalSubscriptions, userSubscriptionCount, remainingSubscriptions, claimableFormatted, maxClaimable, subscribe, claimRewards, isPending } = useCMS();
  const { usdtFormatted } = useTokenBalances();
  const { storedReferrer, hasOnChainReferrer } = useRegistration();
  const totalCost = Number(amount) * CMS_PRICE_USDT;
  const costBigInt = parseUnits(totalCost.toString(), USDT_DECIMALS);
  const approval = useApproval(contracts.usdt, contracts.cms);

  const soldPercent = CMS_MAX_SUBSCRIPTIONS > 0 ? (totalSubscriptions / CMS_MAX_SUBSCRIPTIONS) * 100 : 0;
  const isAlmostSoldOut = remainingSubscriptions < 1000;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center mb-2 shadow-xl shadow-primary-300/30">
          <TicketIcon className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-orbitron font-bold text-surface-900">Connect Wallet</h2>
        <p className="text-surface-500 text-sm">Join the Core Membership Subscription</p>
        <ConnectButton />
      </div>
    );
  }

  const handleSubscribe = () => {
    if (!approval.hasAllowance(costBigInt)) {
      approval.approve(costBigInt);
      return;
    }
    const ref = hasOnChainReferrer ? zeroAddress : (storedReferrer && isAddress(storedReferrer) ? storedReferrer : zeroAddress);
    subscribe(BigInt(Number(amount)), ref);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-orbitron font-bold gradient-text">Core Membership</h1>
        <p className="text-base text-surface-500 mt-1">Limited to {CMS_MAX_SUBSCRIPTIONS.toLocaleString()} memberships worldwide</p>
      </div>

      {/* Scarcity Hero */}
      <GlassCard variant="gradient" padding="p-0">
        <div className="relative overflow-hidden rounded-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 via-secondary-500/5 to-accent-500/5" />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center shadow-lg shadow-primary-400/30">
                  <TicketIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-surface-900">Subscription Progress</h3>
                  <p className="text-sm text-surface-500">{soldPercent.toFixed(1)}% claimed</p>
                </div>
              </div>
              <div className="text-right">
                {isAlmostSoldOut && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-danger-50 border border-danger-200 text-danger-600 text-xs font-semibold mb-1">
                    <FireIcon className="w-3 h-3" /> Almost Sold Out!
                  </span>
                )}
                <p className="text-2xl font-mono font-bold text-primary-600">{remainingSubscriptions.toLocaleString()}</p>
                <p className="text-xs text-surface-400">remaining</p>
              </div>
            </div>

            <ProgressBar
              value={totalSubscriptions}
              max={CMS_MAX_SUBSCRIPTIONS}
              variant="cyan"
              size="lg"
            />

            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center p-3 rounded-xl bg-gradient-to-br from-primary-50/60 to-white/60 border border-primary-100/50">
                <p className="text-lg font-mono font-bold text-surface-900">{totalSubscriptions.toLocaleString()}</p>
                <p className="text-[10px] uppercase tracking-wider text-surface-400">Sold</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-gradient-to-br from-secondary-50/60 to-white/60 border border-secondary-100/50">
                <p className="text-lg font-mono font-bold text-surface-900">{CMS_MAX_SUBSCRIPTIONS.toLocaleString()}</p>
                <p className="text-[10px] uppercase tracking-wider text-surface-400">Max Supply</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-gradient-to-br from-accent-100/60 to-accent-50/40 border border-accent-200/50">
                <p className="text-lg font-mono font-bold text-accent-600">${CMS_PRICE_USDT}</p>
                <p className="text-[10px] uppercase tracking-wider text-surface-400">Price</p>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Purchase Form */}
        <GlassCard>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-300 flex items-center justify-center shadow-md shadow-primary-300/30">
              <ShieldCheckIcon className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-surface-900">Purchase Subscriptions</h3>
          </div>

          <div className="space-y-4">
            <Input
              label="Number of Subscriptions"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              helperText={`Balance: ${Number(usdtFormatted).toFixed(2)} USDT`}
            />

            <div className="p-4 rounded-xl bg-gradient-to-r from-surface-50 to-primary-50/30 border border-primary-100/30 space-y-2 text-xs">
              <div className="flex justify-between text-surface-500">
                <span>Price per Subscription</span>
                <span className="font-mono text-surface-700">${CMS_PRICE_USDT} USDT</span>
              </div>
              <div className="flex justify-between text-surface-500">
                <span>Quantity</span>
                <span className="font-mono text-surface-700">{Number(amount) || 0}x</span>
              </div>
              <div className="border-t border-surface-200 pt-2 flex justify-between font-semibold text-surface-900">
                <span>Total Cost</span>
                <span className="font-mono">${totalCost} USDT</span>
              </div>
            </div>

            {/* Rewards Preview */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-accent-100 to-accent-50 border-2 border-accent-200/50">
              <div className="flex items-center gap-2 mb-2">
                <GiftIcon className="w-4 h-4 text-accent-600" />
                <span className="text-xs font-semibold text-accent-700">Rewards Preview</span>
              </div>
              <div className="space-y-1 text-xs text-surface-600">
                <div className="flex justify-between">
                  <span>Loyalty Reward</span>
                  <span className="font-mono font-semibold text-accent-700">{(Number(amount) || 0) * 5} KAIRO</span>
                </div>
                <div className="flex justify-between">
                  <span>Leadership Rewards</span>
                  <span className="text-surface-400">Based on referral activity</span>
                </div>
              </div>
            </div>

            <Button
              onClick={handleSubscribe}
              loading={isPending || approval.isPending}
              disabled={Number(amount) < 1}
              className="w-full"
            >
              {!approval.hasAllowance(costBigInt) ? 'Approve USDT' : `Subscribe (${amount}x for $${totalCost})`}
            </Button>
          </div>
        </GlassCard>

        {/* Rewards Panel */}
        <GlassCard>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary-400 to-secondary-300 flex items-center justify-center shadow-md shadow-secondary-300/30">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-surface-900">Your Rewards</h3>
          </div>

          <div className="space-y-4">
            <div className="text-center p-8 rounded-2xl bg-gradient-to-br from-primary-100/60 via-white to-secondary-100/60 border-2 border-primary-200/50">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-primary-400/30">
                <GiftIcon className="w-7 h-7 text-white" />
              </div>
              <p className="text-sm text-surface-500 mb-2">Claimable Rewards</p>
              <p className="text-4xl font-mono font-bold gradient-text">{Number(claimableFormatted).toFixed(2)}</p>
              <p className="text-sm text-surface-400 mt-1">KAIRO tokens</p>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-r from-primary-100/50 to-secondary-100/50 border-2 border-primary-200/40 space-y-2 text-xs text-surface-600">
              <div className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">&#8226;</span>
                <span>90% sent to your wallet, 10% auto-staked</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">&#8226;</span>
                <span>Claim amount capped by total active stake value</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">&#8226;</span>
                <span>Requires active stake to claim rewards</span>
              </div>
            </div>

            <Button
              onClick={claimRewards}
              loading={isPending}
              variant="secondary"
              className="w-full"
            >
              Claim CMS Rewards
            </Button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
