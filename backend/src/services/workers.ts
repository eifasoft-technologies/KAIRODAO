import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { query } from '../db/connection';
import { getStakingManager, getAffiliateDistributor } from './blockchain';
import { getTeamVolume, getLargestLeg } from '../utils/referral-tree';

// ============ Redis Connection ============

let redisConnection: IORedis | null = null;

function getRedisConnection(): IORedis {
    if (!redisConnection) {
        redisConnection = new IORedis(config.redisUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
    }
    return redisConnection;
}

// ============ Rank Thresholds & Salaries (mirrors AffiliateDistributor.sol) ============

const RANK_THRESHOLDS = [
    10_000, 30_000, 100_000, 300_000, 1_000_000,
    3_000_000, 10_000_000, 30_000_000, 100_000_000, 250_000_000,
];

const RANK_SALARIES = [
    10, 30, 70, 200, 600,
    1_200, 4_000, 12_000, 40_000, 100_000,
];

// ============ Compound Worker ============

function createCompoundWorker(): Worker {
    return new Worker(
        'compounding',
        async (job: Job) => {
            const tier: number = job.data.tier;
            console.log(`[CompoundWorker] Starting compound for tier ${tier}...`);

            try {
                // Query active stakes for this tier that are due for compounding
                const result = await query(
                    `SELECT s.user_address, s.stake_id_on_chain
                     FROM stakes s
                     WHERE s.is_active = TRUE
                       AND s.tier = $1
                       AND s.cap_reached = FALSE
                       AND s.last_compound < NOW() - INTERVAL '1 second' *
                           CASE
                               WHEN $1 = 0 THEN 28800
                               WHEN $1 = 1 THEN 21600
                               WHEN $1 = 2 THEN 14400
                               ELSE 28800
                           END
                     ORDER BY s.last_compound ASC`,
                    [tier]
                );

                console.log(`[CompoundWorker] Found ${result.rows.length} stakes due for tier ${tier}`);

                const stakingManager = getStakingManager(true);
                if (!stakingManager) {
                    console.warn('[CompoundWorker] Contracts not configured, skipping compound');
                    return;
                }
                let successCount = 0;
                let failCount = 0;

                for (const row of result.rows) {
                    try {
                        // Estimate gas first
                        const gasEstimate = await stakingManager.compoundFor.estimateGas(
                            row.user_address,
                            row.stake_id_on_chain
                        );

                        // Execute compound with 20% gas buffer
                        const tx = await stakingManager.compoundFor(
                            row.user_address,
                            row.stake_id_on_chain,
                            { gasLimit: (gasEstimate * BigInt(120)) / BigInt(100) }
                        );

                        await tx.wait();
                        successCount++;
                        console.log(`[CompoundWorker] Compounded: user=${row.user_address}, stakeId=${row.stake_id_on_chain}`);
                    } catch (err: any) {
                        failCount++;
                        console.error(
                            `[CompoundWorker] Failed to compound: user=${row.user_address}, stakeId=${row.stake_id_on_chain}:`,
                            err.message || err
                        );
                    }
                }

                console.log(`[CompoundWorker] Tier ${tier} complete: ${successCount} success, ${failCount} failed`);
            } catch (err) {
                console.error(`[CompoundWorker] Error processing tier ${tier}:`, err);
                throw err;
            }
        },
        {
            connection: getRedisConnection(),
            concurrency: 1,
        }
    );
}

// ============ Rank Calculator Worker ============

function createRankUpdateWorker(): Worker {
    return new Worker(
        'rank-update',
        async (job: Job) => {
            console.log('[RankWorker] Starting rank calculation...');

            try {
                // Query all users that have team_volume > 0 or are referrers
                const usersResult = await query(
                    `SELECT DISTINCT u.wallet_address
                     FROM users u
                     WHERE u.wallet_address IN (
                         SELECT ancestor FROM referral_tree WHERE depth > 0
                     )`
                );

                console.log(`[RankWorker] Processing ${usersResult.rows.length} users for rank update`);

                const affiliateDistributor = getAffiliateDistributor(true);
                if (!affiliateDistributor) {
                    console.warn('[RankWorker] Contracts not configured, skipping rank update');
                    return;
                }
                let updatedCount = 0;

                for (const row of usersResult.rows) {
                    try {
                        const userAddr = row.wallet_address;

                        // Calculate team volume from DB
                        const teamVolumeStr = await getTeamVolume(userAddr);
                        const teamVolume = parseFloat(teamVolumeStr);

                        if (teamVolume <= 0) continue;

                        // Get largest leg
                        const { largestLeg: largestLegStr } = await getLargestLeg(userAddr);
                        const largestLeg = parseFloat(largestLegStr);

                        // Apply 50% max leg rule
                        const maxLeg = teamVolume / 2;
                        let adjustedVolume: number;
                        if (largestLeg > maxLeg) {
                            adjustedVolume = teamVolume - largestLeg + maxLeg;
                        } else {
                            adjustedVolume = teamVolume;
                        }

                        // Determine rank level based on thresholds (highest qualifying)
                        let rankLevel = 0;
                        let rankSalary = 0;
                        for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
                            if (adjustedVolume >= RANK_THRESHOLDS[i]) {
                                rankLevel = i + 1;
                                rankSalary = RANK_SALARIES[i];
                                break;
                            }
                        }

                        // Update rank in DB
                        await query(
                            `UPDATE users SET rank_level = $1, team_volume = $2, updated_at = NOW()
                             WHERE wallet_address = $3`,
                            [rankLevel, teamVolumeStr, userAddr]
                        );

                        // If user qualifies for rank salary, update on-chain
                        if (rankSalary > 0) {
                            try {
                                const salaryWei = BigInt(rankSalary) * BigInt(10) ** BigInt(18);
                                const tx = await affiliateDistributor.updateRankDividend(
                                    userAddr,
                                    salaryWei
                                );
                                await tx.wait();
                                updatedCount++;
                                console.log(`[RankWorker] Updated rank for ${userAddr}: level=${rankLevel}, salary=${rankSalary}`);
                            } catch (err: any) {
                                console.error(`[RankWorker] On-chain rank update failed for ${userAddr}:`, err.message || err);
                            }
                        }
                    } catch (err: any) {
                        console.error(`[RankWorker] Error processing user ${row.wallet_address}:`, err.message || err);
                    }
                }

                console.log(`[RankWorker] Rank update complete: ${updatedCount} users updated on-chain`);
            } catch (err) {
                console.error('[RankWorker] Error in rank calculation:', err);
                throw err;
            }
        },
        {
            connection: getRedisConnection(),
            concurrency: 1,
        }
    );
}

// ============ Qualifier Weekly Worker ============

function createQualifierWeeklyWorker(): Worker {
    return new Worker(
        'qualifier-weekly',
        async (job: Job) => {
            console.log('[QualifierWeekly] Starting weekly qualifier distribution...');

            try {
                // Calculate global weekly profits (sum of TEAM income in the last 7 days)
                const profitResult = await query(
                    `SELECT COALESCE(SUM(amount_usd), 0) AS total_profits
                     FROM income_ledger
                     WHERE income_type IN ('TEAM', 'DIRECT', 'STAKING_HARVEST')
                       AND created_at >= NOW() - INTERVAL '7 days'`
                );

                const totalProfits = parseFloat(profitResult.rows[0]?.total_profits || '0');
                const qualifierPool = totalProfits * 0.03; // 3% of global weekly profits

                if (qualifierPool <= 0) {
                    console.log('[QualifierWeekly] No profits for weekly qualifier distribution');
                    return;
                }

                console.log(`[QualifierWeekly] Qualifier pool: $${qualifierPool.toFixed(2)} (3% of $${totalProfits.toFixed(2)})`);

                // Get qualifying users: rank level >= 5 (Ambassador rank)
                const qualifyingResult = await query(
                    `SELECT wallet_address, rank_level
                     FROM users
                     WHERE rank_level >= 5
                     ORDER BY rank_level DESC`
                );

                if (qualifyingResult.rows.length === 0) {
                    console.log('[QualifierWeekly] No qualifying users');
                    return;
                }

                // Equal distribution among qualifying users
                const sharePerUser = qualifierPool / qualifyingResult.rows.length;

                const users: string[] = [];
                const amounts: bigint[] = [];

                for (const row of qualifyingResult.rows) {
                    users.push(row.wallet_address);
                    amounts.push(BigInt(Math.floor(sharePerUser * 1e18)));
                }

                // Batch update on-chain
                try {
                    const affiliateDistributor = getAffiliateDistributor(true);
                    if (!affiliateDistributor) {
                        console.warn('[QualifierWeekly] Contracts not configured, skipping');
                        return;
                    }
                    const tx = await affiliateDistributor.updateQualifierWeekly(users, amounts);
                    await tx.wait();
                    console.log(`[QualifierWeekly] Distributed to ${users.length} users, $${sharePerUser.toFixed(2)} each`);
                } catch (err: any) {
                    console.error('[QualifierWeekly] On-chain update failed:', err.message || err);
                    throw err;
                }
            } catch (err) {
                console.error('[QualifierWeekly] Error in weekly qualifier:', err);
                throw err;
            }
        },
        {
            connection: getRedisConnection(),
            concurrency: 1,
        }
    );
}

// ============ Qualifier Monthly Worker ============

function createQualifierMonthlyWorker(): Worker {
    return new Worker(
        'qualifier-monthly',
        async (job: Job) => {
            console.log('[QualifierMonthly] Starting monthly qualifier distribution...');

            try {
                // Calculate global monthly profits
                const profitResult = await query(
                    `SELECT COALESCE(SUM(amount_usd), 0) AS total_profits
                     FROM income_ledger
                     WHERE income_type IN ('TEAM', 'DIRECT', 'STAKING_HARVEST')
                       AND created_at >= NOW() - INTERVAL '30 days'`
                );

                const totalProfits = parseFloat(profitResult.rows[0]?.total_profits || '0');
                const qualifierPool = totalProfits * 0.02; // 2% of global monthly profits

                if (qualifierPool <= 0) {
                    console.log('[QualifierMonthly] No profits for monthly qualifier distribution');
                    return;
                }

                console.log(`[QualifierMonthly] Qualifier pool: $${qualifierPool.toFixed(2)} (2% of $${totalProfits.toFixed(2)})`);

                // Get qualifying users: rank level >= 7 (Senior Ambassador)
                const qualifyingResult = await query(
                    `SELECT wallet_address, rank_level
                     FROM users
                     WHERE rank_level >= 7
                     ORDER BY rank_level DESC`
                );

                if (qualifyingResult.rows.length === 0) {
                    console.log('[QualifierMonthly] No qualifying users');
                    return;
                }

                // Equal distribution among qualifying users
                const sharePerUser = qualifierPool / qualifyingResult.rows.length;

                const users: string[] = [];
                const amounts: bigint[] = [];

                for (const row of qualifyingResult.rows) {
                    users.push(row.wallet_address);
                    amounts.push(BigInt(Math.floor(sharePerUser * 1e18)));
                }

                // Batch update on-chain
                try {
                    const affiliateDistributor = getAffiliateDistributor(true);
                    if (!affiliateDistributor) {
                        console.warn('[QualifierMonthly] Contracts not configured, skipping');
                        return;
                    }
                    const tx = await affiliateDistributor.updateQualifierMonthly(users, amounts);
                    await tx.wait();
                    console.log(`[QualifierMonthly] Distributed to ${users.length} users, $${sharePerUser.toFixed(2)} each`);
                } catch (err: any) {
                    console.error('[QualifierMonthly] On-chain update failed:', err.message || err);
                    throw err;
                }
            } catch (err) {
                console.error('[QualifierMonthly] Error in monthly qualifier:', err);
                throw err;
            }
        },
        {
            connection: getRedisConnection(),
            concurrency: 1,
        }
    );
}

// ============ Worker Lifecycle ============

let workers: Worker[] = [];

/**
 * Start all BullMQ workers
 */
export async function startWorkers(): Promise<void> {
    console.log('Starting BullMQ workers...');

    const compoundWorker = createCompoundWorker();
    const rankUpdateWorker = createRankUpdateWorker();
    const qualifierWeeklyWorker = createQualifierWeeklyWorker();
    const qualifierMonthlyWorker = createQualifierMonthlyWorker();

    workers = [compoundWorker, rankUpdateWorker, qualifierWeeklyWorker, qualifierMonthlyWorker];

    // Set up error handlers
    for (const worker of workers) {
        worker.on('failed', (job, err) => {
            console.error(`[Worker:${worker.name}] Job ${job?.id} failed:`, err.message);
        });

        worker.on('completed', (job) => {
            console.log(`[Worker:${worker.name}] Job ${job.id} completed`);
        });

        worker.on('error', (err) => {
            console.error(`[Worker:${worker.name}] Worker error:`, err);
        });
    }

    console.log('BullMQ workers started: compounding, rank-update, qualifier-weekly, qualifier-monthly');
}

/**
 * Gracefully close all workers
 */
export async function stopWorkers(): Promise<void> {
    console.log('Stopping BullMQ workers...');
    await Promise.all(workers.map((w) => w.close()));
    if (redisConnection) {
        redisConnection.disconnect();
    }
    console.log('BullMQ workers stopped.');
}
