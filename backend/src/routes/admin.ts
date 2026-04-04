import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { isValidAddress } from '../utils/validation';
import { getTeamVolume, getLargestLeg, getDirectReferralCount, getDownline } from '../utils/referral-tree';
import { getAffiliateDistributor, getCurrentBlock } from '../services/blockchain';
import { getConnectedClients } from '../services/websocket';
import { pool } from '../db/connection';

const router = Router();

// Rank thresholds (team volume in USD, matching contract RANK_THRESHOLDS)
const RANK_THRESHOLDS = [
    0,          // Rank 0 - no requirement
    10_000,     // Rank 1
    50_000,     // Rank 2
    200_000,    // Rank 3
    500_000,    // Rank 4
    1_000_000,  // Rank 5
    5_000_000,  // Rank 6
];

/**
 * Calculate rank for a single user based on team volume + direct referral count.
 * Returns the new rank level.
 */
async function calculateUserRank(address: string): Promise<{
    address: string;
    previousRank: number;
    newRank: number;
    teamVolume: string;
    directCount: number;
}> {
    const walletAddress = address.toLowerCase();

    const [userResult, teamVolume, directCount] = await Promise.all([
        query('SELECT rank_level FROM users WHERE wallet_address = $1', [walletAddress]),
        getTeamVolume(walletAddress),
        getDirectReferralCount(walletAddress),
    ]);

    const previousRank = userResult.rows[0]?.rank_level ?? 0;
    const tvNum = parseFloat(teamVolume);

    // Determine highest eligible rank
    let newRank = 0;
    for (let i = RANK_THRESHOLDS.length - 1; i >= 1; i--) {
        if (tvNum >= RANK_THRESHOLDS[i] && directCount >= i) {
            newRank = i;
            break;
        }
    }

    // Persist if changed
    if (newRank !== previousRank) {
        await query(
            'UPDATE users SET rank_level = $1, team_volume = $2, updated_at = NOW() WHERE wallet_address = $3',
            [newRank, teamVolume, walletAddress]
        );
    }

    return { address: walletAddress, previousRank, newRank, teamVolume, directCount };
}

/**
 * POST /api/v1/admin/calculate-rank
 * Body: { address?: string }
 * Trigger rank calculation for a specific user or all users
 */
router.post('/admin/calculate-rank', async (req: Request, res: Response) => {
    try {
        const { address } = req.body;

        if (address) {
            if (!isValidAddress(address)) {
                res.status(400).json({ success: false, error: 'Invalid Ethereum address' });
                return;
            }

            const userResult = await query(
                'SELECT * FROM users WHERE wallet_address = $1',
                [address.toLowerCase()]
            );
            if (userResult.rows.length === 0) {
                res.status(404).json({ success: false, error: 'User not found' });
                return;
            }

            const result = await calculateUserRank(address);

            // Call on-chain updateRankDividend if rank changed
            if (result.newRank !== result.previousRank) {
                try {
                    const affiliate = getAffiliateDistributor(true);
                    if (!affiliate) throw new Error('Contracts not configured');
                    const amountWei = await affiliate.calculateRankSalary(address.toLowerCase());
                    if (amountWei > 0n) {
                        const tx = await affiliate.updateRankDividend(address.toLowerCase(), amountWei);
                        await tx.wait();
                    }
                } catch (err) {
                    console.warn('On-chain rank update failed (will retry):', err);
                }
            }

            res.json({
                success: true,
                message: `Rank calculation complete for ${address}`,
                data: result,
            });
        } else {
            // Calculate for all users
            const usersResult = await query('SELECT wallet_address FROM users ORDER BY created_at ASC');
            const results = [];
            let updated = 0;

            for (const row of usersResult.rows) {
                const result = await calculateUserRank(row.wallet_address);
                if (result.newRank !== result.previousRank) updated++;
                results.push(result);
            }

            res.json({
                success: true,
                message: `Rank calculation complete for ${usersResult.rows.length} users, ${updated} updated`,
                data: {
                    total: usersResult.rows.length,
                    updated,
                    results,
                },
            });
        }
    } catch (error) {
        console.error('Calculate rank error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/v1/admin/system-stats
 * System health: DB connections, last indexed block, queue sizes, WS clients
 */
router.get('/admin/system-stats', async (_req: Request, res: Response) => {
    try {
        // DB pool stats
        const poolStats = {
            totalConnections: pool.totalCount,
            idleConnections: pool.idleCount,
            waitingRequests: pool.waitingCount,
        };

        // Last indexed blocks
        const indexerResult = await query(
            'SELECT contract_name, last_block, updated_at FROM indexer_state ORDER BY contract_name ASC'
        );

        // Current chain block
        let currentBlock = 0;
        try {
            currentBlock = await getCurrentBlock();
        } catch {
            // best-effort
        }

        // Basic counts
        const [usersCount, stakesCount, ordersCount] = await Promise.all([
            query('SELECT COUNT(*)::int AS count FROM users'),
            query('SELECT COUNT(*)::int AS count FROM stakes WHERE is_active = TRUE'),
            query('SELECT COUNT(*)::int AS count FROM p2p_orders WHERE is_active = TRUE'),
        ]);

        res.json({
            success: true,
            data: {
                database: poolStats,
                indexer: {
                    contracts: indexerResult.rows,
                    currentBlock,
                },
                websocket: {
                    connectedClients: getConnectedClients(),
                },
                counts: {
                    users: usersCount.rows[0]?.count || 0,
                    activeStakes: stakesCount.rows[0]?.count || 0,
                    activeOrders: ordersCount.rows[0]?.count || 0,
                },
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
            },
        });
    } catch (error) {
        console.error('System stats error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
