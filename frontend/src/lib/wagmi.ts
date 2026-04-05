import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';

export const opBNBTestnet = defineChain({
  id: 5611,
  name: 'opBNB Testnet',
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://opbnb-testnet-rpc.bnbchain.org'] } },
  blockExplorers: { default: { name: 'opBNBScan', url: 'https://testnet.opbnbscan.com' } },
  testnet: true,
});

export const opBNBMainnet = defineChain({
  id: 204,
  name: 'opBNB',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://opbnb-mainnet-rpc.bnbchain.org'] } },
  blockExplorers: { default: { name: 'opBNBScan', url: 'https://opbnbscan.com' } },
});

export const config = getDefaultConfig({
  appName: 'KAIRO DeFi',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
  chains: [opBNBTestnet, opBNBMainnet],
  ssr: true,
});
