import dotenv from 'dotenv';
dotenv.config();

interface Config {
    nodeEnv: string;
    port: number;
    databaseUrl: string;
    redisUrl: string;
    rpcUrl: string;
    rpcWsUrl: string;
    chainId: number;
    indexerPrivateKey: string;
    contracts: {
        kairoToken: string;
        liquidityPool: string;
        stakingManager: string;
        affiliateDistributor: string;
        cms: string;
        atomicP2p: string;
    };
    systemWallet: string;
}

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value && process.env.NODE_ENV === 'production') {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value || '';
}

export const config: Config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '4000', 10),
    databaseUrl: requireEnv('DATABASE_URL'),
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    rpcUrl: requireEnv('RPC_URL'),
    rpcWsUrl: process.env.RPC_WS_URL || '',
    chainId: parseInt(process.env.CHAIN_ID || '5611', 10),
    indexerPrivateKey: process.env.INDEXER_PRIVATE_KEY || '',
    contracts: {
        kairoToken: process.env.KAIRO_TOKEN_ADDRESS || '',
        liquidityPool: process.env.LIQUIDITY_POOL_ADDRESS || '',
        stakingManager: process.env.STAKING_MANAGER_ADDRESS || '',
        affiliateDistributor: process.env.AFFILIATE_DISTRIBUTOR_ADDRESS || '',
        cms: process.env.CMS_ADDRESS || '',
        atomicP2p: process.env.ATOMIC_P2P_ADDRESS || '',
    },
    systemWallet: process.env.SYSTEM_WALLET || '',
};
