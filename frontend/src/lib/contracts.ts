import { type Address } from 'viem';

// ============ Contract Addresses ============
export const CONTRACTS = {
  KAIRO_TOKEN: (process.env.NEXT_PUBLIC_KAIRO_TOKEN || '') as Address,
  LIQUIDITY_POOL: (process.env.NEXT_PUBLIC_LIQUIDITY_POOL || '') as Address,
  STAKING_MANAGER: (process.env.NEXT_PUBLIC_STAKING_MANAGER || '') as Address,
  AFFILIATE_DISTRIBUTOR: (process.env.NEXT_PUBLIC_AFFILIATE_DISTRIBUTOR || '') as Address,
  CMS: (process.env.NEXT_PUBLIC_CMS || '') as Address,
  ATOMIC_P2P: (process.env.NEXT_PUBLIC_ATOMIC_P2P || '') as Address,
  USDT: (process.env.NEXT_PUBLIC_USDT || '') as Address,
} as const;

// ============ AccessControl / Pausable shared ABI fragments ============
export const PausableABI = [
  { type: 'function', name: 'paused', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'pause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
] as const;

export const AccessControlABI = [
  { type: 'function', name: 'DEFAULT_ADMIN_ROLE', inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'hasRole', inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getRoleAdmin', inputs: [{ name: 'role', type: 'bytes32' }], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'grantRole', inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'revokeRole', inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

// ============ KAIROToken ABI ============
export const KAIROTokenABI = [
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTotalBurned', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getSocialLockAmount', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getEffectiveSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MINTER_ROLE', inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'BURNER_ROLE', inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
] as const;

// ============ LiquidityPool ABI ============
export const LiquidityPoolABI = [
  { type: 'function', name: 'getLivePrice', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getCurrentPrice', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getBalances', inputs: [], outputs: [{ name: 'usdtBalance', type: 'uint256' }, { name: 'kairoBalance', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTotalValueLocked', inputs: [], outputs: [{ name: 'tvl', type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'getLatestSnapshots', inputs: [{ name: 'count', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]', components: [
        { name: 'price', type: 'uint256' },
        { name: 'timestamp', type: 'uint256' },
        { name: 'usdtBalance', type: 'uint256' },
        { name: 'kairoSupply', type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
  },
] as const;

// ============ USDT (ERC20) ABI ============
export const USDTABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'mint', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

// ============ StakingManager ABI ============
export const StakingManagerABI = [
  { type: 'event', name: 'StakeCreated', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'stakeId', type: 'uint256', indexed: false }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'tier', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'Compounded', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'stakeId', type: 'uint256', indexed: false }, { name: 'profit', type: 'uint256', indexed: false }, { name: 'newAmount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Unstaked', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'stakeId', type: 'uint256', indexed: false }, { name: 'returnAmount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'CapReached', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'stakeId', type: 'uint256', indexed: false }, { name: 'totalEarned', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Harvested', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'stakeId', type: 'uint256', indexed: false }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'function', name: 'stake', inputs: [{ name: '_usdtAmount', type: 'uint256' }, { name: '_referrer', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'compound', inputs: [{ name: '_stakeId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unstake', inputs: [{ name: '_stakeId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'harvest', inputs: [{ name: '_stakeId', type: 'uint256' }, { name: '_amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'getUserStakes', inputs: [{ name: '_user', type: 'address' }],
    outputs: [{
      type: 'tuple[]', components: [
        { name: 'amount', type: 'uint256' }, { name: 'originalAmount', type: 'uint256' },
        { name: 'startTime', type: 'uint256' }, { name: 'lastCompoundTime', type: 'uint256' },
        { name: 'harvestedRewards', type: 'uint256' }, { name: 'totalEarned', type: 'uint256' },
        { name: 'active', type: 'bool' }, { name: 'tier', type: 'uint8' },
      ],
    }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'getCapProgress', inputs: [{ name: '_user', type: 'address' }, { name: '_stakeId', type: 'uint256' }], outputs: [{ name: 'earned', type: 'uint256' }, { name: 'cap', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTotalActiveStakeValue', inputs: [{ name: '_user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserStakeCount', inputs: [{ name: '_user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'tiers', inputs: [{ type: 'uint256' }], outputs: [{ name: 'min', type: 'uint256' }, { name: 'max', type: 'uint256' }, { name: 'compoundInterval', type: 'uint256' }, { name: 'dailyClosings', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'systemWallet', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'setSystemWallet', inputs: [{ name: '_wallet', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

// ============ AffiliateDistributor ABI ============
export const AffiliateDistributorABI = [
  { type: 'event', name: 'ReferrerSet', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'referrer', type: 'address', indexed: true }] },
  { type: 'event', name: 'DirectEarned', inputs: [{ name: 'referrer', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'TeamEarned', inputs: [{ name: 'upline', type: 'address', indexed: true }, { name: 'staker', type: 'address', indexed: true }, { name: 'level', type: 'uint256', indexed: false }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Harvested', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'incomeType', type: 'uint8', indexed: false }, { name: 'usdAmount', type: 'uint256', indexed: false }, { name: 'kairoAmount', type: 'uint256', indexed: false }] },
  { type: 'function', name: 'harvest', inputs: [{ name: '_incomeType', type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getAllIncome', inputs: [{ name: '_user', type: 'address' }], outputs: [{ name: 'direct', type: 'uint256' }, { name: 'team', type: 'uint256' }, { name: 'rank', type: 'uint256' }, { name: 'qWeekly', type: 'uint256' }, { name: 'qMonthly', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTotalHarvestable', inputs: [{ name: '_user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'referrerOf', inputs: [{ type: 'address' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getDirectReferrals', inputs: [{ name: '_user', type: 'address' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getUpline', inputs: [{ name: '_user', type: 'address' }, { name: '_levels', type: 'uint256' }], outputs: [{ type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getTeamVolume', inputs: [{ name: '_user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'directDividends', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'teamDividends', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'rankDividends', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'qualifierWeekly', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'qualifierMonthly', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'teamVolume', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'directCount', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

// ============ CoreMembershipSubscription ABI ============
export const CoreMembershipSubscriptionABI = [
  { type: 'event', name: 'SubscriptionPurchased', inputs: [{ name: 'buyer', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'referrer', type: 'address', indexed: true }] },
  { type: 'event', name: 'RewardsClaimed', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'userAmount', type: 'uint256', indexed: false }, { name: 'systemAmount', type: 'uint256', indexed: false }, { name: 'excessDeleted', type: 'uint256', indexed: false }] },
  { type: 'function', name: 'subscribe', inputs: [{ name: '_amount', type: 'uint256' }, { name: '_referrer', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimCMSRewards', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getClaimableRewards', inputs: [{ name: '_user', type: 'address' }], outputs: [{ name: 'loyalty', type: 'uint256' }, { name: 'leadership', type: 'uint256' }, { name: 'total', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getMaxClaimable', inputs: [{ name: '_user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getExcessToBeDeleted', inputs: [{ name: '_user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getSubscriptionCount', inputs: [{ name: '_user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getRemainingSubscriptions', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'isDeadlinePassed', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'canClaim', inputs: [{ name: '_user', type: 'address' }], outputs: [{ name: 'eligible', type: 'bool' }, { name: 'reason', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSubscriptions', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'deadline', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MAX_SUBS', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'extendDeadline', inputs: [{ name: '_newDeadline', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'subscriptionCount', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'loyaltyRewards', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'leadershipRewards', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'hasClaimed', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
] as const;

// ============ AtomicP2p ABI ============
export const AtomicP2pABI = [
  { type: 'event', name: 'BuyOrderCreated', inputs: [{ name: 'orderId', type: 'uint256', indexed: true }, { name: 'creator', type: 'address', indexed: true }, { name: 'usdtAmount', type: 'uint256', indexed: false }, { name: 'timestamp', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'SellOrderCreated', inputs: [{ name: 'orderId', type: 'uint256', indexed: true }, { name: 'creator', type: 'address', indexed: true }, { name: 'kairoAmount', type: 'uint256', indexed: false }, { name: 'timestamp', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'OrderCancelled', inputs: [{ name: 'orderId', type: 'uint256', indexed: true }, { name: 'creator', type: 'address', indexed: true }, { name: 'isBuyOrder', type: 'bool', indexed: false }, { name: 'refundedAmount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'TradeExecuted', inputs: [{ name: 'tradeId', type: 'uint256', indexed: true }, { name: 'buyOrderId', type: 'uint256', indexed: true }, { name: 'sellOrderId', type: 'uint256', indexed: true }, { name: 'buyer', type: 'address', indexed: false }, { name: 'seller', type: 'address', indexed: false }, { name: 'kairoAmount', type: 'uint256', indexed: false }, { name: 'usdtAmount', type: 'uint256', indexed: false }, { name: 'price', type: 'uint256', indexed: false }, { name: 'kairoFee', type: 'uint256', indexed: false }, { name: 'usdtFee', type: 'uint256', indexed: false }] },
  { type: 'function', name: 'createBuyOrder', inputs: [{ name: 'usdtAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'createSellOrder', inputs: [{ name: 'kairoAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'cancelBuyOrder', inputs: [{ name: 'orderId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'cancelSellOrder', inputs: [{ name: 'orderId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'sellToOrder', inputs: [{ name: 'buyOrderId', type: 'uint256' }, { name: 'kairoAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'buyFromOrder', inputs: [{ name: 'sellOrderId', type: 'uint256' }, { name: 'kairoAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'executeTrade', inputs: [{ name: 'buyOrderId', type: 'uint256' }, { name: 'sellOrderId', type: 'uint256' }, { name: 'kairoFillAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'getBuyOrder', inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [{ type: 'tuple', components: [{ name: 'creator', type: 'address' }, { name: 'usdtAmount', type: 'uint256' }, { name: 'usdtRemaining', type: 'uint256' }, { name: 'active', type: 'bool' }, { name: 'createdAt', type: 'uint256' }] }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'getSellOrder', inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [{ type: 'tuple', components: [{ name: 'creator', type: 'address' }, { name: 'kairoAmount', type: 'uint256' }, { name: 'kairoRemaining', type: 'uint256' }, { name: 'active', type: 'bool' }, { name: 'createdAt', type: 'uint256' }] }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'getCurrentPrice', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'getActiveBuyOrders', inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ type: 'tuple[]', components: [{ name: 'creator', type: 'address' }, { name: 'usdtAmount', type: 'uint256' }, { name: 'usdtRemaining', type: 'uint256' }, { name: 'active', type: 'bool' }, { name: 'createdAt', type: 'uint256' }] }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'getActiveSellOrders', inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ type: 'tuple[]', components: [{ name: 'creator', type: 'address' }, { name: 'kairoAmount', type: 'uint256' }, { name: 'kairoRemaining', type: 'uint256' }, { name: 'active', type: 'bool' }, { name: 'createdAt', type: 'uint256' }] }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'getOrderBookStats', inputs: [], outputs: [{ name: 'totalBuyOrders', type: 'uint256' }, { name: 'totalSellOrders', type: 'uint256' }, { name: 'totalTrades', type: 'uint256' }, { name: 'activeBuyOrders', type: 'uint256' }, { name: 'activeSellOrders', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTotalLiquidity', inputs: [], outputs: [{ name: 'totalBuyLiquidity', type: 'uint256' }, { name: 'totalSellLiquidity', type: 'uint256' }], stateMutability: 'view' },
] as const;

// ============ Role Constants ============
export const ROLE_HASHES = {
  DEFAULT_ADMIN_ROLE: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
  MINTER_ROLE: '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6' as `0x${string}`,
  BURNER_ROLE: '0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848' as `0x${string}`,
  STAKING_ROLE: '0x89a4ef64686b06fc0c13629d1ed09f72f4441d95d3fea3b3a07e3a917e2f7fce' as `0x${string}`,
  COMPOUNDER_ROLE: '0xad94e34c253e2ea8b8aa3d7a396a60b69d5b0bb5e7fcaf41ab97a93dccebe0bd' as `0x${string}`,
} as const;
