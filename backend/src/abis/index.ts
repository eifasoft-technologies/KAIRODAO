/**
 * Contract ABIs for the KAIRO DeFi Ecosystem
 * Contains event signatures and key function ABIs for each contract.
 */

// ============ StakingManager ABI ============
export const StakingManagerABI = [
    // Events
    "event StakeCreated(address indexed user, uint256 stakeId, uint256 amount, uint8 tier)",
    "event Compounded(address indexed user, uint256 stakeId, uint256 profit, uint256 newAmount)",
    "event Unstaked(address indexed user, uint256 stakeId, uint256 returnAmount)",
    "event CapReached(address indexed user, uint256 stakeId, uint256 totalEarned)",
    "event Harvested(address indexed user, uint256 stakeId, uint256 amount)",
    "event AffiliateDistributorSet(address indexed distributor)",
    "event SystemWalletSet(address indexed wallet)",
    // Key functions
    "function stake(uint256 _usdtAmount, address _referrer) external",
    "function compound(uint256 _stakeId) external",
    "function compoundFor(address _user, uint256 _stakeId) external",
    "function unstake(uint256 _stakeId) external",
    "function harvest(uint256 _stakeId, uint256 _amount) external",
    "function getUserStakes(address _user) external view returns (tuple(uint256 amount, uint256 originalAmount, uint256 startTime, uint256 lastCompoundTime, uint256 harvestedRewards, uint256 totalEarned, bool active, uint8 tier)[])",
    "function getStake(address _user, uint256 _stakeId) external view returns (tuple(uint256 amount, uint256 originalAmount, uint256 startTime, uint256 lastCompoundTime, uint256 harvestedRewards, uint256 totalEarned, bool active, uint8 tier))",
    "function getTotalActiveStakeValue(address _user) external view returns (uint256)",
    "function getCapProgress(address _user, uint256 _stakeId) external view returns (uint256 earned, uint256 cap)",
    "function getUserStakeCount(address _user) external view returns (uint256)",
    "function totalActiveStakeValue(address) external view returns (uint256)",
    "function tiers(uint256) external view returns (uint256 min, uint256 max, uint256 compoundInterval, uint256 dailyClosings)",
];

// ============ AffiliateDistributor ABI ============
export const AffiliateDistributorABI = [
    // Events
    "event ReferrerSet(address indexed user, address indexed referrer)",
    "event DirectEarned(address indexed referrer, uint256 amount)",
    "event TeamEarned(address indexed upline, address indexed staker, uint256 level, uint256 amount)",
    "event RankUpdated(address indexed user, uint256 amount)",
    "event Harvested(address indexed user, uint8 incomeType, uint256 usdAmount, uint256 kairoAmount)",
    // Key functions
    "function setReferrer(address _user, address _referrer) external",
    "function distributeDirect(address _referrer, uint256 _stakeAmount) external",
    "function distributeTeamDividend(address _staker, uint256 _profit) external",
    "function updateRankDividend(address _user, uint256 _amount) external",
    "function updateQualifierWeekly(address[] calldata _users, uint256[] calldata _amounts) external",
    "function updateQualifierMonthly(address[] calldata _users, uint256[] calldata _amounts) external",
    "function harvest(uint8 _incomeType) external",
    "function calculateRankSalary(address _user) external view returns (uint256)",
    "function getAllIncome(address _user) external view returns (uint256 direct, uint256 team, uint256 rank, uint256 qWeekly, uint256 qMonthly)",
    "function getTotalHarvestable(address _user) external view returns (uint256)",
    "function referrerOf(address) external view returns (address)",
    "function getDirectReferrals(address _user) external view returns (address[])",
    "function getUpline(address _user, uint256 _levels) external view returns (address[])",
    "function getTeamVolume(address _user) external view returns (uint256)",
    "function directDividends(address) external view returns (uint256)",
    "function teamDividends(address) external view returns (uint256)",
    "function rankDividends(address) external view returns (uint256)",
    "function qualifierWeekly(address) external view returns (uint256)",
    "function qualifierMonthly(address) external view returns (uint256)",
    "function teamVolume(address) external view returns (uint256)",
];

// ============ CoreMembershipSubscription ABI ============
export const CoreMembershipSubscriptionABI = [
    // Events
    "event SubscriptionPurchased(address indexed buyer, uint256 amount, address indexed referrer)",
    "event RewardsClaimed(address indexed user, uint256 userAmount, uint256 systemAmount, uint256 excessDeleted)",
    "event DeadlineExtended(uint256 oldDeadline, uint256 newDeadline)",
    // Key functions
    "function subscribe(uint256 _amount, address _referrer) external",
    "function claimCMSRewards() external",
    "function getClaimableRewards(address _user) external view returns (uint256 loyalty, uint256 leadership, uint256 total)",
    "function getMaxClaimable(address _user) external view returns (uint256)",
    "function getExcessToBeDeleted(address _user) external view returns (uint256)",
    "function getSubscriptionCount(address _user) external view returns (uint256)",
    "function getRemainingSubscriptions() external view returns (uint256)",
    "function isDeadlinePassed() external view returns (bool)",
    "function canClaim(address _user) external view returns (bool eligible, string reason)",
    "function totalSubscriptions() external view returns (uint256)",
    "function deadline() external view returns (uint256)",
    "function subscriptionCount(address) external view returns (uint256)",
    "function loyaltyRewards(address) external view returns (uint256)",
    "function leadershipRewards(address) external view returns (uint256)",
    "function hasClaimed(address) external view returns (bool)",
];

// ============ AtomicP2p ABI ============
export const AtomicP2pABI = [
    // Events
    "event BuyOrderCreated(uint256 indexed orderId, address indexed creator, uint256 usdtAmount, uint256 timestamp)",
    "event SellOrderCreated(uint256 indexed orderId, address indexed creator, uint256 kairoAmount, uint256 timestamp)",
    "event OrderCancelled(uint256 indexed orderId, address indexed creator, bool isBuyOrder, uint256 refundedAmount)",
    "event TradeExecuted(uint256 indexed tradeId, uint256 indexed buyOrderId, uint256 indexed sellOrderId, address buyer, address seller, uint256 kairoAmount, uint256 usdtAmount, uint256 price, uint256 kairoFee, uint256 usdtFee)",
    "event USDTFeeDistributed(uint256 indexed tradeId, uint256 feeAmount)",
    "event KAIROFeeBurned(uint256 indexed tradeId, uint256 feeAmount)",
    "event PartialFillExecuted(uint256 indexed orderId, bool isBuyOrder, uint256 filledAmount, uint256 remainingAmount)",
    // Key functions
    "function createBuyOrder(uint256 usdtAmount) external returns (uint256)",
    "function createSellOrder(uint256 kairoAmount) external returns (uint256)",
    "function cancelBuyOrder(uint256 orderId) external",
    "function cancelSellOrder(uint256 orderId) external",
    "function sellToOrder(uint256 buyOrderId, uint256 kairoAmount) external returns (uint256)",
    "function buyFromOrder(uint256 sellOrderId, uint256 kairoAmount) external returns (uint256)",
    "function executeTrade(uint256 buyOrderId, uint256 sellOrderId, uint256 kairoFillAmount) external returns (uint256)",
    "function getBuyOrder(uint256 orderId) external view returns (tuple(address creator, uint256 usdtAmount, uint256 usdtRemaining, bool active, uint256 createdAt))",
    "function getSellOrder(uint256 orderId) external view returns (tuple(address creator, uint256 kairoAmount, uint256 kairoRemaining, bool active, uint256 createdAt))",
    "function getTrade(uint256 tradeId) external view returns (tuple(uint256 buyOrderId, uint256 sellOrderId, address buyer, address seller, uint256 kairoAmount, uint256 usdtAmount, uint256 price, uint256 kairoFee, uint256 usdtFee, uint256 executedAt))",
    "function getCurrentPrice() external view returns (uint256)",
    "function getActiveBuyOrders(uint256 offset, uint256 limit) external view returns (tuple(address creator, uint256 usdtAmount, uint256 usdtRemaining, bool active, uint256 createdAt)[])",
    "function getActiveSellOrders(uint256 offset, uint256 limit) external view returns (tuple(address creator, uint256 kairoAmount, uint256 kairoRemaining, bool active, uint256 createdAt)[])",
    "function getOrderBookStats() external view returns (uint256 totalBuyOrders, uint256 totalSellOrders, uint256 totalTrades, uint256 activeBuyOrders, uint256 activeSellOrders)",
    "function getTotalLiquidity() external view returns (uint256 totalBuyLiquidity, uint256 totalSellLiquidity)",
    "function nextBuyOrderId() external view returns (uint256)",
    "function nextSellOrderId() external view returns (uint256)",
    "function nextTradeId() external view returns (uint256)",
];

// ============ KAIROToken ABI (minimal for backend reads) ============
export const KAIROTokenABI = [
    "function totalSupply() external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function getTotalBurned() external view returns (uint256)",
    "function getSocialLockAmount() external view returns (uint256)",
    "function getEffectiveSupply() external view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// ============ LiquidityPool ABI (minimal for price reads) ============
export const LiquidityPoolABI = [
    "function getLivePrice() external view returns (uint256)",
    "function getCurrentPrice() external view returns (uint256)",
    "function getBalances() external view returns (uint256 usdtBalance, uint256 kairoBalance)",
];
