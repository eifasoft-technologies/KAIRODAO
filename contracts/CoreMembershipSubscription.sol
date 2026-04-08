// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IKAIROToken - Interface for KAIRO token minting
 */
interface IKAIROToken {
    function mint(address to, uint256 amount) external;
    function mintTo(address recipient, uint256 usdAmount) external;
}

/**
 * @title ILiquidityPool - Interface for LiquidityPool price oracle
 */
interface ILiquidityPool {
    function getLivePrice() external view returns (uint256);
}

/**
 * @title IStakingManager - Interface for StakingManager active stake queries
 */
interface IStakingManager {
    function getTotalActiveStakeValue(address _user) external view returns (uint256);
    function addEarnings(address _user, uint256 _usdAmount) external;
    function getRemainingCap(address _user) external view returns (uint256);
}

/**
 * @title IAffiliateDistributor - Interface for referrer tracking
 */
interface IAffiliateDistributor {
    function setReferrer(address _user, address _referrer) external;
    function referrerOf(address _user) external view returns (address);
    function directCount(address _user) external view returns (uint256);
}

/**
 * @title CoreMembershipSubscription - CMS Subscription System for KAIRO DeFi Ecosystem
 * @dev Allows users to purchase CMS subscriptions with USDT, earn loyalty rewards (KAIRO),
 *      and distribute referral rewards up to 5 levels. Rewards are claimable once,
 *      capped by active stake value ("use it or lose it" mechanic).
 *
 * Features:
 * - 10 USDT per subscription, max 10,000 total subscriptions
 * - 5 KAIRO loyalty reward per subscription
 * - 5-level referral rewards in KAIRO (level-gated by direct referral count)
 * - Leadership rewards require active CMS subscription
 * - One-time claim with stake-based cap (excess is permanently deleted)
 * - 90/10 split on claim (user/system)
 * - Deadline enforcement (configurable by admin)
 */
contract CoreMembershipSubscription is ReentrancyGuard, Pausable, AccessControl {
    // ============ Constants ============
    uint256 public constant CMS_PRICE = 10 * 10 ** 18;       // 10 USDT per subscription
    uint256 public constant REWARD_PER_SUB = 5 * 10 ** 18;   // 5 KAIRO per subscription
    uint256 public constant MAX_SUBS = 10000;                 // Maximum total subscriptions

    // Referral rewards per subscription (KAIRO, 18 decimals) for 5 levels
    uint256[5] public REF_REWARDS = [1e18, 0.5e18, 0.5e18, 0.25e18, 0.25e18];

    // Direct referral unlock thresholds per level (directs with active CMS subscription)
    // Level 1: 0 directs, Level 2: 2, Level 3: 3, Level 4: 4, Level 5: 5
    uint256[5] public LEVEL_DIRECTS = [0, 2, 3, 4, 5];

    // ============ Deadlines ============
    // Subscription deadline: May 1, 2026 00:00:00 UTC
    // If 10,000 subs reached earlier, subscribe() reverts via MAX_SUBS check.
    uint256 public constant SUBSCRIBE_DEADLINE = 1777593600;

    // Claim deadline: June 1, 2026 00:00:00 UTC
    // After this, claiming is permanently disabled; unclaimed tokens are forfeit.
    uint256 public constant CLAIM_DEADLINE = 1780272000;

    // ============ State Variables ============
    uint256 public totalSubscriptions;                         // Global counter
    mapping(address => uint256) public subscriptionCount;      // Per-user sub count
    mapping(address => uint256) public loyaltyRewards;         // 5 KAIRO per sub (accumulated)
    mapping(address => uint256) public leadershipRewards;      // Referral rewards (accumulated)
    mapping(address => bool) public hasClaimed;                // One-time claim tracking
    mapping(address => address) public referrerOf;             // Direct referrer for CMS
    mapping(address => uint256) public cmsDirectCount;         // Count of directs with active CMS subscription

    // External contracts
    IKAIROToken public kairoToken;
    IERC20 public usdt;
    ILiquidityPool public liquidityPool;
    IStakingManager public stakingManager;
    IAffiliateDistributor public affiliateDistributor;
    address public systemWallet;

    // ============ Events ============
    event SubscriptionPurchased(address indexed buyer, uint256 amount, address indexed referrer);
    event RewardsClaimed(address indexed user, uint256 userAmount, uint256 burnedAmount, uint256 excessDeleted);
    event DeadlineExtended(uint256 oldDeadline, uint256 newDeadline);

    // ============ Constructor ============
    constructor(
        address _kairoToken,
        address _usdt,
        address _liquidityPool,
        address _stakingManager,
        address _affiliateDistributor,
        address _systemWallet,
        address _admin
    ) {
        require(_kairoToken != address(0), "CMS: Invalid KAIRO token");
        require(_usdt != address(0), "CMS: Invalid USDT");
        require(_liquidityPool != address(0), "CMS: Invalid LiquidityPool");
        require(_stakingManager != address(0), "CMS: Invalid StakingManager");
        require(_affiliateDistributor != address(0), "CMS: Invalid AffiliateDistributor");
        require(_systemWallet != address(0), "CMS: Invalid system wallet");
        require(_admin != address(0), "CMS: Invalid admin");

        kairoToken = IKAIROToken(_kairoToken);
        usdt = IERC20(_usdt);
        liquidityPool = ILiquidityPool(_liquidityPool);
        stakingManager = IStakingManager(_stakingManager);
        affiliateDistributor = IAffiliateDistributor(_affiliateDistributor);
        systemWallet = _systemWallet;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    // ============ Core Functions ============

    /**
     * @dev Purchase CMS subscriptions with USDT
     * @param _amount Number of subscriptions to purchase
     * @param _referrer Referrer address (address(0) if none)
     */
    function subscribe(uint256 _amount, address _referrer) external nonReentrant whenNotPaused {
        require(block.timestamp < SUBSCRIBE_DEADLINE, "CMS: Subscription period ended");
        require(_amount > 0, "CMS: Amount must be > 0");
        require(totalSubscriptions + _amount <= MAX_SUBS, "CMS: Exceeds max subscriptions");

        uint256 totalCost = _amount * CMS_PRICE;

        // Transfer USDT from buyer to LiquidityPool (the liquidity pool)
        require(usdt.transferFrom(msg.sender, address(liquidityPool), totalCost), "CMS: USDT transfer failed");

        // Update subscription counts
        subscriptionCount[msg.sender] += _amount;
        totalSubscriptions += _amount;

        // Calculate and accumulate loyalty reward
        uint256 loyaltyReward = _amount * REWARD_PER_SUB;
        loyaltyRewards[msg.sender] += loyaltyReward;

        // Report USDT value of loyalty reward to FIFO 3X cap (only if user has active stake + cap space)
        uint256 livePrice = liquidityPool.getLivePrice();
        if (livePrice > 0 && stakingManager.getTotalActiveStakeValue(msg.sender) > 0) {
            uint256 loyaltyUsdValue = (loyaltyReward * livePrice) / 1e18;
            uint256 remainingCap = stakingManager.getRemainingCap(msg.sender);
            if (loyaltyUsdValue > remainingCap) loyaltyUsdValue = remainingCap;
            if (loyaltyUsdValue > 0) {
                stakingManager.addEarnings(msg.sender, loyaltyUsdValue);
            }
        }

        // Handle referrer (CMS-internal referrer tracking for leadership rewards)
        if (_referrer != address(0) && referrerOf[msg.sender] == address(0)) {
            require(_referrer != msg.sender, "CMS: No self-referral");
            referrerOf[msg.sender] = _referrer;
        }

        // Increment CMS direct count for referrer on first subscription
        // (counts directs who have active CMS subscription)
        if (subscriptionCount[msg.sender] == _amount && referrerOf[msg.sender] != address(0)) {
            // subscriptionCount was just incremented above, so == _amount means first-time subscriber
            cmsDirectCount[referrerOf[msg.sender]] += 1;
        }

        // Distribute referral rewards up 5 levels
        // Eligibility: Referrer needs active CMS + enough CMS directs to unlock level
        // Level 1: 0 directs, Level 2: 2, Level 3: 3, Level 4: 4, Level 5: 5
        address currentReferrer = referrerOf[msg.sender];
        for (uint256 i = 0; i < 5; i++) {
            if (currentReferrer == address(0)) break;

            if (subscriptionCount[currentReferrer] > 0 && cmsDirectCount[currentReferrer] >= LEVEL_DIRECTS[i]) {
                uint256 leadershipReward = REF_REWARDS[i] * _amount;
                leadershipRewards[currentReferrer] += leadershipReward;
            }

            // Walk up regardless of eligibility (reward skips ineligible, doesn't stop)
            address nextRef = referrerOf[currentReferrer];
            if (nextRef == address(0)) {
                try affiliateDistributor.referrerOf(currentReferrer) returns (address affRef) {
                    nextRef = affRef;
                } catch {}
            }
            currentReferrer = nextRef;
        }

        emit SubscriptionPurchased(msg.sender, _amount, _referrer);
    }

    /**
     * @dev Claim CMS rewards (one-time, "use it or lose it")
     *      Requires active stake in StakingManager. Excess beyond stake cap is permanently deleted.
     *      90% goes to user, 10% to system wallet.
     */
    function claimCMSRewards() external nonReentrant whenNotPaused {
        require(block.timestamp <= CLAIM_DEADLINE, "CMS: Claim period ended");
        require(!hasClaimed[msg.sender], "CMS: Already claimed");
        require(subscriptionCount[msg.sender] > 0, "CMS: No subscriptions");

        // Check active stake
        uint256 activeStakeValue = stakingManager.getTotalActiveStakeValue(msg.sender);
        require(activeStakeValue > 0, "CMS: No active stake");

        uint256 totalClaimable = loyaltyRewards[msg.sender] + leadershipRewards[msg.sender];
        require(totalClaimable > 0, "CMS: Nothing to claim");

        // Calculate max claimable based on stake value
        uint256 livePrice = liquidityPool.getLivePrice();
        require(livePrice > 0, "CMS: Invalid price");

        uint256 maxClaimableKairo = (activeStakeValue * 1e18) / livePrice;

        // Apply cap - excess is permanently deleted
        uint256 excessDeleted = 0;
        if (totalClaimable > maxClaimableKairo) {
            excessDeleted = totalClaimable - maxClaimableKairo;
            totalClaimable = maxClaimableKairo;
        }

        // Mint 90% to user, 10% is not minted (deflationary burn)
        uint256 userAmount = (totalClaimable * 90) / 100;
        uint256 burnedAmount = totalClaimable - userAmount;

        // Mint KAIRO only to user
        if (userAmount > 0) {
            kairoToken.mint(msg.sender, userAmount);
        }
        // 10% is intentionally not minted — deflationary

        // Clear rewards and mark claimed
        loyaltyRewards[msg.sender] = 0;
        leadershipRewards[msg.sender] = 0;
        hasClaimed[msg.sender] = true;

        emit RewardsClaimed(msg.sender, userAmount, burnedAmount, excessDeleted);
    }

    // ============ View Functions ============

    /**
     * @dev Get claimable rewards for a user
     * @param _user User address
     * @return loyalty Loyalty rewards (KAIRO)
     * @return leadership Leadership/referral rewards (KAIRO)
     * @return total Total claimable rewards (KAIRO)
     */
    function getClaimableRewards(address _user) external view returns (
        uint256 loyalty,
        uint256 leadership,
        uint256 total
    ) {
        loyalty = loyaltyRewards[_user];
        leadership = leadershipRewards[_user];
        total = loyalty + leadership;
    }

    /**
     * @dev Get max claimable KAIRO based on active stake
     * @param _user User address
     * @return Maximum claimable KAIRO amount
     */
    function getMaxClaimable(address _user) external view returns (uint256) {
        uint256 activeStakeValue = stakingManager.getTotalActiveStakeValue(_user);
        if (activeStakeValue == 0) return 0;

        uint256 livePrice = liquidityPool.getLivePrice();
        if (livePrice == 0) return 0;

        return (activeStakeValue * 1e18) / livePrice;
    }

    /**
     * @dev Get excess rewards that would be permanently deleted on claim
     * @param _user User address
     * @return Excess KAIRO amount that would be lost
     */
    function getExcessToBeDeleted(address _user) external view returns (uint256) {
        uint256 totalClaimable = loyaltyRewards[_user] + leadershipRewards[_user];
        if (totalClaimable == 0) return 0;

        uint256 activeStakeValue = stakingManager.getTotalActiveStakeValue(_user);
        if (activeStakeValue == 0) return totalClaimable;

        uint256 livePrice = liquidityPool.getLivePrice();
        if (livePrice == 0) return totalClaimable;

        uint256 maxClaimableKairo = (activeStakeValue * 1e18) / livePrice;
        if (totalClaimable > maxClaimableKairo) {
            return totalClaimable - maxClaimableKairo;
        }
        return 0;
    }

    /**
     * @dev Get subscription count for a user
     * @param _user User address
     * @return Number of subscriptions
     */
    function getSubscriptionCount(address _user) external view returns (uint256) {
        return subscriptionCount[_user];
    }

    /**
     * @dev Get remaining available subscriptions
     * @return Remaining subscription slots
     */
    function getRemainingSubscriptions() external view returns (uint256) {
        return MAX_SUBS - totalSubscriptions;
    }

    /**
     * @dev Check if CMS deadline has passed
     * @return True if deadline has passed
     */
    function isSubscriptionEnded() external view returns (bool) {
        return block.timestamp >= SUBSCRIBE_DEADLINE || totalSubscriptions >= MAX_SUBS;
    }

    /**
     * @dev Check if claim deadline has passed (June 1, 2026 UTC)
     * @return True if claim deadline has passed
     */
    function isClaimDeadlinePassed() external view returns (bool) {
        return block.timestamp > CLAIM_DEADLINE;
    }

    /**
     * @dev Comprehensive claim eligibility check
     * @param _user User address
     * @return eligible Whether the user can claim
     * @return reason Reason string if not eligible
     */
    function canClaim(address _user) external view returns (bool eligible, string memory reason) {
        if (block.timestamp > CLAIM_DEADLINE) {
            return (false, "Claim period ended (June 1st)");
        }
        if (hasClaimed[_user]) {
            return (false, "Already claimed");
        }
        if (subscriptionCount[_user] == 0) {
            return (false, "No subscriptions");
        }
        uint256 activeStakeValue = stakingManager.getTotalActiveStakeValue(_user);
        if (activeStakeValue == 0) {
            return (false, "No active stake");
        }
        uint256 totalClaimable = loyaltyRewards[_user] + leadershipRewards[_user];
        if (totalClaimable == 0) {
            return (false, "Nothing to claim");
        }
        return (true, "Eligible");
    }

    // ============ Admin Functions ============

    /**
     * @dev Extend the CMS deadline (must be greater than current deadline)
     * @param _newDeadline New deadline timestamp
     */
    // extendDeadline removed — deadlines are now immutable constants

    /**
     * @dev Set the system wallet address
     * @param _wallet New system wallet address
     */
    function setSystemWallet(address _wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_wallet != address(0), "CMS: Invalid wallet");
        systemWallet = _wallet;
    }

    /**
     * @dev Pause the contract (emergency)
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
