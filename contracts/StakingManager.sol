// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IKAIROToken - Interface for KAIRO token interactions
 */
interface IKAIROToken {
    function mint(address to, uint256 amount) external;
    function mintTo(address recipient, uint256 usdAmount) external;
    function burn(uint256 amount) external;
    function burnFrom(address account, uint256 amount) external;
    function getTotalBurned() external view returns (uint256);
    function getSocialLockAmount() external view returns (uint256);
    function getEffectiveSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title ILiquidityPool - Interface for LiquidityPool interactions
 */
interface ILiquidityPool {
    function getLivePrice() external view returns (uint256);
    function receiveStakingFunds(uint256 amount) external;
}

/**
 * @title IAffiliateDistributor - Interface for affiliate reward distribution
 */
interface IAffiliateDistributor {
    function distributeDirect(address _referrer, uint256 _stakeAmount) external;
    function distributeTeamDividend(address _staker, uint256 _profit) external;
}

/**
 * @title StakingManager - Core Staking Engine for the KAIRO DeFi Ecosystem
 * @dev Implements a 3-tier staking system with 0.1% compounding per interval,
 *      3X hard cap auto-close, 80% return on unstake, and affiliate integration.
 *
 * Features:
 * - 3-tier system with different compound intervals (8h / 6h / 4h)
 * - 0.1% profit per compound interval
 * - 3X hard cap: auto-closes stake when totalEarned >= 3 * originalAmount
 * - 80% return on unstake with harvested rewards deduction
 * - Affiliate direct dividends (5%) and team dividends on compound
 * - COMPOUNDER_ROLE for backend-triggered compounding
 * - Pausable + ReentrancyGuard + AccessControl
 */
contract StakingManager is ReentrancyGuard, Pausable, AccessControl {
    // ============ Roles ============
    bytes32 public constant COMPOUNDER_ROLE = keccak256("COMPOUNDER_ROLE");

    // ============ Tier System ============
    struct Tier {
        uint256 min;               // minimum stake in USDT (18 decimals)
        uint256 max;               // maximum stake in USDT
        uint256 compoundInterval;  // in seconds: 28800, 21600, or 14400
        uint256 dailyClosings;     // 3, 4, or 6
    }

    Tier[3] public tiers;

    // ============ Stake Structure ============
    struct Stake {
        uint256 amount;            // Current stake amount in USDT value (18 decimals)
        uint256 originalAmount;    // Original stake amount (for 3X cap calculation)
        uint256 startTime;
        uint256 lastCompoundTime;
        uint256 harvestedRewards;  // Tracks harvested amounts (for unstake deduction)
        uint256 totalEarned;       // Tracks total earned (for 3X cap)
        bool active;
        uint8 tier;
    }

    mapping(address => Stake[]) public userStakes;
    mapping(address => uint256) public totalActiveStakeValue;

    // ============ External Contract References ============
    IKAIROToken public kairoToken;
    ILiquidityPool public liquidityPool;
    IERC20 public usdt;
    address public affiliateDistributor;
    address public systemWallet;

    // ============ Constants ============
    uint256 public constant MIN_STAKE = 10 * 10 ** 18;       // 10 USDT minimum
    uint256 public constant MIN_HARVEST = 10 * 10 ** 18;     // $10 minimum harvest
    uint256 public constant PROFIT_NUMERATOR = 1;             // 0.1% = 1/1000
    uint256 public constant PROFIT_DENOMINATOR = 1000;
    uint256 public constant RETURN_PERCENT = 80;              // 80% return on unstake / auto-close
    uint256 public constant CAP_MULTIPLIER = 3;               // 3X hard cap

    // ============ Events ============
    event StakeCreated(address indexed user, uint256 stakeId, uint256 amount, uint8 tier);
    event Compounded(address indexed user, uint256 stakeId, uint256 profit, uint256 newAmount);
    event Unstaked(address indexed user, uint256 stakeId, uint256 returnAmount);
    event CapReached(address indexed user, uint256 stakeId, uint256 totalEarned);
    event Harvested(address indexed user, uint256 stakeId, uint256 amount);
    event AffiliateDistributorSet(address indexed distributor);
    event SystemWalletSet(address indexed wallet);

    // ============ Constructor ============
    constructor(
        address _kairoToken,
        address _liquidityPool,
        address _usdt,
        address _systemWallet,
        address _admin
    ) {
        require(_kairoToken != address(0), "StakingManager: Invalid KAIRO token");
        require(_liquidityPool != address(0), "StakingManager: Invalid LiquidityPool");
        require(_usdt != address(0), "StakingManager: Invalid USDT");
        require(_systemWallet != address(0), "StakingManager: Invalid system wallet");
        require(_admin != address(0), "StakingManager: Invalid admin");

        kairoToken = IKAIROToken(_kairoToken);
        liquidityPool = ILiquidityPool(_liquidityPool);
        usdt = IERC20(_usdt);
        systemWallet = _systemWallet;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);

        // Tier 0: 10-499 USDT, 8 hours (28800s), 3 closings/day
        tiers[0] = Tier(10 * 10 ** 18, 499 * 10 ** 18, 28800, 3);
        // Tier 1: 500-1999 USDT, 6 hours (21600s), 4 closings/day
        tiers[1] = Tier(500 * 10 ** 18, 1999 * 10 ** 18, 21600, 4);
        // Tier 2: 2000+ USDT, 4 hours (14400s), 6 closings/day
        tiers[2] = Tier(2000 * 10 ** 18, type(uint256).max, 14400, 6);
    }

    // ============ Core Functions ============

    /**
     * @dev Stake USDT into the staking system
     * @param _usdtAmount Amount of USDT to stake (18 decimals)
     * @param _referrer Referrer address for affiliate dividends
     */
    function stake(uint256 _usdtAmount, address _referrer) external nonReentrant whenNotPaused {
        require(_usdtAmount >= MIN_STAKE, "StakingManager: Below minimum stake");

        // Auto-detect tier
        uint8 tierIndex = _detectTier(_usdtAmount);

        // Transfer USDT from user to this contract
        require(usdt.transferFrom(msg.sender, address(this), _usdtAmount), "StakingManager: USDT transfer failed");

        // Forward 60% of staking funds to LiquidityPool for liquidity backing
        uint256 liquidityPoolShare = (_usdtAmount * 60) / 100;
        require(usdt.approve(address(liquidityPool), liquidityPoolShare), "StakingManager: USDT approve failed");
        require(usdt.transfer(address(liquidityPool), liquidityPoolShare), "StakingManager: LiquidityPool transfer failed");
        liquidityPool.receiveStakingFunds(liquidityPoolShare);

        // Create new stake
        uint256 stakeId = userStakes[msg.sender].length;
        userStakes[msg.sender].push(Stake({
            amount: _usdtAmount,
            originalAmount: _usdtAmount,
            startTime: block.timestamp,
            lastCompoundTime: block.timestamp,
            harvestedRewards: 0,
            totalEarned: 0,
            active: true,
            tier: tierIndex
        }));

        totalActiveStakeValue[msg.sender] += _usdtAmount;

        // Distribute 5% direct dividend to referrer via AffiliateDistributor
        if (affiliateDistributor != address(0) && _referrer != address(0) && _referrer != msg.sender) {
            IAffiliateDistributor(affiliateDistributor).distributeDirect(_referrer, _usdtAmount);
        }

        emit StakeCreated(msg.sender, stakeId, _usdtAmount, tierIndex);
    }

    /**
     * @dev Compound accumulated profits for a specific stake
     * @param _stakeId Index of the stake to compound
     */
    function compound(uint256 _stakeId) external nonReentrant whenNotPaused {
        _compound(msg.sender, _stakeId);
    }

    /**
     * @dev Compound on behalf of a user (backend COMPOUNDER_ROLE)
     * @param _user Address of the stake owner
     * @param _stakeId Index of the stake to compound
     */
    function compoundFor(address _user, uint256 _stakeId) external nonReentrant whenNotPaused onlyRole(COMPOUNDER_ROLE) {
        require(_user != address(0), "StakingManager: Invalid user");
        _compound(_user, _stakeId);
    }

    /**
     * @dev Internal compound logic
     * @param _user Stake owner
     * @param _stakeId Index of the stake
     */
    function _compound(address _user, uint256 _stakeId) internal {
        require(_stakeId < userStakes[_user].length, "StakingManager: Invalid stake ID");
        Stake storage stk = userStakes[_user][_stakeId];
        require(stk.active, "StakingManager: Stake not active");

        Tier memory tier = tiers[stk.tier];

        // Calculate intervals passed since last compound
        uint256 elapsed = block.timestamp - stk.lastCompoundTime;
        uint256 intervals = elapsed / tier.compoundInterval;

        require(intervals > 0, "StakingManager: No intervals passed");

        uint256 totalProfit = 0;
        uint256 currentAmount = stk.amount;

        for (uint256 i = 0; i < intervals; i++) {
            uint256 profit = (currentAmount * PROFIT_NUMERATOR) / PROFIT_DENOMINATOR;
            currentAmount += profit;
            totalProfit += profit;

            // Check 3X cap per iteration
            if (stk.totalEarned + totalProfit >= CAP_MULTIPLIER * stk.originalAmount) {
                // Cap the profit to exactly hit 3X
                uint256 maxEarnable = (CAP_MULTIPLIER * stk.originalAmount) - stk.totalEarned;
                totalProfit = maxEarnable;
                currentAmount = stk.amount + totalProfit;
                break;
            }
        }

        // Update stake
        stk.amount = currentAmount;
        stk.totalEarned += totalProfit;
        stk.lastCompoundTime += intervals * tier.compoundInterval;

        // Update totalActiveStakeValue with the profit added
        totalActiveStakeValue[_user] += totalProfit;

        // Distribute team dividends via AffiliateDistributor
        if (affiliateDistributor != address(0) && totalProfit > 0) {
            IAffiliateDistributor(affiliateDistributor).distributeTeamDividend(_user, totalProfit);
        }

        emit Compounded(_user, _stakeId, totalProfit, stk.amount);

        // 3X CAP CHECK: auto-close if reached
        if (stk.totalEarned >= CAP_MULTIPLIER * stk.originalAmount) {
            _autoCloseStake(_user, _stakeId);
        }
    }

    /**
     * @dev Auto-close a stake when 3X cap is reached
     * @param _user Stake owner
     * @param _stakeId Index of the stake
     */
    function _autoCloseStake(address _user, uint256 _stakeId) internal {
        Stake storage stk = userStakes[_user][_stakeId];

        uint256 returnAmount = (stk.amount * RETURN_PERCENT) / 100;

        // Mint KAIRO to user at live rate (USD value → KAIRO)
        if (returnAmount > 0) {
            kairoToken.mintTo(_user, returnAmount);
        }

        // Mark stake inactive
        stk.active = false;
        totalActiveStakeValue[_user] -= stk.amount;

        emit CapReached(_user, _stakeId, stk.totalEarned);
    }

    /**
     * @dev Unstake and receive 80% of current stake value minus harvested rewards
     * @param _stakeId Index of the stake to unstake
     */
    function unstake(uint256 _stakeId) external nonReentrant {
        require(_stakeId < userStakes[msg.sender].length, "StakingManager: Invalid stake ID");
        Stake storage stk = userStakes[msg.sender][_stakeId];
        require(stk.active, "StakingManager: Stake not active");

        uint256 grossReturn = (stk.amount * RETURN_PERCENT) / 100;

        // Deduct harvested rewards from the return
        uint256 returnAmount;
        if (stk.harvestedRewards >= grossReturn) {
            returnAmount = 0;
        } else {
            returnAmount = grossReturn - stk.harvestedRewards;
        }

        // Mint KAIRO to user at live rate (USD value → KAIRO)
        if (returnAmount > 0) {
            kairoToken.mintTo(msg.sender, returnAmount);
        }

        // Mark stake inactive
        totalActiveStakeValue[msg.sender] -= stk.amount;
        stk.active = false;

        // Unharvested earnings are forfeited
        emit Unstaked(msg.sender, _stakeId, returnAmount);
    }

    /**
     * @dev Harvest accumulated compound rewards from a stake
     * @param _stakeId Index of the stake
     * @param _amount USD amount to harvest (18 decimals)
     */
    function harvest(uint256 _stakeId, uint256 _amount) external nonReentrant whenNotPaused {
        require(_stakeId < userStakes[msg.sender].length, "StakingManager: Invalid stake ID");
        require(_amount >= MIN_HARVEST, "StakingManager: Below minimum harvest ($10)");

        Stake storage stk = userStakes[msg.sender][_stakeId];
        require(stk.active, "StakingManager: Stake not active");

        // Available to harvest = totalEarned - harvestedRewards
        uint256 available = stk.totalEarned - stk.harvestedRewards;
        require(_amount <= available, "StakingManager: Insufficient harvestable amount");

        // Track harvested amount
        stk.harvestedRewards += _amount;

        // Mint KAIRO to user at live rate
        kairoToken.mintTo(msg.sender, _amount);

        emit Harvested(msg.sender, _stakeId, _amount);
    }

    // ============ View Functions ============

    /**
     * @dev Get all stakes for a user
     * @param _user User address
     * @return Array of Stake structs
     */
    function getUserStakes(address _user) external view returns (Stake[] memory) {
        return userStakes[_user];
    }

    /**
     * @dev Get a specific stake for a user
     * @param _user User address
     * @param _stakeId Stake index
     * @return Stake struct
     */
    function getStake(address _user, uint256 _stakeId) external view returns (Stake memory) {
        require(_stakeId < userStakes[_user].length, "StakingManager: Invalid stake ID");
        return userStakes[_user][_stakeId];
    }

    /**
     * @dev Get total active stake value for a user
     * @param _user User address
     * @return Total active stake value in USDT (18 decimals)
     */
    function getTotalActiveStakeValue(address _user) external view returns (uint256) {
        return totalActiveStakeValue[_user];
    }

    /**
     * @dev Get 3X cap progress for a specific stake
     * @param _user User address
     * @param _stakeId Stake index
     * @return earned Total earned so far
     * @return cap Maximum earnable (3X original)
     */
    function getCapProgress(address _user, uint256 _stakeId) external view returns (uint256 earned, uint256 cap) {
        require(_stakeId < userStakes[_user].length, "StakingManager: Invalid stake ID");
        Stake memory stk = userStakes[_user][_stakeId];
        earned = stk.totalEarned;
        cap = CAP_MULTIPLIER * stk.originalAmount;
    }

    /**
     * @dev Get the number of stakes for a user
     * @param _user User address
     * @return Number of stakes
     */
    function getUserStakeCount(address _user) external view returns (uint256) {
        return userStakes[_user].length;
    }

    // ============ Admin Functions ============

    /**
     * @dev Set the AffiliateDistributor contract address
     * @param _affiliate AffiliateDistributor contract address
     */
    function setAffiliateDistributor(address _affiliate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_affiliate != address(0), "StakingManager: Invalid affiliate address");
        affiliateDistributor = _affiliate;
        emit AffiliateDistributorSet(_affiliate);
    }

    /**
     * @dev Set the system wallet address
     * @param _wallet System wallet address
     */
    function setSystemWallet(address _wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_wallet != address(0), "StakingManager: Invalid wallet address");
        systemWallet = _wallet;
        emit SystemWalletSet(_wallet);
    }

    /**
     * @dev Pause the contract (emergency stop)
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

    // ============ Internal Functions ============

    /**
     * @dev Auto-detect tier based on USDT stake amount
     * @param _amount USDT amount (18 decimals)
     * @return tierIndex Tier index (0, 1, or 2)
     */
    function _detectTier(uint256 _amount) internal view returns (uint8) {
        for (uint8 i = 2; i > 0; i--) {
            if (_amount >= tiers[i].min) {
                return i;
            }
        }
        return 0;
    }
}
