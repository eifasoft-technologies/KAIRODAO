import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { query } from '../db/connection';
import { cache, TTL } from '../utils/cache';
import {
    getLivePrice,
    getKAIROToken,
    getAuxFund,
    getCMS,
    getCurrentBlock,
} from '../services/blockchain';
import { getConnectedClients } from '../services/websocket';

const router = Router();

/**
 * GET /api/v1/global/stats
 * Returns comprehensive global platform statistics
 */
router.get('/global/stats', async (_req: Request, res: Response) => {
    try {
        const data = await cache.getOrSet('global:stats', TTL.GLOBAL_STATS, async () => {
            // ---------- DB aggregates (parallel) ----------
            const [
                tvlResult,
                stakingCountsResult,
                cmsResult,
                p2pOrdersResult,
                p2pTradesResult,
                p2pVolume24hResult,
                priceHistoryResult,
            ] = await Promise.all([
                query(
                    `SELECT
                        COALESCE(SUM(amount), 0) AS total_tvl
                     FROM stakes WHERE is_active = TRUE`
                ),
                query(
                    `SELECT
                        COUNT(*)::int AS active_stakes,
                        COUNT(DISTINCT user_address)::int AS total_stakers,
                        COALESCE(AVG(amount), 0) AS average_stake
                     FROM stakes WHERE is_active = TRUE`
                ),
                query(
                    `SELECT
                        COUNT(*)::int AS total_subscriptions
                     FROM cms_subscriptions`
                ),
                query(
                    `SELECT
                        COUNT(*) FILTER (WHERE order_type = 'buy' AND is_active = TRUE)::int AS active_buy,
                        COUNT(*) FILTER (WHERE order_type = 'sell' AND is_active = TRUE)::int AS active_sell
                     FROM p2p_orders`
                ),
                query('SELECT COUNT(*)::int AS total FROM p2p_trades'),
                query(
                    `SELECT COALESCE(SUM(amount * price), 0) AS volume
                     FROM p2p_trades
                     WHERE created_at >= NOW() - INTERVAL '24 hours'`
                ),
                query(
                    `SELECT value FROM global_stats WHERE key = 'current_price'`
                ),
            ]);

            // ---------- Contract calls (best-effort, cached) ----------
            let price = '0';
            let totalSupply = '0';
            let totalBurned = '0';
            let effectiveSupply = '0';
            let socialLock = '0';
            let change24h = '0';
            let cmsDeadline = 0;
            let cmsRemaining = 0;

            // Price
            try {
                const priceBn = await cache.getOrSet('live:price', TTL.PRICE, getLivePrice);
                price = ethers.formatEther(priceBn);
            } catch {
                price = priceHistoryResult.rows[0]?.value?.toString() || '0';
            }

            // Token supply info
            try {
                const kairo = getKAIROToken();
                if (!kairo) throw new Error('Contracts not configured');
                const [supply, burned, effective, lock] = await Promise.all([
                    kairo.totalSupply(),
                    kairo.getTotalBurned().catch(() => BigInt(0)),
                    kairo.getEffectiveSupply().catch(() => BigInt(0)),
                    kairo.getSocialLockAmount().catch(() => BigInt(0)),
                ]);
                totalSupply = ethers.formatEther(supply);
                totalBurned = ethers.formatEther(burned);
                effectiveSupply = ethers.formatEther(effective);
                socialLock = ethers.formatEther(lock);
            } catch {
                // fall back to global_stats table
            }

            // CMS info
            try {
                const cmsContract = getCMS();
                if (!cmsContract) throw new Error('Contracts not configured');
                const [deadline, remaining] = await Promise.all([
                    cmsContract.deadline().catch(() => BigInt(0)),
                    cmsContract.getRemainingSubscriptions().catch(() => BigInt(0)),
                ]);
                cmsDeadline = Number(deadline);
                cmsRemaining = Number(remaining);
            } catch {
                // best-effort
            }

            const tvlRow = tvlResult.rows[0];
            const stakingRow = stakingCountsResult.rows[0];
            const cmsRow = cmsResult.rows[0];
            const p2pRow = p2pOrdersResult.rows[0];
            const p2pTradesRow = p2pTradesResult.rows[0];
            const p2pVol = p2pVolume24hResult.rows[0];

            return {
                price: {
                    current: price,
                    change24h,
                },
                tvl: {
                    total: tvlRow?.total_tvl || '0',
                    stakingTVL: tvlRow?.total_tvl || '0',
                    liquidityTVL: '0', // populated if liquidity pool data is indexed
                },
                supply: {
                    total: totalSupply,
                    burned: totalBurned,
                    effective: effectiveSupply,
                    socialLock: socialLock,
                },
                staking: {
                    activeStakes: stakingRow?.active_stakes || 0,
                    totalStakers: stakingRow?.total_stakers || 0,
                    averageStake: stakingRow?.average_stake?.toString() || '0',
                },
                cms: {
                    totalSubscriptions: cmsRow?.total_subscriptions || 0,
                    remainingSubscriptions: cmsRemaining,
                    deadlineTimestamp: cmsDeadline,
                },
                p2p: {
                    activeBuyOrders: p2pRow?.active_buy || 0,
                    activeSellOrders: p2pRow?.active_sell || 0,
                    totalTradesExecuted: p2pTradesRow?.total || 0,
                    volume24h: p2pVol?.volume?.toString() || '0',
                },
            };
        });

        res.json({ success: true, data });
    } catch (error) {
        console.error('Global stats error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
