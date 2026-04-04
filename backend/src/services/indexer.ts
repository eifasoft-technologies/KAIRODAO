import { ethers } from 'ethers';
import { query, getClient } from '../db/connection';
import { getWsContracts, getCurrentBlock, getHttpProvider } from './blockchain';
import { broadcastCompoundEvent, broadcastOrderBookUpdate } from './websocket';
import { buildReferralTree } from '../utils/referral-tree';

const BATCH_SIZE = 1000;
const INCOME_TYPES: Record<number, string> = {
    0: 'DIRECT',
    1: 'TEAM',
    2: 'RANK',
    3: 'QUALIFIER_WEEKLY',
    4: 'QUALIFIER_MONTHLY',
};

// ============ Block Tracking ============

async function getLastIndexedBlock(contractName: string): Promise<number> {
    const result = await query(
        'SELECT last_block FROM indexer_state WHERE contract_name = $1',
        [contractName]
    );
    return result.rows.length > 0 ? Number(result.rows[0].last_block) : 0;
}

async function setLastIndexedBlock(contractName: string, block: number): Promise<void> {
    await query(
        `INSERT INTO indexer_state (contract_name, last_block, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (contract_name) DO UPDATE SET last_block = $2, updated_at = NOW()`,
        [contractName, block]
    );
}

function formatUnits(val: bigint): string {
    return ethers.formatUnits(val, 18);
}

function toLower(addr: string): string {
    return addr.toLowerCase();
}

// ============ Upsert user helper ============

async function upsertUser(client: ReturnType<Awaited<ReturnType<typeof getClient>>['query']> extends any ? any : never, address: string): Promise<void> {
    await client.query(
        `INSERT INTO users (wallet_address, created_at, updated_at)
         VALUES ($1, NOW(), NOW())
         ON CONFLICT (wallet_address) DO NOTHING`,
        [toLower(address)]
    );
}

// Helper that works with the pool directly (no transaction needed)
async function upsertUserDirect(address: string): Promise<void> {
    await query(
        `INSERT INTO users (wallet_address, created_at, updated_at)
         VALUES ($1, NOW(), NOW())
         ON CONFLICT (wallet_address) DO NOTHING`,
        [toLower(address)]
    );
}

// ============ StakingManager Event Handlers ============

async function handleStakeCreated(
    user: string, stakeId: bigint, amount: bigint, tier: number,
    txHash: string, blockNumber: number
): Promise<void> {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const addr = toLower(user);

        // Upsert user
        await client.query(
            `INSERT INTO users (wallet_address, created_at, updated_at)
             VALUES ($1, NOW(), NOW())
             ON CONFLICT (wallet_address) DO NOTHING`,
            [addr]
        );

        // Insert stake
        await client.query(
            `INSERT INTO stakes (user_address, stake_id_on_chain, amount, original_amount, tier,
                start_time, last_compound, total_earned, harvested_rewards, is_active, cap_reached, tx_hash, created_at, updated_at)
             VALUES ($1, $2, $3, $3, $4, NOW(), NOW(), 0, 0, TRUE, FALSE, $5, NOW(), NOW())`,
            [addr, Number(stakeId), formatUnits(amount), Number(tier), txHash]
        );

        // Update user total_staked_volume
        await client.query(
            `UPDATE users SET total_staked_volume = total_staked_volume + $1, updated_at = NOW()
             WHERE wallet_address = $2`,
            [formatUnits(amount), addr]
        );

        await client.query('COMMIT');
        console.log(`[StakingManager] StakeCreated indexed: user=${addr}, stakeId=${stakeId}, amount=${formatUnits(amount)}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[StakingManager] Error handling StakeCreated:', err);
    } finally {
        client.release();
    }
    await setLastIndexedBlock('StakingManager', blockNumber);
}

async function handleCompounded(
    user: string, stakeId: bigint, profit: bigint, newAmount: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const addr = toLower(user);
    try {
        await query(
            `UPDATE stakes SET
                amount = $1,
                total_earned = total_earned + $2,
                last_compound = NOW(),
                updated_at = NOW()
             WHERE user_address = $3 AND stake_id_on_chain = $4 AND is_active = TRUE`,
            [formatUnits(newAmount), formatUnits(profit), addr, Number(stakeId)]
        );

        broadcastCompoundEvent({
            user: addr,
            stakeId: stakeId.toString(),
            profit: profit.toString(),
            newAmount: newAmount.toString(),
        });

        console.log(`[StakingManager] Compounded indexed: user=${addr}, stakeId=${stakeId}, profit=${formatUnits(profit)}`);
    } catch (err) {
        console.error('[StakingManager] Error handling Compounded:', err);
    }
    await setLastIndexedBlock('StakingManager', blockNumber);
}

async function handleUnstaked(
    user: string, stakeId: bigint, returnAmount: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const client = await getClient();
    const addr = toLower(user);
    try {
        await client.query('BEGIN');

        // Get current stake amount before deactivating
        const stakeRes = await client.query(
            'SELECT amount FROM stakes WHERE user_address = $1 AND stake_id_on_chain = $2 AND is_active = TRUE',
            [addr, Number(stakeId)]
        );
        const stakeAmount = stakeRes.rows.length > 0 ? stakeRes.rows[0].amount : '0';

        // Mark stake inactive
        await client.query(
            `UPDATE stakes SET is_active = FALSE, updated_at = NOW()
             WHERE user_address = $1 AND stake_id_on_chain = $2`,
            [addr, Number(stakeId)]
        );

        // Update user total_staked_volume
        await client.query(
            `UPDATE users SET total_staked_volume = GREATEST(total_staked_volume - $1, 0), updated_at = NOW()
             WHERE wallet_address = $2`,
            [stakeAmount, addr]
        );

        await client.query('COMMIT');
        console.log(`[StakingManager] Unstaked indexed: user=${addr}, stakeId=${stakeId}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[StakingManager] Error handling Unstaked:', err);
    } finally {
        client.release();
    }
    await setLastIndexedBlock('StakingManager', blockNumber);
}

async function handleCapReached(
    user: string, stakeId: bigint, totalEarned: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const client = await getClient();
    const addr = toLower(user);
    try {
        await client.query('BEGIN');

        const stakeRes = await client.query(
            'SELECT amount FROM stakes WHERE user_address = $1 AND stake_id_on_chain = $2 AND is_active = TRUE',
            [addr, Number(stakeId)]
        );
        const stakeAmount = stakeRes.rows.length > 0 ? stakeRes.rows[0].amount : '0';

        await client.query(
            `UPDATE stakes SET is_active = FALSE, cap_reached = TRUE, total_earned = $1, updated_at = NOW()
             WHERE user_address = $2 AND stake_id_on_chain = $3`,
            [formatUnits(totalEarned), addr, Number(stakeId)]
        );

        await client.query(
            `UPDATE users SET total_staked_volume = GREATEST(total_staked_volume - $1, 0), updated_at = NOW()
             WHERE wallet_address = $2`,
            [stakeAmount, addr]
        );

        await client.query('COMMIT');
        console.log(`[StakingManager] CapReached indexed: user=${addr}, stakeId=${stakeId}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[StakingManager] Error handling CapReached:', err);
    } finally {
        client.release();
    }
    await setLastIndexedBlock('StakingManager', blockNumber);
}

async function handleStakingHarvested(
    user: string, stakeId: bigint, amount: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const client = await getClient();
    const addr = toLower(user);
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE stakes SET harvested_rewards = harvested_rewards + $1, updated_at = NOW()
             WHERE user_address = $2 AND stake_id_on_chain = $3`,
            [formatUnits(amount), addr, Number(stakeId)]
        );

        await client.query(
            `INSERT INTO income_ledger (user_address, income_type, amount_usd, tx_hash, created_at)
             VALUES ($1, 'STAKING_HARVEST', $2, $3, NOW())`,
            [addr, formatUnits(amount), txHash]
        );

        await client.query('COMMIT');
        console.log(`[StakingManager] Harvested indexed: user=${addr}, stakeId=${stakeId}, amount=${formatUnits(amount)}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[StakingManager] Error handling Harvested:', err);
    } finally {
        client.release();
    }
    await setLastIndexedBlock('StakingManager', blockNumber);
}

// ============ AffiliateDistributor Event Handlers ============

async function handleReferrerSet(
    user: string, referrer: string,
    txHash: string, blockNumber: number
): Promise<void> {
    const client = await getClient();
    const userAddr = toLower(user);
    const refAddr = toLower(referrer);
    try {
        await client.query('BEGIN');

        // Upsert both users
        await client.query(
            `INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
            [userAddr]
        );
        await client.query(
            `INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
            [refAddr]
        );

        // Update user's referrer
        await client.query(
            `UPDATE users SET referrer = $1, updated_at = NOW() WHERE wallet_address = $2`,
            [refAddr, userAddr]
        );

        // Build referral tree (ancestor-descendant pairs)
        await buildReferralTree(client, userAddr, refAddr);

        await client.query('COMMIT');
        console.log(`[Affiliate] ReferrerSet indexed: user=${userAddr}, referrer=${refAddr}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Affiliate] Error handling ReferrerSet:', err);
    } finally {
        client.release();
    }
    await setLastIndexedBlock('AffiliateDistributor', blockNumber);
}

async function handleDirectEarned(
    referrer: string, amount: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const addr = toLower(referrer);
    try {
        await upsertUserDirect(addr);
        await query(
            `INSERT INTO income_ledger (user_address, income_type, amount_usd, tx_hash, created_at)
             VALUES ($1, 'DIRECT', $2, $3, NOW())`,
            [addr, formatUnits(amount), txHash]
        );
        console.log(`[Affiliate] DirectEarned indexed: referrer=${addr}, amount=${formatUnits(amount)}`);
    } catch (err) {
        console.error('[Affiliate] Error handling DirectEarned:', err);
    }
    await setLastIndexedBlock('AffiliateDistributor', blockNumber);
}

async function handleTeamEarned(
    upline: string, staker: string, level: bigint, amount: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const addr = toLower(upline);
    try {
        await upsertUserDirect(addr);
        await query(
            `INSERT INTO income_ledger (user_address, income_type, amount_usd, tx_hash, created_at)
             VALUES ($1, 'TEAM', $2, $3, NOW())`,
            [addr, formatUnits(amount), txHash]
        );
        console.log(`[Affiliate] TeamEarned indexed: upline=${addr}, level=${level}, amount=${formatUnits(amount)}`);
    } catch (err) {
        console.error('[Affiliate] Error handling TeamEarned:', err);
    }
    await setLastIndexedBlock('AffiliateDistributor', blockNumber);
}

async function handleAffiliateHarvested(
    user: string, incomeType: number, usdAmount: bigint, kairoAmount: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const addr = toLower(user);
    const typeName = INCOME_TYPES[incomeType] || `AFFILIATE_${incomeType}`;
    try {
        await upsertUserDirect(addr);
        await query(
            `INSERT INTO income_ledger (user_address, income_type, amount_usd, amount_kairo, tx_hash, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [addr, typeName, formatUnits(usdAmount), formatUnits(kairoAmount), txHash]
        );
        console.log(`[Affiliate] Harvested indexed: user=${addr}, type=${typeName}, usd=${formatUnits(usdAmount)}`);
    } catch (err) {
        console.error('[Affiliate] Error handling Harvested:', err);
    }
    await setLastIndexedBlock('AffiliateDistributor', blockNumber);
}

// ============ CMS Event Handlers ============

async function handleSubscriptionPurchased(
    buyer: string, amount: bigint, referrer: string,
    txHash: string, blockNumber: number
): Promise<void> {
    const client = await getClient();
    const buyerAddr = toLower(buyer);
    const refAddr = referrer === ethers.ZeroAddress ? null : toLower(referrer);
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
            [buyerAddr]
        );

        await client.query(
            `INSERT INTO cms_subscriptions (buyer, referrer, amount, tx_hash, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [buyerAddr, refAddr, Number(amount), txHash]
        );

        await client.query('COMMIT');
        console.log(`[CMS] SubscriptionPurchased indexed: buyer=${buyerAddr}, amount=${amount}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[CMS] Error handling SubscriptionPurchased:', err);
    } finally {
        client.release();
    }
    await setLastIndexedBlock('CMS', blockNumber);
}

async function handleRewardsClaimed(
    user: string, userAmount: bigint, systemAmount: bigint, excessDeleted: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const client = await getClient();
    const addr = toLower(user);
    try {
        await client.query('BEGIN');

        // Mark all subscriptions for this user as claimed
        await client.query(
            `UPDATE cms_subscriptions SET claimed = TRUE WHERE buyer = $1`,
            [addr]
        );

        // Record in income ledger
        await client.query(
            `INSERT INTO income_ledger (user_address, income_type, amount_kairo, tx_hash, created_at)
             VALUES ($1, 'CMS_CLAIM', $2, $3, NOW())`,
            [addr, formatUnits(userAmount), txHash]
        );

        await client.query('COMMIT');
        console.log(`[CMS] RewardsClaimed indexed: user=${addr}, userAmount=${formatUnits(userAmount)}, excess=${formatUnits(excessDeleted)}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[CMS] Error handling RewardsClaimed:', err);
    } finally {
        client.release();
    }
    await setLastIndexedBlock('CMS', blockNumber);
}

// ============ P2PEscrow Event Handlers ============

async function handleBuyOrderCreated(
    orderId: bigint, creator: string, usdtAmount: bigint, timestamp: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const addr = toLower(creator);
    try {
        await upsertUserDirect(addr);
        await query(
            `INSERT INTO p2p_orders (order_id_on_chain, order_type, creator, amount, price_per_token, remaining, is_active, tx_hash, created_at, updated_at)
             VALUES ($1, 'BUY', $2, $3, 0, $3, TRUE, $4, to_timestamp($5), NOW())`,
            [Number(orderId), addr, formatUnits(usdtAmount), txHash, Number(timestamp)]
        );
        broadcastOrderBookUpdate({ type: 'new_buy', orderId: orderId.toString(), creator: addr, amount: usdtAmount.toString() });
        console.log(`[P2P] BuyOrderCreated indexed: orderId=${orderId}, creator=${addr}`);
    } catch (err) {
        console.error('[P2P] Error handling BuyOrderCreated:', err);
    }
    await setLastIndexedBlock('P2PEscrow', blockNumber);
}

async function handleSellOrderCreated(
    orderId: bigint, creator: string, kairoAmount: bigint, timestamp: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const addr = toLower(creator);
    try {
        await upsertUserDirect(addr);
        await query(
            `INSERT INTO p2p_orders (order_id_on_chain, order_type, creator, amount, price_per_token, remaining, is_active, tx_hash, created_at, updated_at)
             VALUES ($1, 'SELL', $2, $3, 0, $3, TRUE, $4, to_timestamp($5), NOW())`,
            [Number(orderId), addr, formatUnits(kairoAmount), txHash, Number(timestamp)]
        );
        broadcastOrderBookUpdate({ type: 'new_sell', orderId: orderId.toString(), creator: addr, amount: kairoAmount.toString() });
        console.log(`[P2P] SellOrderCreated indexed: orderId=${orderId}, creator=${addr}`);
    } catch (err) {
        console.error('[P2P] Error handling SellOrderCreated:', err);
    }
    await setLastIndexedBlock('P2PEscrow', blockNumber);
}

async function handleOrderCancelled(
    orderId: bigint, creator: string, isBuyOrder: boolean, refundedAmount: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const orderType = isBuyOrder ? 'BUY' : 'SELL';
    try {
        await query(
            `UPDATE p2p_orders SET is_active = FALSE, remaining = 0, updated_at = NOW()
             WHERE order_id_on_chain = $1 AND order_type = $2`,
            [Number(orderId), orderType]
        );
        broadcastOrderBookUpdate({ type: 'cancelled', orderId: orderId.toString(), isBuyOrder });
        console.log(`[P2P] OrderCancelled indexed: orderId=${orderId}, type=${orderType}`);
    } catch (err) {
        console.error('[P2P] Error handling OrderCancelled:', err);
    }
    await setLastIndexedBlock('P2PEscrow', blockNumber);
}

async function handleTradeExecuted(
    tradeId: bigint, buyOrderId: bigint, sellOrderId: bigint,
    buyer: string, seller: string, kairoAmount: bigint,
    usdtAmount: bigint, price: bigint, kairoFee: bigint, usdtFee: bigint,
    txHash: string, blockNumber: number
): Promise<void> {
    const client = await getClient();
    const buyerAddr = toLower(buyer);
    const sellerAddr = toLower(seller);
    try {
        await client.query('BEGIN');

        // Insert trade record
        await client.query(
            `INSERT INTO p2p_trades (buy_order_id, sell_order_id, buyer, seller, amount, price, tx_hash, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [Number(buyOrderId), Number(sellOrderId), buyerAddr, sellerAddr,
             formatUnits(kairoAmount), formatUnits(price), txHash]
        );

        // Update buy order remaining (decrease by usdtAmount)
        if (Number(buyOrderId) > 0) {
            await client.query(
                `UPDATE p2p_orders SET
                    remaining = GREATEST(remaining - $1, 0),
                    is_active = (GREATEST(remaining - $1, 0) > 0),
                    updated_at = NOW()
                 WHERE order_id_on_chain = $2 AND order_type = 'BUY'`,
                [formatUnits(usdtAmount), Number(buyOrderId)]
            );
        }

        // Update sell order remaining (decrease by kairoAmount)
        if (Number(sellOrderId) > 0) {
            await client.query(
                `UPDATE p2p_orders SET
                    remaining = GREATEST(remaining - $1, 0),
                    is_active = (GREATEST(remaining - $1, 0) > 0),
                    updated_at = NOW()
                 WHERE order_id_on_chain = $2 AND order_type = 'SELL'`,
                [formatUnits(kairoAmount), Number(sellOrderId)]
            );
        }

        await client.query('COMMIT');

        broadcastOrderBookUpdate({
            type: 'trade',
            tradeId: tradeId.toString(),
            buyer: buyerAddr,
            seller: sellerAddr,
            kairoAmount: kairoAmount.toString(),
            usdtAmount: usdtAmount.toString(),
            price: price.toString(),
        });

        console.log(`[P2P] TradeExecuted indexed: tradeId=${tradeId}, buyer=${buyerAddr}, seller=${sellerAddr}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[P2P] Error handling TradeExecuted:', err);
    } finally {
        client.release();
    }
    await setLastIndexedBlock('P2PEscrow', blockNumber);
}

// ============ Historical Event Processing ============

async function processHistoricalEvents(
    contract: ethers.Contract,
    contractName: string,
    fromBlock: number,
    toBlock: number,
    handlers: Record<string, (...args: any[]) => Promise<void>>
): Promise<void> {
    console.log(`[${contractName}] Processing historical events from block ${fromBlock} to ${toBlock}...`);

    for (let start = fromBlock; start <= toBlock; start += BATCH_SIZE) {
        const end = Math.min(start + BATCH_SIZE - 1, toBlock);

        for (const [eventName, handler] of Object.entries(handlers)) {
            try {
                const filter = contract.filters[eventName]();
                const events = await contract.queryFilter(filter, start, end);

                for (const event of events) {
                    const log = event as ethers.EventLog;
                    if (log.args) {
                        const txHash = log.transactionHash;
                        const blockNum = log.blockNumber;
                        await handler(...log.args, txHash, blockNum);
                    }
                }
            } catch (err) {
                console.error(`[${contractName}] Error processing ${eventName} in blocks ${start}-${end}:`, err);
            }
        }

        console.log(`[${contractName}] Processed blocks ${start}-${end}`);
    }
}

// ============ Real-time Listener Setup ============

function setupRealtimeListeners(contracts: NonNullable<ReturnType<typeof getWsContracts>>): void {
    // StakingManager
    contracts.stakingManager.on('StakeCreated', async (user: string, stakeId: bigint, amount: bigint, tier: number, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleStakeCreated(user, stakeId, amount, tier, txHash, blockNumber);
    });

    contracts.stakingManager.on('Compounded', async (user: string, stakeId: bigint, profit: bigint, newAmount: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleCompounded(user, stakeId, profit, newAmount, txHash, blockNumber);
    });

    contracts.stakingManager.on('Unstaked', async (user: string, stakeId: bigint, returnAmount: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleUnstaked(user, stakeId, returnAmount, txHash, blockNumber);
    });

    contracts.stakingManager.on('CapReached', async (user: string, stakeId: bigint, totalEarned: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleCapReached(user, stakeId, totalEarned, txHash, blockNumber);
    });

    contracts.stakingManager.on('Harvested', async (user: string, stakeId: bigint, amount: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleStakingHarvested(user, stakeId, amount, txHash, blockNumber);
    });

    // AffiliateDistributor
    contracts.affiliateDistributor.on('ReferrerSet', async (user: string, referrer: string, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleReferrerSet(user, referrer, txHash, blockNumber);
    });

    contracts.affiliateDistributor.on('DirectEarned', async (referrer: string, amount: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleDirectEarned(referrer, amount, txHash, blockNumber);
    });

    contracts.affiliateDistributor.on('TeamEarned', async (upline: string, staker: string, level: bigint, amount: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleTeamEarned(upline, staker, level, amount, txHash, blockNumber);
    });

    contracts.affiliateDistributor.on('Harvested', async (user: string, incomeType: number, usdAmount: bigint, kairoAmount: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleAffiliateHarvested(user, incomeType, usdAmount, kairoAmount, txHash, blockNumber);
    });

    // CMS
    contracts.cms.on('SubscriptionPurchased', async (buyer: string, amount: bigint, referrer: string, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleSubscriptionPurchased(buyer, amount, referrer, txHash, blockNumber);
    });

    contracts.cms.on('RewardsClaimed', async (user: string, userAmount: bigint, systemAmount: bigint, excessDeleted: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleRewardsClaimed(user, userAmount, systemAmount, excessDeleted, txHash, blockNumber);
    });

    // P2PEscrow
    contracts.p2pEscrow.on('BuyOrderCreated', async (orderId: bigint, creator: string, usdtAmount: bigint, timestamp: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleBuyOrderCreated(orderId, creator, usdtAmount, timestamp, txHash, blockNumber);
    });

    contracts.p2pEscrow.on('SellOrderCreated', async (orderId: bigint, creator: string, kairoAmount: bigint, timestamp: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleSellOrderCreated(orderId, creator, kairoAmount, timestamp, txHash, blockNumber);
    });

    contracts.p2pEscrow.on('OrderCancelled', async (orderId: bigint, creator: string, isBuyOrder: boolean, refundedAmount: bigint, event: any) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleOrderCancelled(orderId, creator, isBuyOrder, refundedAmount, txHash, blockNumber);
    });

    contracts.p2pEscrow.on('TradeExecuted', async (
        tradeId: bigint, buyOrderId: bigint, sellOrderId: bigint,
        buyer: string, seller: string, kairoAmount: bigint,
        usdtAmount: bigint, price: bigint, kairoFee: bigint, usdtFee: bigint,
        event: any
    ) => {
        const txHash = event.log?.transactionHash || '';
        const blockNumber = event.log?.blockNumber || 0;
        await handleTradeExecuted(tradeId, buyOrderId, sellOrderId, buyer, seller,
            kairoAmount, usdtAmount, price, kairoFee, usdtFee, txHash, blockNumber);
    });
}

// ============ Main Indexer Entry Point ============

export async function startIndexer(): Promise<void> {
    console.log('Starting KAIRO event indexer...');

    const contracts = getWsContracts();
    if (!contracts) {
        console.warn('[Indexer] Contract addresses not configured. Indexer disabled - will start when contracts are deployed.');
        return;
    }

    const currentBlock = await getCurrentBlock();
    const provider = getHttpProvider();

    // Create read-only contract instances connected to HTTP provider for historical queries
    const httpContracts = {
        stakingManager: contracts.stakingManager.connect(provider) as ethers.Contract,
        affiliateDistributor: contracts.affiliateDistributor.connect(provider) as ethers.Contract,
        cms: contracts.cms.connect(provider) as ethers.Contract,
        p2pEscrow: contracts.p2pEscrow.connect(provider) as ethers.Contract,
    };

    // Process historical events for each contract
    const contractConfigs = [
        {
            name: 'StakingManager',
            contract: httpContracts.stakingManager,
            handlers: {
                StakeCreated: handleStakeCreated,
                Compounded: handleCompounded,
                Unstaked: handleUnstaked,
                CapReached: handleCapReached,
                Harvested: handleStakingHarvested,
            },
        },
        {
            name: 'AffiliateDistributor',
            contract: httpContracts.affiliateDistributor,
            handlers: {
                ReferrerSet: handleReferrerSet,
                DirectEarned: handleDirectEarned,
                TeamEarned: handleTeamEarned,
                Harvested: handleAffiliateHarvested,
            },
        },
        {
            name: 'CMS',
            contract: httpContracts.cms,
            handlers: {
                SubscriptionPurchased: handleSubscriptionPurchased,
                RewardsClaimed: handleRewardsClaimed,
            },
        },
        {
            name: 'P2PEscrow',
            contract: httpContracts.p2pEscrow,
            handlers: {
                BuyOrderCreated: handleBuyOrderCreated,
                SellOrderCreated: handleSellOrderCreated,
                OrderCancelled: handleOrderCancelled,
                TradeExecuted: handleTradeExecuted,
            },
        },
    ];

    // Catch up on historical events
    for (const cfg of contractConfigs) {
        const lastBlock = await getLastIndexedBlock(cfg.name);
        const startBlock = lastBlock > 0 ? lastBlock + 1 : Math.max(currentBlock - 10000, 0);

        if (startBlock <= currentBlock) {
            await processHistoricalEvents(cfg.contract, cfg.name, startBlock, currentBlock, cfg.handlers as any);
        }
        console.log(`  ${cfg.name}: caught up to block ${currentBlock}`);
    }

    // Switch to real-time event listening
    console.log('Historical catch-up complete. Switching to real-time event listening...');
    setupRealtimeListeners(contracts);

    console.log('KAIRO event indexer started. Listening for events...');
}

