'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits, isAddress, type Address } from 'viem';
import { motion } from 'framer-motion';
import {
  ShieldExclamationIcon,
  CurrencyDollarIcon,
  FireIcon,
  UsersIcon,
  ChartBarIcon,
  ClockIcon,
  WalletIcon,
  KeyIcon,
  ServerStackIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import {
  CONTRACTS,
  AccessControlABI,
  PausableABI,
  KAIROTokenABI,
  USDTABI,
  CoreMembershipSubscriptionABI,
  ROLE_HASHES,
  StakingManagerABI,
} from '@/lib/contracts';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PauseControlItem } from '@/components/admin/PauseControls';
import { useToast } from '@/providers/ToastProvider';
import { cn } from '@/lib/utils';

const ADMIN_WHITELIST: string[] = [
  // Add admin addresses here (lowercase)
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

interface SystemStats {
  kairoPrice: string;
  totalTVL: string;
  totalBurned: string;
  activeStakers: number;
}

interface BackendHealth {
  lastIndexedBlock: number;
  dbStatus: string;
  redisStatus: string;
  queueSize: number;
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { addToast } = useToast();

  // ===== Access Control =====
  const { data: hasAdminRole } = useReadContract({
    address: CONTRACTS.STAKING_MANAGER,
    abi: AccessControlABI,
    functionName: 'hasRole',
    args: address ? [ROLE_HASHES.DEFAULT_ADMIN_ROLE, address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.STAKING_MANAGER },
  });

  const isWhitelisted = useMemo(() => {
    if (!address) return false;
    if (ADMIN_WHITELIST.length > 0 && ADMIN_WHITELIST.includes(address.toLowerCase())) return true;
    return hasAdminRole === true;
  }, [address, hasAdminRole]);

  // ===== System Stats from Backend =====
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isCalcRank, setIsCalcRank] = useState(false);

  useEffect(() => {
    if (!isWhitelisted) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    if (!apiBase) return;

    setIsLoadingStats(true);
    fetch(`${apiBase}/api/v1/global/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setIsLoadingStats(false));

    fetch(`${apiBase}/api/v1/admin/system-stats`)
      .then((r) => r.json())
      .then((d) => setBackendHealth(d))
      .catch(() => {});
  }, [isWhitelisted]);

  // ===== CMS reads =====
  const { data: cmsDeadline } = useReadContract({
    address: CONTRACTS.CMS,
    abi: CoreMembershipSubscriptionABI,
    functionName: 'deadline',
    query: { enabled: !!CONTRACTS.CMS && isWhitelisted },
  });
  const { data: totalSubscriptions } = useReadContract({
    address: CONTRACTS.CMS,
    abi: CoreMembershipSubscriptionABI,
    functionName: 'totalSubscriptions',
    query: { enabled: !!CONTRACTS.CMS && isWhitelisted },
  });
  const { data: maxSubscriptions } = useReadContract({
    address: CONTRACTS.CMS,
    abi: CoreMembershipSubscriptionABI,
    functionName: 'MAX_SUBS',
    query: { enabled: !!CONTRACTS.CMS && isWhitelisted },
  });

  // ===== System wallet =====
  const { data: systemWallet } = useReadContract({
    address: CONTRACTS.STAKING_MANAGER,
    abi: StakingManagerABI,
    functionName: 'systemWallet',
    query: { enabled: !!CONTRACTS.STAKING_MANAGER && isWhitelisted },
  });
  const { data: systemUSDTBalance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: USDTABI,
    functionName: 'balanceOf',
    args: systemWallet ? [systemWallet as Address] : undefined,
    query: { enabled: !!systemWallet && !!CONTRACTS.USDT && isWhitelisted },
  });
  const { data: systemKAIROBalance } = useReadContract({
    address: CONTRACTS.KAIRO_TOKEN,
    abi: KAIROTokenABI,
    functionName: 'balanceOf',
    args: systemWallet ? [systemWallet as Address] : undefined,
    query: { enabled: !!systemWallet && !!CONTRACTS.KAIRO_TOKEN && isWhitelisted },
  });

  // ===== Write contracts =====
  const { writeContract, data: writeTxHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isWriteConfirming } = useWaitForTransactionReceipt({
    hash: writeTxHash,
    query: { enabled: !!writeTxHash },
  });

  // ===== Local state =====
  const [newDeadline, setNewDeadline] = useState('');
  const [newSystemWallet, setNewSystemWallet] = useState('');
  const [roleGrantAddress, setRoleGrantAddress] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('MINTER_ROLE');
  const [roleAction, setRoleAction] = useState<'grant' | 'revoke'>('grant');

  // ===== Derived =====
  const deadlineDate = cmsDeadline ? new Date(Number(cmsDeadline) * 1000) : null;
  const totalSubs = totalSubscriptions ? Number(totalSubscriptions) : 0;
  const maxSubs = maxSubscriptions ? Number(maxSubscriptions) : 500;
  const subsPercent = maxSubs > 0 ? (totalSubs / maxSubs) * 100 : 0;
  const sysUSDT = systemUSDTBalance ? Number(formatUnits(systemUSDTBalance as bigint, 18)) : 0;
  const sysKAIRO = systemKAIROBalance ? Number(formatUnits(systemKAIROBalance as bigint, 18)) : 0;
  const isWriteLoading = isWritePending || isWriteConfirming;

  // ===== Handlers =====
  const handleExtendDeadline = () => {
    if (!newDeadline) return;
    const ts = Math.floor(new Date(newDeadline).getTime() / 1000);
    if (cmsDeadline && ts <= Number(cmsDeadline)) {
      addToast('error', 'Invalid Deadline', 'New deadline must be after the current one');
      return;
    }
    writeContract({
      address: CONTRACTS.CMS,
      abi: CoreMembershipSubscriptionABI,
      functionName: 'extendDeadline',
      args: [BigInt(ts)],
    });
  };

  const handleUpdateSystemWallet = () => {
    if (!isAddress(newSystemWallet)) {
      addToast('error', 'Invalid Address', 'Please enter a valid Ethereum address');
      return;
    }
    writeContract({
      address: CONTRACTS.STAKING_MANAGER,
      abi: StakingManagerABI,
      functionName: 'setSystemWallet',
      args: [newSystemWallet as Address],
    });
  };

  const handleRoleAction = () => {
    if (!isAddress(roleGrantAddress)) {
      addToast('error', 'Invalid Address');
      return;
    }
    const roleHash = ROLE_HASHES[selectedRole as keyof typeof ROLE_HASHES];
    if (!roleHash) return;

    // Determine target contract based on role
    let targetContract = CONTRACTS.KAIRO_TOKEN;
    if (selectedRole === 'STAKING_ROLE') targetContract = CONTRACTS.AFFILIATE_DISTRIBUTOR;
    if (selectedRole === 'COMPOUNDER_ROLE') targetContract = CONTRACTS.STAKING_MANAGER;

    writeContract({
      address: targetContract,
      abi: AccessControlABI,
      functionName: roleAction === 'grant' ? 'grantRole' : 'revokeRole',
      args: [roleHash, roleGrantAddress as Address],
    });
  };

  const handleTriggerRankCalc = async () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    if (!apiBase) return;
    setIsCalcRank(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/calculate-rank`, { method: 'POST' });
      if (res.ok) addToast('success', 'Rank Calculation', 'Rank calculation triggered successfully');
      else addToast('error', 'Rank Calculation', 'Failed to trigger rank calculation');
    } catch {
      addToast('error', 'Network Error', 'Could not reach backend');
    } finally {
      setIsCalcRank(false);
    }
  };

  // ===== Access Denied =====
  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <LockClosedIcon className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-dark-200 mb-2">Connect Your Wallet</h2>
          <p className="text-dark-500 text-sm">Connect an authorized admin wallet to access the panel</p>
        </div>
      </div>
    );
  }

  if (!isWhitelisted) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-dark-50">Admin Panel</h1>
          <p className="text-dark-400 mt-1">System administration and emergency controls</p>
        </div>
        <div className="glass rounded-xl p-8 text-center">
          <ShieldExclamationIcon className="w-16 h-16 text-red-500/60 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-dark-100 mb-2">Access Denied</h2>
          <p className="text-dark-400 text-sm mb-4">
            Your wallet <span className="font-mono text-dark-300">{address?.slice(0, 6)}...{address?.slice(-4)}</span> is not authorized.
          </p>
          <p className="text-dark-500 text-xs">Only wallets with DEFAULT_ADMIN_ROLE can access this panel.</p>
        </div>
      </div>
    );
  }

  // ===== Pausable contract list =====
  const pausableContracts = [
    { name: 'StakingManager', address: CONTRACTS.STAKING_MANAGER },
    { name: 'AffiliateDistributor', address: CONTRACTS.AFFILIATE_DISTRIBUTOR },
    { name: 'CoreMembershipSubscription', address: CONTRACTS.CMS },
    { name: 'AtomicP2p', address: CONTRACTS.ATOMIC_P2P },
  ].filter((c) => !!c.address);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50 flex items-center gap-2">
            <ShieldExclamationIcon className="w-7 h-7 text-orange-400" />
            Admin Panel
          </h1>
          <p className="text-dark-400 mt-1">System administration and emergency controls</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-dark-400">Admin Active</span>
        </div>
      </div>

      {/* System Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <motion.div {...fadeUp} className="glass rounded-xl p-5 border-t-2 border-orange-500/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider">KAIRO Price</p>
              <p className="text-2xl font-semibold text-dark-50 font-mono mt-1">
                ${stats?.kairoPrice || '—'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
              <CurrencyDollarIcon className="w-5 h-5" />
            </div>
          </div>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.1 }} className="glass rounded-xl p-5 border-t-2 border-orange-500/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider">Total TVL</p>
              <p className="text-2xl font-semibold text-dark-50 font-mono mt-1">
                ${stats?.totalTVL || '—'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
              <ChartBarIcon className="w-5 h-5" />
            </div>
          </div>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.2 }} className="glass rounded-xl p-5 border-t-2 border-orange-500/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider">Total Burned</p>
              <p className="text-2xl font-semibold text-dark-50 font-mono mt-1">
                {stats?.totalBurned || '—'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
              <FireIcon className="w-5 h-5" />
            </div>
          </div>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.3 }} className="glass rounded-xl p-5 border-t-2 border-orange-500/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider">Active Stakers</p>
              <p className="text-2xl font-semibold text-dark-50 font-mono mt-1">
                {stats?.activeStakers ?? '—'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
              <UsersIcon className="w-5 h-5" />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Contract Controls */}
        <motion.div {...fadeUp} transition={{ delay: 0.4 }} className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-dark-50 flex items-center gap-2 mb-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
            Emergency Pause Controls
          </h2>
          <div className="space-y-0">
            {pausableContracts.map((c) => (
              <PauseControlItem key={c.name} name={c.name} address={c.address} />
            ))}
          </div>
        </motion.div>

        {/* CMS Management */}
        <motion.div {...fadeUp} transition={{ delay: 0.5 }} className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-dark-50 flex items-center gap-2 mb-4">
            <ClockIcon className="w-5 h-5 text-orange-400" />
            CMS Management
          </h2>

          <div className="space-y-4">
            {/* Current Deadline */}
            <div className="p-3 rounded-lg bg-dark-800/60">
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Current Deadline</p>
              <p className="text-lg font-semibold text-dark-50 font-mono">
                {deadlineDate ? deadlineDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
            </div>

            {/* Subscriptions Progress */}
            <div className="p-3 rounded-lg bg-dark-800/60">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-dark-500 uppercase tracking-wider">Subscriptions</p>
                <p className="text-xs text-dark-400 font-mono">{totalSubs} / {maxSubs}</p>
              </div>
              <div className="w-full h-2 rounded-full bg-dark-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
                  style={{ width: `${Math.min(subsPercent, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-dark-500 mt-1">{subsPercent.toFixed(1)}% filled</p>
            </div>

            {/* Extend Deadline */}
            <div>
              <label className="block text-xs text-dark-400 mb-1">Extend Deadline</label>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                />
                <Button size="md" variant="primary" loading={isWriteLoading} onClick={handleExtendDeadline} disabled={!newDeadline}>
                  Extend
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* System Fee Treasury */}
        <motion.div {...fadeUp} transition={{ delay: 0.6 }} className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-dark-50 flex items-center gap-2 mb-4">
            <WalletIcon className="w-5 h-5 text-orange-400" />
            System Fee Treasury
          </h2>

          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-dark-800/60">
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">System Wallet</p>
              <p className="text-sm text-dark-100 font-mono break-all">{(systemWallet as string) || '—'}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-dark-800/60">
                <p className="text-xs text-dark-500 mb-1">USDT Balance</p>
                <p className="text-lg font-semibold text-dark-50 font-mono">${sysUSDT.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="p-3 rounded-lg bg-dark-800/60">
                <p className="text-xs text-dark-500 mb-1">KAIRO Balance</p>
                <p className="text-lg font-semibold text-dark-50 font-mono">{sysKAIRO.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs text-dark-400 mb-1">Update System Wallet</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSystemWallet}
                  onChange={(e) => setNewSystemWallet(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-sm font-mono focus:outline-none focus:border-orange-500 transition-colors"
                />
                <Button size="md" variant="danger" loading={isWriteLoading} onClick={handleUpdateSystemWallet} disabled={!newSystemWallet}>
                  Update
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Role Management */}
        <motion.div {...fadeUp} transition={{ delay: 0.7 }} className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-dark-50 flex items-center gap-2 mb-4">
            <KeyIcon className="w-5 h-5 text-orange-400" />
            Role Management
          </h2>

          <div className="space-y-4">
            {/* Role Info */}
            <div className="space-y-2">
              {[
                { label: 'MINTER_ROLE', desc: 'KAIROToken', color: 'text-emerald-400' },
                { label: 'BURNER_ROLE', desc: 'KAIROToken', color: 'text-red-400' },
                { label: 'STAKING_ROLE', desc: 'AffiliateDistributor', color: 'text-blue-400' },
                { label: 'COMPOUNDER_ROLE', desc: 'StakingManager', color: 'text-purple-400' },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-1.5 text-xs">
                  <span className={cn('font-mono font-medium', r.color)}>{r.label}</span>
                  <span className="text-dark-500">{r.desc}</span>
                </div>
              ))}
            </div>

            <hr className="border-dark-700/50" />

            {/* Grant/Revoke Form */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-sm focus:outline-none focus:border-orange-500"
                >
                  <option value="MINTER_ROLE">MINTER_ROLE</option>
                  <option value="BURNER_ROLE">BURNER_ROLE</option>
                  <option value="STAKING_ROLE">STAKING_ROLE</option>
                  <option value="COMPOUNDER_ROLE">COMPOUNDER_ROLE</option>
                </select>
                <select
                  value={roleAction}
                  onChange={(e) => setRoleAction(e.target.value as 'grant' | 'revoke')}
                  className="w-28 px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-sm focus:outline-none focus:border-orange-500"
                >
                  <option value="grant">Grant</option>
                  <option value="revoke">Revoke</option>
                </select>
              </div>
              <input
                type="text"
                value={roleGrantAddress}
                onChange={(e) => setRoleGrantAddress(e.target.value)}
                placeholder="Address (0x...)"
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 text-sm font-mono focus:outline-none focus:border-orange-500 transition-colors"
              />
              <Button
                size="md"
                variant={roleAction === 'grant' ? 'primary' : 'danger'}
                className="w-full"
                loading={isWriteLoading}
                onClick={handleRoleAction}
                disabled={!roleGrantAddress}
              >
                {roleAction === 'grant' ? 'Grant Role' : 'Revoke Role'}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Backend Health */}
      <motion.div {...fadeUp} transition={{ delay: 0.8 }} className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-dark-50 flex items-center gap-2">
            <ServerStackIcon className="w-5 h-5 text-orange-400" />
            Backend Health
          </h2>
          <Button size="sm" variant="secondary" loading={isCalcRank} onClick={handleTriggerRankCalc}>
            Trigger Rank Calculation
          </Button>
        </div>

        {backendHealth ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-dark-800/60">
              <p className="text-xs text-dark-500 mb-1">Last Indexed Block</p>
              <p className="text-sm font-semibold text-dark-100 font-mono">{backendHealth.lastIndexedBlock.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-dark-800/60">
              <p className="text-xs text-dark-500 mb-1">Database</p>
              <div className="flex items-center gap-1.5">
                <div className={cn('w-2 h-2 rounded-full', backendHealth.dbStatus === 'ok' ? 'bg-emerald-500' : 'bg-red-500')} />
                <p className="text-sm font-semibold text-dark-100">{backendHealth.dbStatus}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-dark-800/60">
              <p className="text-xs text-dark-500 mb-1">Redis</p>
              <div className="flex items-center gap-1.5">
                <div className={cn('w-2 h-2 rounded-full', backendHealth.redisStatus === 'ok' ? 'bg-emerald-500' : 'bg-red-500')} />
                <p className="text-sm font-semibold text-dark-100">{backendHealth.redisStatus}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-dark-800/60">
              <p className="text-xs text-dark-500 mb-1">Queue Size</p>
              <p className="text-sm font-semibold text-dark-100 font-mono">{backendHealth.queueSize}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-lg bg-dark-800/60 animate-pulse">
                <div className="h-3 w-20 bg-dark-700 rounded mb-2" />
                <div className="h-5 w-16 bg-dark-700 rounded" />
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
