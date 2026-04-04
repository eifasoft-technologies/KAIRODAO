'use client';

import { useState, useMemo } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { motion } from 'framer-motion';
import {
  ArrowsRightLeftIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useP2P } from '@/hooks/useP2P';
import { useKairoPrice } from '@/hooks/useKairoPrice';
import { CONTRACTS, USDTABI, KAIROTokenABI } from '@/lib/contracts';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { cn, formatAddress } from '@/lib/utils';

type OrderTab = 'buy' | 'sell';
type OrderType = 'buy' | 'sell';

interface BuyOrderData {
  creator: string;
  usdtAmount: bigint;
  usdtRemaining: bigint;
  active: boolean;
  createdAt: bigint;
}

interface SellOrderData {
  creator: string;
  kairoAmount: bigint;
  kairoRemaining: bigint;
  active: boolean;
  createdAt: bigint;
}

export default function TradingPage() {
  const { address, isConnected } = useAccount();
  const {
    orderBookStats,
    currentPrice,
    activeBuyOrders,
    activeSellOrders,
    createBuyOrder,
    createSellOrder,
    cancelBuyOrder,
    cancelSellOrder,
    isWritePending,
    isConfirming,
    refetchBuyOrders,
    refetchSellOrders,
  } = useP2P();
  const { price: kairoPrice } = useKairoPrice();

  const [orderTab, setOrderTab] = useState<OrderTab>('buy');
  const [orderType, setOrderType] = useState<OrderType>('buy');
  const [amount, setAmount] = useState('');
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ id: number; isBuy: boolean } | null>(null);

  // USDT allowance for P2P
  const { data: usdtAllowance } = useReadContract({
    address: CONTRACTS.USDT,
    abi: USDTABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.ATOMIC_P2P] : undefined,
    query: { enabled: !!address && !!CONTRACTS.USDT && !!CONTRACTS.ATOMIC_P2P },
  });

  // KAIRO allowance for P2P
  const { data: kairoAllowance } = useReadContract({
    address: CONTRACTS.KAIRO_TOKEN,
    abi: KAIROTokenABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.ATOMIC_P2P] : undefined,
    query: { enabled: !!address && !!CONTRACTS.KAIRO_TOKEN && !!CONTRACTS.ATOMIC_P2P },
  });

  const { writeContract: writeApprove, data: approveTx, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveTx,
    query: { enabled: !!approveTx },
  });

  const parsedAmount = parseFloat(amount) || 0;
  const priceUSD = currentPrice ? Number(formatUnits(currentPrice as bigint, 18)) : kairoPrice;

  const usdtAllow = usdtAllowance ? Number(formatUnits(usdtAllowance as bigint, 18)) : 0;
  const kairoAllow = kairoAllowance ? Number(formatUnits(kairoAllowance as bigint, 18)) : 0;

  const needsApproval = orderType === 'buy'
    ? parsedAmount > usdtAllow
    : parsedAmount > kairoAllow;

  // Filter user's orders
  const myBuyOrders = useMemo(() => {
    if (!activeBuyOrders || !address) return [] as BuyOrderData[];
    return (activeBuyOrders as unknown as BuyOrderData[]).filter(
      (o) => o.creator.toLowerCase() === address.toLowerCase() && o.active,
    );
  }, [activeBuyOrders, address]);

  const mySellOrders = useMemo(() => {
    if (!activeSellOrders || !address) return [] as SellOrderData[];
    return (activeSellOrders as unknown as SellOrderData[]).filter(
      (o) => o.creator.toLowerCase() === address.toLowerCase() && o.active,
    );
  }, [activeSellOrders, address]);

  const stats = useMemo(() => {
    if (!orderBookStats) return { totalBuy: 0, totalSell: 0, totalTrades: 0, activeBuy: 0, activeSell: 0 };
    const [tb, ts, tt, ab, as_] = orderBookStats as unknown as bigint[];
    return {
      totalBuy: Number(tb),
      totalSell: Number(ts),
      totalTrades: Number(tt),
      activeBuy: Number(ab),
      activeSell: Number(as_),
    };
  }, [orderBookStats]);

  const handleApprove = () => {
    const amtBig = parseUnits(amount, 18);
    if (orderType === 'buy') {
      writeApprove({
        address: CONTRACTS.USDT,
        abi: USDTABI,
        functionName: 'approve',
        args: [CONTRACTS.ATOMIC_P2P, amtBig],
      });
    } else {
      writeApprove({
        address: CONTRACTS.KAIRO_TOKEN,
        abi: KAIROTokenABI,
        functionName: 'approve',
        args: [CONTRACTS.ATOMIC_P2P, amtBig],
      });
    }
  };

  const handleCreateOrder = () => {
    const amtBig = parseUnits(amount, 18);
    if (orderType === 'buy') {
      createBuyOrder(amtBig);
    } else {
      createSellOrder(amtBig);
    }
    setAmount('');
  };

  const handleCancelClick = (id: number, isBuy: boolean) => {
    setCancelTarget({ id, isBuy });
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = () => {
    if (cancelTarget) {
      if (cancelTarget.isBuy) {
        cancelBuyOrder(BigInt(cancelTarget.id));
      } else {
        cancelSellOrder(BigInt(cancelTarget.id));
      }
      setCancelModalOpen(false);
      setCancelTarget(null);
    }
  };

  const isLoading = isWritePending || isConfirming;

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <ArrowsRightLeftIcon className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-dark-200 mb-2">Connect Your Wallet</h2>
        <p className="text-dark-500 text-sm">Connect your wallet to trade KAIRO</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dark-50">P2P Trading</h1>
        <p className="text-dark-400 mt-1">Manage your P2P orders and execute trades</p>
      </div>

      {/* Trading Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8"
      >
        <StatCard
          label="KAIRO Price"
          value={`$${priceUSD.toFixed(4)}`}
          icon={<CurrencyDollarIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Total Trades"
          value={stats.totalTrades.toString()}
          icon={<ArrowsRightLeftIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Active Buy Orders"
          value={stats.activeBuy.toString()}
          icon={<ArrowTrendingUpIcon className="w-5 h-5" />}
          className="[&_[class*=bg-primary]]:bg-primary-500/10 [&_[class*=text-primary]]:text-primary-400"
        />
        <StatCard
          label="Active Sell Orders"
          value={stats.activeSell.toString()}
          icon={<ChartBarIcon className="w-5 h-5" />}
        />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Order Creation Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-xl p-6"
        >
          <h2 className="text-lg font-semibold text-dark-50 mb-4">Create Order</h2>

          {/* Buy/Sell Toggle */}
          <div className="flex rounded-lg bg-dark-900/60 p-1 mb-4">
            <button
              onClick={() => setOrderType('buy')}
              className={cn(
                'flex-1 py-2 rounded-md text-sm font-medium transition-all',
                orderType === 'buy' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-dark-200',
              )}
            >
              Buy KAIRO
            </button>
            <button
              onClick={() => setOrderType('sell')}
              className={cn(
                'flex-1 py-2 rounded-md text-sm font-medium transition-all',
                orderType === 'sell' ? 'bg-red-500 text-white' : 'text-dark-400 hover:text-dark-200',
              )}
            >
              Sell KAIRO
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-dark-400 mb-1">
                {orderType === 'buy' ? 'USDT Amount' : 'KAIRO Amount'}
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Enter ${orderType === 'buy' ? 'USDT' : 'KAIRO'} amount`}
                className="w-full px-4 py-3 rounded-lg bg-dark-900 border border-dark-700 text-dark-100 font-mono focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {parsedAmount > 0 && (
              <div className="p-3 rounded-lg bg-dark-900/40 border border-dark-700/30">
                <div className="flex justify-between text-xs text-dark-400">
                  <span>Estimated {orderType === 'buy' ? 'KAIRO' : 'USDT'}</span>
                  <span className="font-mono text-dark-200">
                    {orderType === 'buy'
                      ? priceUSD > 0 ? (parsedAmount / priceUSD).toFixed(4) : '0'
                      : (parsedAmount * priceUSD).toFixed(2)
                    }
                    {' '}{orderType === 'buy' ? 'KAIRO' : 'USDT'}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-dark-500 mt-1">
                  <span>Fee (3%)</span>
                  <span className="font-mono">
                    {(parsedAmount * 0.03).toFixed(orderType === 'buy' ? 2 : 4)}
                    {' '}{orderType === 'buy' ? 'USDT' : 'KAIRO'}
                  </span>
                </div>
              </div>
            )}

            {needsApproval ? (
              <Button
                size="md"
                variant="secondary"
                className="w-full"
                loading={isApproving || isApproveConfirming}
                disabled={parsedAmount <= 0}
                onClick={handleApprove}
              >
                Approve {orderType === 'buy' ? 'USDT' : 'KAIRO'}
              </Button>
            ) : (
              <Button
                size="md"
                variant={orderType === 'buy' ? 'primary' : 'danger'}
                className="w-full"
                loading={isLoading}
                disabled={parsedAmount <= 0}
                onClick={handleCreateOrder}
              >
                Create {orderType === 'buy' ? 'Buy' : 'Sell'} Order
              </Button>
            )}
          </div>
        </motion.div>

        {/* My Active Orders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 glass rounded-xl p-6"
        >
          <h2 className="text-lg font-semibold text-dark-50 mb-4">My Active Orders</h2>

          {/* Tab */}
          <div className="flex gap-1 mb-4 border-b border-dark-700/50">
            <button
              onClick={() => setOrderTab('buy')}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-all',
                orderTab === 'buy'
                  ? 'border-primary-400 text-primary-400'
                  : 'border-transparent text-dark-500 hover:text-dark-300',
              )}
            >
              Buy Orders ({myBuyOrders.length})
            </button>
            <button
              onClick={() => setOrderTab('sell')}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-all',
                orderTab === 'sell'
                  ? 'border-red-400 text-red-400'
                  : 'border-transparent text-dark-500 hover:text-dark-300',
              )}
            >
              Sell Orders ({mySellOrders.length})
            </button>
          </div>

          {orderTab === 'buy' ? (
            myBuyOrders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-dark-500">No active buy orders</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-dark-700/50">
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">#</th>
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">Amount</th>
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">Remaining</th>
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">Created</th>
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {myBuyOrders.map((order, i) => {
                      const amt = Number(formatUnits(order.usdtAmount, 18));
                      const rem = Number(formatUnits(order.usdtRemaining, 18));
                      const created = new Date(Number(order.createdAt) * 1000);
                      return (
                        <tr key={i} className="border-b border-dark-700/30">
                          <td className="py-2.5 text-sm text-dark-300 font-mono">{i + 1}</td>
                          <td className="py-2.5 text-sm text-dark-100 font-mono">${amt.toFixed(2)}</td>
                          <td className="py-2.5 text-sm text-dark-300 font-mono">${rem.toFixed(2)}</td>
                          <td className="py-2.5 text-xs text-dark-400">{created.toLocaleDateString()}</td>
                          <td className="py-2.5">
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={isLoading}
                              onClick={() => handleCancelClick(i, true)}
                            >
                              Cancel
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            mySellOrders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-dark-500">No active sell orders</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-dark-700/50">
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">#</th>
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">Amount</th>
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">Remaining</th>
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider">Created</th>
                      <th className="pb-2 text-xs text-dark-500 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mySellOrders.map((order, i) => {
                      const amt = Number(formatUnits(order.kairoAmount, 18));
                      const rem = Number(formatUnits(order.kairoRemaining, 18));
                      const created = new Date(Number(order.createdAt) * 1000);
                      return (
                        <tr key={i} className="border-b border-dark-700/30">
                          <td className="py-2.5 text-sm text-dark-300 font-mono">{i + 1}</td>
                          <td className="py-2.5 text-sm text-dark-100 font-mono">{amt.toFixed(4)} KAIRO</td>
                          <td className="py-2.5 text-sm text-dark-300 font-mono">{rem.toFixed(4)} KAIRO</td>
                          <td className="py-2.5 text-xs text-dark-400">{created.toLocaleDateString()}</td>
                          <td className="py-2.5">
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={isLoading}
                              onClick={() => handleCancelClick(i, false)}
                            >
                              Cancel
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </motion.div>
      </div>

      {/* Trade History placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-xl p-6"
      >
        <h2 className="text-lg font-semibold text-dark-50 mb-4">Trade History</h2>
        <div className="text-center py-8">
          <ArrowsRightLeftIcon className="w-10 h-10 text-dark-600 mx-auto mb-2" />
          <p className="text-dark-500">Trade history will appear here</p>
          <p className="text-xs text-dark-600 mt-1">Executed trades are indexed from blockchain events</p>
        </div>
      </motion.div>

      {/* Cancel Confirmation Modal */}
      <Modal isOpen={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="Cancel Order">
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm text-amber-400 font-medium">Cancel this order?</p>
                <p className="text-xs text-dark-400 mt-1">
                  Locked funds will be returned to your wallet.
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setCancelModalOpen(false)}>
              Keep Order
            </Button>
            <Button variant="danger" size="md" className="flex-1" loading={isLoading} onClick={handleConfirmCancel}>
              Cancel Order
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
