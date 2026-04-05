'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { isAddress } from 'viem';
import { useRouter } from 'next/navigation';
import { useReferral } from '@/hooks/useReferral';
import { useRegistration } from '@/hooks/useRegistration';
import { CONTRACTS, StakingManagerABI, USDTABI } from '@/lib/contracts';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';

export default function RegisterPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const { referrer: storedReferrer } = useReferral();
  const { isRegistered, isLoading: regLoading } = useRegistration();

  const [referrerInput, setReferrerInput] = useState('');
  const [stakeAmount, setStakeAmount] = useState('10');
  const [step, setStep] = useState<'idle' | 'approving' | 'staking' | 'done'>('idle');

  useEffect(() => {
    if (storedReferrer && !referrerInput) {
      setReferrerInput(storedReferrer);
    }
  }, [storedReferrer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect if already registered
  useEffect(() => {
    if (isRegistered && !regLoading) {
      router.push('/dashboard');
    }
  }, [isRegistered, regLoading, router]);

  // USDT allowance
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
  const referrerValid = referrerInput ? isAddress(referrerInput) : false;

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
    if (!referrerValid) return;
    setStep('staking');
    writeContract({
      address: CONTRACTS.STAKING_MANAGER,
      abi: StakingManagerABI,
      functionName: 'stake',
      args: [amountBig, referrerInput as `0x${string}`],
    });
  };

  const isWorking = isPending || isConfirming;

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
          <div className="text-5xl mb-4">🎉</div>
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
          Create your first stake with a referrer to register on the platform.
        </p>

        <div className="space-y-4">
          {/* Referrer */}
          <div>
            <label className="block text-sm text-dark-400 mb-1">Referrer Address *</label>
            <input
              type="text"
              value={referrerInput}
              onChange={(e) => setReferrerInput(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-3 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-sm font-mono focus:outline-none focus:border-primary-500 transition-colors"
            />
            {referrerInput && !referrerValid && (
              <p className="text-xs text-red-400 mt-1">Invalid Ethereum address</p>
            )}
          </div>

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
              disabled={isWorking || parsedAmount < 10 || !referrerValid}
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
