import { Address } from 'viem';

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 5611);

export const contracts = {
  kairoToken: (process.env.NEXT_PUBLIC_KAIRO_TOKEN || '0x') as Address,
  liquidityPool: (process.env.NEXT_PUBLIC_LIQUIDITY_POOL || '0x') as Address,
  stakingManager: (process.env.NEXT_PUBLIC_STAKING_MANAGER || '0x') as Address,
  affiliateDistributor: (process.env.NEXT_PUBLIC_AFFILIATE_DISTRIBUTOR || '0x') as Address,
  cms: (process.env.NEXT_PUBLIC_CMS || '0x') as Address,
  atomicP2p: (process.env.NEXT_PUBLIC_ATOMIC_P2P || '0x') as Address,
  usdt: (process.env.NEXT_PUBLIC_USDT || '0x') as Address,
} as const;

export const EXPLORER_URL = 'https://testnet.opbnbscan.com';

export function getExplorerTxUrl(hash: string) {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function getExplorerAddressUrl(address: string) {
  return `${EXPLORER_URL}/address/${address}`;
}

// Constants from contracts
export const STAKING_TIERS = [
  { name: 'Bronze', minAmount: 10, compoundInterval: 8 * 3600, color: '#CD7F32' },
  { name: 'Silver', minAmount: 1000, compoundInterval: 6 * 3600, color: '#C0C0C0' },
  { name: 'Gold', minAmount: 5000, compoundInterval: 4 * 3600, color: '#FFD700' },
] as const;

export const RANK_NAMES = [
  'None', 'Star', 'Bronze Star', 'Silver Star', 'Gold Star',
  'Platinum Star', 'Diamond', 'Blue Diamond', 'Black Diamond',
  'Royal Diamond', 'Crown Diamond',
] as const;

export const USDT_DECIMALS = 18; // MockUSDT uses 18 decimals
export const KAIRO_DECIMALS = 18;
export const BASIS_POINTS = 10000;
export const SWAP_FEE_BPS = 300; // 3%
export const P2P_FEE_BPS = 300; // 3%
export const CMS_PRICE_USDT = 10; // 10 USDT per subscription
export const CMS_MAX_SUBSCRIPTIONS = 10000;
export const KAIRO_PER_CMS = 5; // 5 KAIRO loyalty reward per subscription

// System wallet used as referrer for the first-ever (genesis) registration
export const SYSTEM_WALLET = (process.env.NEXT_PUBLIC_SYSTEM_WALLET || '0x') as Address;
