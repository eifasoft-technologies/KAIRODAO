import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { query } from '../db/connection';
import { validateAddressParam } from '../utils/validation';
import { cache, TTL } from '../utils/cache';
import { getAffiliateDistributor, getCMS, getLivePrice } from '../services/blockchain';
import { getDownline, getTeamVolume, getLargestLeg, getDirectReferralCount } from '../utils/referral-tree';

const router = Router();

// Tier compound intervals in seconds (matching contract TIER_INTERVALS)
const TIER_INTERVALS: Record<number, number> = {
    0: 86400,     // 1 day
    1: 43200,     // 12 hours
    2: 21600,     // 6 hours
    3: 10800,     // 3 hours
    4: 3600,      // 1 hour
};

/**
 * GET /api/v1/user/:address/dashboard
 * Returns comprehensive user dashboard data
 */
router.get('/user/:address/dashboard', validateAddressParam, async (req: Request, res: Response) => {
    try {
        const walletAddress = req.params.address.toLowerCase();

        // ---------- DB queries (parallel) ----------
        const [userResult, stakesResult, cmsResult, incomeAggResult] = await Promise.all([
            query(
                'SELECT * FROM users WHERE wallet_address = $1',
                [walletAddress]
            ),
            query(
                `SELECT * FROM stakes WHERE user_address = $1 AND is_active = TRUE
                 ORDER BY created_at DESC`,
                [walletAddress]
            ),
            query(
                `SELECT
                    COUNT(*)::int AS subscription_count,
                    COALESCE(SUM(loyalty_reward), 0) AS loyalty_rewards,
                    bool_or(claimed) AS any_claimed
                 FROM cms_subscriptions WHERE buyer = $1`,
                [walletAddress]
            ),
            query(
                `SELECT income_type, COALESCE(SUM(amount_usd), 0) AS total
                 FROM income_ledger WHERE user_address = $1
                 GROUP BY income_type`,
                [walletAddress]
            ),
        ]);

        const user = userResult.rows[0] || null;

        // ---------- Build stakes array ----------
        const activeStakes = stakesResult.rows.map((s: any) => {
            const originalAmt = parseFloat(s.original_amount);
            const totalEarned = parseFloat(s.total_earned);
            const cap = originalAmt * 3;
            const capProgress = cap > 0 ? Math.min((totalEarned / cap) * 100, 100) : 0;
            const tierInterval = TIER_INTERVALS[s.tier] ?? 86400;
            const lastCompound = new Date(s.last_compound).getTime();
            const nextCompoundTime = new Date(lastCompound + tierInterval * 1000).toISOString();

            return {
                stakeId: s.stake_id_on_chain,
                amount: s.amount,
                originalAmount: s.original_amount,
                tier: s.tier,
                startTime: s.start_time,
                lastCompound: s.last_compound,
                totalEarned: s.total_earned,
                harvestedRewards: s.harvested_rewards,
                capProgress: parseFloat(capProgress.toFixed(2)),
                nextCompoundTime,
            };
        });

        const totalActiveValue = activeStakes
            .reduce((acc: number, s: any) => acc + parseFloat(s.amount), 0)
            .toString();

        // ---------- Income aggregation ----------
        const incomeMap: Record<string, string> = {};
        for (const row of incomeAggResult.rows) {
            incomeMap[row.income_type] = row.total;
        }

        // ---------- Contract calls for live income (best-effort) ----------
        let liveIncome = {
            direct: incomeMap['direct'] || '0',
            team: incomeMap['team'] || '0',
            rank: incomeMap['rank'] || '0',
            qualifierWeekly: incomeMap['qualifier_weekly'] || '0',
            qualifierMonthly: incomeMap['qualifier_monthly'] || '0',
            totalHarvestable: '0',
        };

        try {
            const affiliate = getAffiliateDistributor();
            if (!affiliate) throw new Error('Contracts not configured');
            const allIncome = await affiliate.getAllIncome(walletAddress);
            // allIncome typically returns [direct, team, rank, qualifierWeekly, qualifierMonthly]
            if (allIncome && allIncome.length >= 5) {
                liveIncome = {
                    direct: ethers.formatEther(allIncome[0]),
                    team: ethers.formatEther(allIncome[1]),
                    rank: ethers.formatEther(allIncome[2]),
                    qualifierWeekly: ethers.formatEther(allIncome[3]),
                    qualifierMonthly: ethers.formatEther(allIncome[4]),
                    totalHarvestable: ethers.formatEther(
                        allIncome.reduce((a: bigint, b: bigint) => a + b, BigInt(0))
                    ),
                };
            }
        } catch {
            // Contract call failed – fall back to DB aggregates
        }

        // ---------- CMS data ----------
        const cmsRow = cmsResult.rows[0] || {};
        let cmsClaimable = '0';
        let cmsLoyalty = '0';
        let cmsLeadership = '0';
        let cmsExcessToDelete = '0';
        try {
            const cmsContract = getCMS();
            if (!cmsContract) throw new Error('Contracts not configured');
            const [loyalty, leadership, total] = await cmsContract.getClaimableRewards(walletAddress);
            cmsClaimable = ethers.formatEther(total);
            cmsLoyalty = ethers.formatEther(loyalty);
            cmsLeadership = ethers.formatEther(leadership);
        } catch {
            // best-effort
        }

        // max claimable is based on active stake value
        const maxClaimable = totalActiveValue;
        const claimableNum = parseFloat(cmsClaimable);
        const maxNum = parseFloat(maxClaimable);
        if (claimableNum > maxNum) {
            cmsExcessToDelete = (claimableNum - maxNum).toString();
        }

        const cms = {
            subscriptionCount: cmsRow.subscription_count || 0,
            loyaltyRewards: cmsLoyalty,
            leadershipRewards: cmsLeadership,
            claimed: cmsRow.any_claimed || false,
            maxClaimable,
            excessToDelete: cmsExcessToDelete,
        };

        // ---------- Team stats (parallel) ----------
        const [directCount, teamVolume, largestLegData] = await Promise.all([
            getDirectReferralCount(walletAddress),
            getTeamVolume(walletAddress),
            getLargestLeg(walletAddress),
        ]);

        const downline = await getDownline(walletAddress, 15);

        const teamStats = {
            directCount,
            totalTeamSize: downline.length,
            teamVolume,
            largestLeg: largestLegData.largestLeg,
        };

        res.json({
            success: true,
            data: {
                user: user
                    ? {
                          walletAddress: user.wallet_address,
                          referrer: user.referrer || null,
                          totalStakedVolume: user.total_staked_volume,
                          teamVolume: user.team_volume,
                          rankLevel: user.rank_level,
                      }
                    : null,
                stakes: {
                    active: activeStakes,
                    totalActiveValue,
                },
                income: liveIncome,
                cms,
                teamStats,
            },
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/v1/user/:address/referrals
 * Returns the 15-level downline tree
 */
router.get('/user/:address/referrals', validateAddressParam, async (req: Request, res: Response) => {
    try {
        const walletAddress = req.params.address.toLowerCase();
        const maxDepth = Math.min(parseInt(req.query.depth as string) || 15, 15);

        // Parallel data fetching
        const [userResult, treeResult, largestLegData] = await Promise.all([
            query('SELECT referrer FROM users WHERE wallet_address = $1', [walletAddress]),
            query(
                `SELECT rt.descendant, rt.depth, u.total_staked_volume, u.team_volume, u.referrer
                 FROM referral_tree rt
                 LEFT JOIN users u ON u.wallet_address = rt.descendant
                 WHERE rt.ancestor = $1 AND rt.depth > 0 AND rt.depth <= $2
                 ORDER BY rt.depth ASC, rt.descendant ASC`,
                [walletAddress, maxDepth]
            ),
            getLargestLeg(walletAddress),
        ]);

        const referrer = userResult.rows[0]?.referrer || null;

        // Direct referrals (depth = 1)
        const directReferrals = treeResult.rows
            .filter((r: any) => r.depth === 1)
            .map((r: any) => ({
                address: r.descendant,
                stakedVolume: r.total_staked_volume || '0',
                teamVolume: r.team_volume || '0',
                depth: r.depth,
            }));

        // Full downline tree
        const downlineTree = treeResult.rows.map((r: any) => ({
            address: r.descendant,
            depth: r.depth,
            stakedVolume: r.total_staked_volume || '0',
            referrer: r.referrer || '',
        }));

        // Volume by level
        const volumeByLevel: Array<{ level: number; volume: string; count: number }> = [];
        const levelMap = new Map<number, { volume: number; count: number }>();
        for (const r of treeResult.rows) {
            const existing = levelMap.get(r.depth) || { volume: 0, count: 0 };
            existing.volume += parseFloat(r.total_staked_volume || '0');
            existing.count += 1;
            levelMap.set(r.depth, existing);
        }
        for (const [level, data] of levelMap) {
            volumeByLevel.push({ level, volume: data.volume.toString(), count: data.count });
        }
        volumeByLevel.sort((a, b) => a.level - b.level);

        res.json({
            success: true,
            data: {
                referrer,
                directReferrals,
                downlineTree,
                stats: {
                    totalDownline: downlineTree.length,
                    volumeByLevel,
                    largestLeg: {
                        address: largestLegData.largestLegAddress,
                        volume: largestLegData.largestLeg,
                    },
                },
            },
        });
    } catch (error) {
        console.error('Referrals error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
