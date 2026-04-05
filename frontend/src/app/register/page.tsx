'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, isAddress } from 'viem';
import { useRouter } from 'next/navigation';
import { useReferral } from '@/hooks/useReferral';
import { useRegistration } from '@/hooks/useRegistration';
import { CONTRACTS, SYSTEM_WALLET, StakingManagerABI, USDTABI, AffiliateDistributorABI } from '@/lib/contracts';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export default function RegisterPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const { referrer: storedReferrer } = useReferral();
  const { isRegistered, isLoading: regLoading } = useRegistration();

  const [referrerInput, setReferrerInput] = useState('');
  const [stakeAmount, setStakeAmount] = useState('10');
  const [step, setStep] = useState<'idle' | 'approving' | 'staking' | 'done'>('idle');

  // ── Check if anyone has already registered (staked with system wallet as referrer) ──
  // directDividends(SYSTEM_WALLET) > 0 means at least one user staked with system wallet referrer
  const { data: systemDividends, isLoading: divLoading } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'directDividends',
    args: [SYSTEM_WALLET],
    query: { enabled: !!CONTRACTS.AFFILIATE_DISTRIBUTOR && !!SYSTEM_WALLET },
  });

  // Also check directCount in case setReferrer was called via CMS
  const { data: systemDirectCount, isLoading: countLoading } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'directCount',
    args: [SYSTEM_WALLET],
    query: { enabled: !!CONTRACTS.AFFILIATE_DISTRIBUTOR && !!SYSTEM_WALLET },
  });

  const isGenesisMode = useMemo(() => {
    if (divLoading || countLoading) return false;
    const dividends = systemDividends ? Number(systemDividends) : 0;
    const count = systemDirectCount ? Number(systemDirectCount) : 0;
    return dividends === 0 && count === 0; // No one has registered yet
  }, [systemDividends, systemDirectCount, divLoading, countLoading]);

  // ── Validate that the referrer address is actually registered on-chain ──
  const referrerAddr = referrerInput.trim() as `0x${string}`;
  const referrerIsValidFormat = referrerInput ? isAddress(referrerInput) : false;

  // Check if referrer has a referrer set (registered via CMS path)
  const { data: referrerOnChain, isLoading: refCheckLoading } = useReadContract({
    address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
    abi: AffiliateDistributorABI,
    functionName: 'referrerOf',
    args: [referrerAddr],
    query: {
      enabled: !!referrerIsValidFormat && !!CONTRACTS.AFFILIATE_DISTRIBUTOR && !isGenesisMode,
    },
  });

  // Check if referrer has any stakes (registered via staking path)
  const { data: referrerStakeCount, isLoading: refStakeLoading } = useReadContract({
    address: CONTRACTS.STAKING_MANAGER,
    abi: StakingManagerABI,
    functionName: 'getUserStakeCount',
    args: [referrerAddr],
    query: {
      enabled: !!referrerIsValidFormat && !!CONTRACTS.STAKING_MANAGER && !isGenesisMode,
    },
  });

  const referrerCheckLoading = refCheckLoading || refStakeLoading;

  // A referrer is valid if they have a referrer set OR have staked OR are the SYSTEM_WALLET
  const referrerIsRegistered = useMemo(() => {
    if (isGenesisMode) return true;
    if (!referrerIsValidFormat) return false;
    if (referrerAddr.toLowerCase() === SYSTEM_WALLET.toLowerCase()) return true;
    if (referrerCheckLoading) return false;
    const ref = referrerOnChain as `0x${string}` | undefined;
    const hasReferrer = !!ref && ref.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
    const hasStake = !!referrerStakeCount && Number(referrerStakeCount) > 0;
    return hasReferrer || hasStake;
  }, [isGenesisMode, referrerIsValidFormat, referrerAddr, referrerOnChain, referrerStakeCount, referrerCheckLoading]);

  // The actual referrer address to use on-chain
  const effectiveReferrer = isGenesisMode ? SYSTEM_WALLET : (referrerAddr as `0x${string}`);

  // ── Pre-fill from localStorage referral link ──
  useEffect(() => {
    if (storedReferrer && !referrerInput && !isGenesisMode) {
      setReferrerInput(storedReferrer);
    }
  }, [storedReferrer, isGenesisMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect if already registered
  useEffect(() => {
    if (isRegistered && !regLoading) {
      router.push('/dashboard');
    }
  }, [isRegistered, regLoading, router]);

  // ── USDT allowance & balance ──
  const { data: usdtAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: USDTABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.STAKING_MANAGER] : undefined,
    query: { enabled: !!address && !!CONTRACTS.USDT && !!CONTRACTS.STAKING_MANAGER },
  });

  const { data: usdtBalance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: USDTABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.USDT },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const parsedAmount = parseFloat(stakeAmount) || 0;
  const amountBig = parseUnits(parsedAmount.toString(), 18);
  const allowance = usdtAllowance ? Number(formatUnits(usdtAllowance as bigint, 18)) : 0;
  const balance = usdtBalance ? Number(formatUnits(usdtBalance as bigint, 18)) : 0;
  const needsApproval = parsedAmount > allowance;

  useEffect(() => {
    if (isSuccess && step === 'approving') {
      refetchAllowance();
      setStep('idle');
    }
    if (isSuccess && step === 'staking') {
      setStep('done');
      setTimeout(() => router.push('/dashboard'), 2000);
    }
  }, [isSuccess, step, refetchAllowance, router]);

  const handleApprove = () => {
    setStep('approving');
    writeContract({
      address: CONTRACTS.USDT,
      abi: USDTABI,
      functionName: 'approve',
      args: [CONTRACTS.STAKING_MANAGER, amountBig],
    });
  };

  const handleStake = () => {
    if (!isGenesisMode && !referrerIsRegistered) return;
    setStep('staking');
    writeContract({
      address: CONTRACTS.STAKING_MANAGER,
      abi: StakingManagerABI,
      functionName: 'stake',
      args: [amountBig, effectiveReferrer],
    });
  };

  const isWorking = isPending || isConfirming;
  const canStake = parsedAmount >= 10 && (isGenesisMode || (referrerIsValidFormat && referrerIsRegistered));

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-dark-50 mb-2">Connect Your Wallet</h2>
          <p className="text-dark-400 text-sm">Connect your wallet to register for KAIRO DeFi</p>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <div className="text-5xl mb-4">&#127881;</div>
          <h2 className="text-xl font-bold text-primary-400 mb-2">Registration Complete!</h2>
          <p className="text-dark-400 text-sm">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass rounded-2xl p-8 max-w-lg w-full">
        <h1 className="text-2xl font-bold text-dark-50 mb-2">Register for KAIRO DeFi</h1>
        <p className="text-dark-400 text-sm mb-6">
          {isGenesisMode
            ? 'You are the first to register! No referrer needed.'
            : 'Enter a registered referrer address and stake to join the platform.'}
        </p>

        <div className="space-y-4">
          {/* Referrer — hidden in genesis mode */}
          {!isGenesisMode && (
            <div>
              <label className="block text-sm text-dark-400 mb-1">Referrer Address *</label>
              <input
                type="text"
                value={referrerInput}
                onChange={(e) => setReferrerInput(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-3 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-sm font-mono focus:outline-none focus:border-primary-500 transition-colors"
              />
              {referrerInput && !referrerIsValidFormat && (
                <p className="text-xs text-red-400 mt-1">Invalid Ethereum address</p>
              )}
              {referrerIsValidFormat && !referrerCheckLoading && !referrerIsRegistered && (
                <p className="text-xs text-red-400 mt-1">This address is not a registered member</p>
              )}
              {referrerIsValidFormat && referrerCheckLoading && (
                <p className="text-xs text-dark-500 mt-1">Validating referrer...</p>
              )}
              {referrerIsValidFormat && referrerIsRegistered && (
                <p className="text-xs text-primary-400 mt-1">Valid registered referrer</p>
              )}
            </div>
          )}

          {isGenesisMode && (
            <div className="px-4 py-3 rounded-lg bg-primary-500/10 border border-primary-500/30">
              <p className="text-sm text-primary-300">
                Genesis Registration — you will be registered under the system wallet.
              </p>
            </div>
          )}

          {/* Stake Amount */}
          <div>
            <label className="block text-sm text-dark-400 mb-1">Initial Stake Amount (USDT)</label>
            <input
              type="number"
              min={10}
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="10"
              className="w-full px-4 py-3 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-lg font-mono focus:outline-none focus:border-primary-500 transition-colors"
            />
            <p className="text-xs text-dark-500 mt-1">
              Balance: {balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT &middot; Min: 10 USDT
            </p>
          </div>

          {/* Action Buttons */}
          {needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={isWorking || parsedAmount < 10}
              className="w-full py-3.5 rounded-xl bg-dark-700 hover:bg-dark-600 text-dark-200 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWorking && step === 'approving' ? 'Approving...' : `Approve ${parsedAmount} USDT`}
            </button>
          ) : (
            <button
              onClick={handleStake}
              disabled={isWorking || !canStake}
              className="w-full py-3.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold transition-all shadow-lg shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWorking && step === 'staking' ? 'Registering...' : `Register & Stake ${parsedAmount} USDT`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
