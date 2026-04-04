'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useAccount } from 'wagmi';
import { CONTRACTS, AtomicP2pABI } from '@/lib/contracts';

export function useP2P() {
  const { address } = useAccount();
  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  // Read order book stats
  const { data: orderBookStats, refetch: refetchStats } = useReadContract({
    address: CONTRACTS.ATOMIC_P2P,
    abi: AtomicP2pABI,
    functionName: 'getOrderBookStats',
    query: {
      enabled: !!CONTRACTS.ATOMIC_P2P,
      refetchInterval: 10_000,
    },
  });

  // Read current price
  const { data: currentPrice } = useReadContract({
    address: CONTRACTS.ATOMIC_P2P,
    abi: AtomicP2pABI,
    functionName: 'getCurrentPrice',
    query: {
      enabled: !!CONTRACTS.ATOMIC_P2P,
      refetchInterval: 15_000,
    },
  });

  // Read active buy orders
  const { data: activeBuyOrders, refetch: refetchBuyOrders } = useReadContract({
    address: CONTRACTS.ATOMIC_P2P,
    abi: AtomicP2pABI,
    functionName: 'getActiveBuyOrders',
    args: [BigInt(0), BigInt(20)],
    query: {
      enabled: !!CONTRACTS.ATOMIC_P2P,
      refetchInterval: 10_000,
    },
  });

  // Read active sell orders
  const { data: activeSellOrders, refetch: refetchSellOrders } = useReadContract({
    address: CONTRACTS.ATOMIC_P2P,
    abi: AtomicP2pABI,
    functionName: 'getActiveSellOrders',
    args: [BigInt(0), BigInt(20)],
    query: {
      enabled: !!CONTRACTS.ATOMIC_P2P,
      refetchInterval: 10_000,
    },
  });

  // Write operations
  const createBuyOrder = (usdtAmount: bigint) => {
    writeContract({
      address: CONTRACTS.ATOMIC_P2P,
      abi: AtomicP2pABI,
      functionName: 'createBuyOrder',
      args: [usdtAmount],
    });
  };

  const createSellOrder = (kairoAmount: bigint) => {
    writeContract({
      address: CONTRACTS.ATOMIC_P2P,
      abi: AtomicP2pABI,
      functionName: 'createSellOrder',
      args: [kairoAmount],
    });
  };

  const cancelBuyOrder = (orderId: bigint) => {
    writeContract({
      address: CONTRACTS.ATOMIC_P2P,
      abi: AtomicP2pABI,
      functionName: 'cancelBuyOrder',
      args: [orderId],
    });
  };

  const cancelSellOrder = (orderId: bigint) => {
    writeContract({
      address: CONTRACTS.ATOMIC_P2P,
      abi: AtomicP2pABI,
      functionName: 'cancelSellOrder',
      args: [orderId],
    });
  };

  const executeTrade = (buyOrderId: bigint, sellOrderId: bigint, kairoFillAmount: bigint) => {
    writeContract({
      address: CONTRACTS.ATOMIC_P2P,
      abi: AtomicP2pABI,
      functionName: 'executeTrade',
      args: [buyOrderId, sellOrderId, kairoFillAmount],
    });
  };

  return {
    orderBookStats,
    currentPrice,
    activeBuyOrders,
    activeSellOrders,
    createBuyOrder,
    createSellOrder,
    cancelBuyOrder,
    cancelSellOrder,
    executeTrade,
    refetchStats,
    refetchBuyOrders,
    refetchSellOrders,
    isWritePending,
    isConfirming,
    txHash,
  };
}
