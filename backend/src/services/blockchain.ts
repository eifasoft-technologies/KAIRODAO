import { ethers, JsonRpcProvider, WebSocketProvider, Contract, Wallet } from 'ethers';
import { config } from '../config';
import {
    StakingManagerABI,
    AffiliateDistributorABI,
    CoreMembershipSubscriptionABI,
    P2PEscrowABI,
    KAIROTokenABI,
    AuxFundABI,
} from '../abis';

// ============ Providers ============

let httpProvider: JsonRpcProvider;
let wsProvider: WebSocketProvider | null = null;
let signer: Wallet | null = null;

/**
 * Initialize blockchain providers
 */
export function initProviders(): void {
    httpProvider = new JsonRpcProvider(config.rpcUrl, config.chainId);

    if (config.rpcWsUrl) {
        try {
            wsProvider = new WebSocketProvider(config.rpcWsUrl, config.chainId);
            console.log('WebSocket provider initialized');
        } catch (err) {
            console.warn('WebSocket provider failed to initialize, falling back to HTTP polling:', err);
        }
    }

    if (config.indexerPrivateKey) {
        signer = new Wallet(config.indexerPrivateKey, httpProvider);
        console.log('Signer wallet initialized:', signer.address);
    }

    console.log('Blockchain providers initialized (chainId:', config.chainId, ')');
}

/**
 * Get the HTTP JSON-RPC provider
 */
export function getHttpProvider(): JsonRpcProvider {
    if (!httpProvider) {
        initProviders();
    }
    return httpProvider;
}

/**
 * Get the WebSocket provider (if available)
 */
export function getWsProvider(): WebSocketProvider | null {
    return wsProvider;
}

/**
 * Get the signer wallet (for backend-triggered transactions)
 */
export function getSigner(): Wallet | null {
    return signer;
}

// ============ Contract Instances ============

/**
 * Check if all required contract addresses are configured
 */
export function areContractsConfigured(): boolean {
    const c = config.contracts;
    return !!(c.kairoToken && c.auxFund && c.stakingManager && c.affiliateDistributor && c.cms && c.p2pEscrow);
}

export function getStakingManager(useSigner = false): Contract | null {
    if (!config.contracts.stakingManager) return null;
    const provider = useSigner && signer ? signer : getHttpProvider();
    return new Contract(config.contracts.stakingManager, StakingManagerABI, provider);
}

export function getAffiliateDistributor(useSigner = false): Contract | null {
    if (!config.contracts.affiliateDistributor) return null;
    const provider = useSigner && signer ? signer : getHttpProvider();
    return new Contract(config.contracts.affiliateDistributor, AffiliateDistributorABI, provider);
}

export function getCMS(useSigner = false): Contract | null {
    if (!config.contracts.cms) return null;
    const provider = useSigner && signer ? signer : getHttpProvider();
    return new Contract(config.contracts.cms, CoreMembershipSubscriptionABI, provider);
}

export function getP2PEscrow(useSigner = false): Contract | null {
    if (!config.contracts.p2pEscrow) return null;
    const provider = useSigner && signer ? signer : getHttpProvider();
    return new Contract(config.contracts.p2pEscrow, P2PEscrowABI, provider);
}

export function getKAIROToken(): Contract | null {
    if (!config.contracts.kairoToken) return null;
    return new Contract(config.contracts.kairoToken, KAIROTokenABI, getHttpProvider());
}

export function getAuxFund(): Contract | null {
    if (!config.contracts.auxFund) return null;
    return new Contract(config.contracts.auxFund, AuxFundABI, getHttpProvider());
}

/**
 * Get contracts connected to the WebSocket provider for event listening
 */
export function getWsContracts(): { stakingManager: Contract; affiliateDistributor: Contract; cms: Contract; p2pEscrow: Contract } | null {
    if (!areContractsConfigured()) return null;
    const provider = wsProvider || getHttpProvider();

    return {
        stakingManager: new Contract(config.contracts.stakingManager, StakingManagerABI, provider),
        affiliateDistributor: new Contract(config.contracts.affiliateDistributor, AffiliateDistributorABI, provider),
        cms: new Contract(config.contracts.cms, CoreMembershipSubscriptionABI, provider),
        p2pEscrow: new Contract(config.contracts.p2pEscrow, P2PEscrowABI, provider),
    };
}

/**
 * Get current block number
 */
export async function getCurrentBlock(): Promise<number> {
    return getHttpProvider().getBlockNumber();
}

/**
 * Get live KAIRO price from AuxFund
 */
export async function getLivePrice(): Promise<bigint> {
    const auxFund = getAuxFund();
    if (!auxFund) return BigInt(0);
    try {
        return await auxFund.getCurrentPrice();
    } catch {
        try {
            return await auxFund.getLivePrice();
        } catch {
            console.warn('Failed to fetch live price from AuxFund');
            return BigInt(0);
        }
    }
}
