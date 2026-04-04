// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

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
 * @title AffiliateDistributor - Multi-level income distribution for KAIRO DeFi ecosystem
 * @dev Manages referral tracking, multi-level team dividends, rank salaries,
 *      and qualifier bonuses. All income is denominated in USD (18 decimals)
 *      and harvested as minted KAIRO tokens at live price.
 *
 * Income Types:
 *   0 = Direct Dividends (5% of referred stakes)
 *   1 = Team Dividends (multi-level vesting profits)
 *   2 = Rank Dividends (weekly salary based on team volume)
 *   3 = Qualifier Weekly (3% global weekly profits share)
 *   4 = Qualifier Monthly (2% global monthly profits share)
 */
contract AffiliateDistributor is ReentrancyGuard, Pausable, AccessControl {
    // ============ Roles ============
    bytes32 public constant STAKING_ROLE = keccak256("STAKING_ROLE");
    bytes32 public constant RANK_UPDATER_ROLE = keccak256("RANK_UPDATER_ROLE");

    // ============ External References ============
    IKAIROToken public kairoToken;
    ILiquidityPool public liquidityPool;
    address public stakingManager;
    address public systemWallet;

    // ============ Income Mappings (USD value, 18 decimals) ============
    mapping(address => uint256) public directDividends;
    mapping(address => uint256) public teamDividends;
    mapping(address => uint256) public rankDividends;
    mapping(address => uint256) public qualifierWeekly;
    mapping(address => uint256) public qualifierMonthly;

    // ============ Referral Tracking ============
    mapping(address => address) public referrerOf;
    mapping(address => address[]) public directReferrals;
    mapping(address => uint256) public teamVolume;
    mapping(address => uint256) public directCount;

    // ============ Constants ============
    uint256 public constant MIN_HARVEST = 10e18; // $10 minimum harvest

    // Team dividend percentages (basis points: 1000 = 10%)
    // L1: 10%, L2-L10: 5% each, L11-L15: 2% each
    uint256[15] public TEAM_PERCENTAGES = [
        1000, 500, 500, 500, 500, 500, 500, 500, 500, 500,
        200, 200, 200, 200, 200
    ];

    // Rank salary thresholds (USD, 18 decimals)
    uint256[10] public RANK_THRESHOLDS = [
        10_000e18,
        30_000e18,
        100_000e18,
        300_000e18,
        1_000_000e18,
        3_000_000e18,
        10_000_000e18,
        30_000_000e18,
        100_000_000e18,
        250_000_000e18
    ];

    // Rank salary amounts (USD, 18 decimals)
    uint256[10] public RANK_SALARIES = [
        10e18,
        30e18,
        70e18,
        200e18,
        600e18,
        1_200e18,
        4_000e18,
        12_000e18,
        40_000e18,
        100_000e18
    ];

    // ============ Events ============
    event ReferrerSet(address indexed user, address indexed referrer);
    event DirectEarned(address indexed referrer, uint256 amount);
    event TeamEarned(address indexed upline, address indexed staker, uint256 level, uint256 amount);
    event RankUpdated(address indexed user, uint256 amount);
    event Harvested(address indexed user, uint8 incomeType, uint256 usdAmount, uint256 kairoAmount);

    // ============ Constructor ============
    constructor(
        address _kairoToken,
        address _liquidityPool,
        address _admin,
        address _systemWallet
    ) {
        require(_kairoToken != address(0), "AffiliateDistributor: Invalid KAIRO token");
        require(_liquidityPool != address(0), "AffiliateDistributor: Invalid LiquidityPool");
        require(_admin != address(0), "AffiliateDistributor: Invalid admin");
        require(_systemWallet != address(0), "AffiliateDistributor: Invalid system wallet");

        kairoToken = IKAIROToken(_kairoToken);
        liquidityPool = ILiquidityPool(_liquidityPool);
        systemWallet = _systemWallet;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    // ============ Referral Functions ============

    /**
     * @dev Set referrer for a user. Called when user first stakes or subscribes.
     * @param _user Address of the new user
     * @param _referrer Address of the referrer
     */
    function setReferrer(address _user, address _referrer) external onlyRole(STAKING_ROLE) {
        require(referrerOf[_user] == address(0), "AffiliateDistributor: Referrer already set");
        require(_referrer != address(0), "AffiliateDistributor: Invalid referrer");
        require(_referrer != _user, "AffiliateDistributor: No self-referral");

        // Prevent circular referral: walk up chain from _referrer (cap at 15 for gas safety)
        address current = _referrer;
        for (uint256 i = 0; i < 15; i++) {
            if (current == address(0)) break;
            require(current != _user, "AffiliateDistributor: Circular referral detected");
            current = referrerOf[current];
        }

        referrerOf[_user] = _referrer;
        directReferrals[_referrer].push(_user);
        directCount[_referrer]++;

        emit ReferrerSet(_user, _referrer);
    }

    // ============ Distribution Functions (STAKING_ROLE only) ============

    /**
     * @dev Distribute 5% direct dividend to referrer
     * @param _referrer Address of the referrer
     * @param _stakeAmount Stake amount in USD (18 decimals)
     */
    function distributeDirect(address _referrer, uint256 _stakeAmount) external onlyRole(STAKING_ROLE) {
        require(_referrer != address(0), "AffiliateDistributor: Invalid referrer");

        uint256 dividend = (_stakeAmount * 5) / 100;
        directDividends[_referrer] += dividend;

        emit DirectEarned(_referrer, dividend);
    }

    /**
     * @dev Distribute team dividends through up to 15 levels of referrer chain
     * @param _staker Address of the staker generating the profit
     * @param _profit Profit amount in USD (18 decimals)
     */
    function distributeTeamDividend(address _staker, uint256 _profit) external onlyRole(STAKING_ROLE) {
        address current = _staker;

        for (uint256 i = 0; i < 15; i++) {
            address upline = referrerOf[current];
            if (upline == address(0)) break;

            uint256 dividend = (_profit * TEAM_PERCENTAGES[i]) / 10000;
            teamDividends[upline] += dividend;

            emit TeamEarned(upline, _staker, i + 1, dividend);

            current = upline;
        }
    }

    // ============ Rank & Qualifier Functions (RANK_UPDATER_ROLE only) ============

    /**
     * @dev Update rank dividend for a user (called by backend after weekly calculation)
     * @param _user User address
     * @param _amount Amount in USD (18 decimals)
     */
    function updateRankDividend(address _user, uint256 _amount) external onlyRole(RANK_UPDATER_ROLE) {
        require(_user != address(0), "AffiliateDistributor: Invalid user");
        rankDividends[_user] += _amount;

        emit RankUpdated(_user, _amount);
    }

    /**
     * @dev Batch update weekly qualifier bonuses
     * @param _users Array of user addresses
     * @param _amounts Array of bonus amounts in USD (18 decimals)
     */
    function updateQualifierWeekly(
        address[] calldata _users,
        uint256[] calldata _amounts
    ) external onlyRole(RANK_UPDATER_ROLE) {
        require(_users.length == _amounts.length, "AffiliateDistributor: Length mismatch");

        for (uint256 i = 0; i < _users.length; i++) {
            qualifierWeekly[_users[i]] += _amounts[i];
        }
    }

    /**
     * @dev Batch update monthly qualifier bonuses
     * @param _users Array of user addresses
     * @param _amounts Array of bonus amounts in USD (18 decimals)
     */
    function updateQualifierMonthly(
        address[] calldata _users,
        uint256[] calldata _amounts
    ) external onlyRole(RANK_UPDATER_ROLE) {
        require(_users.length == _amounts.length, "AffiliateDistributor: Length mismatch");

        for (uint256 i = 0; i < _users.length; i++) {
            qualifierMonthly[_users[i]] += _amounts[i];
        }
    }

    // ============ Harvest Function ============

    /**
     * @dev Harvest accumulated income by minting KAIRO at live price
     * @param _incomeType 0=Direct, 1=Team, 2=Rank, 3=QualifierWeekly, 4=QualifierMonthly
     */
    function harvest(uint8 _incomeType) external nonReentrant whenNotPaused {
        uint256 balance;

        if (_incomeType == 0) {
            balance = directDividends[msg.sender];
            directDividends[msg.sender] = 0;
        } else if (_incomeType == 1) {
            balance = teamDividends[msg.sender];
            teamDividends[msg.sender] = 0;
        } else if (_incomeType == 2) {
            balance = rankDividends[msg.sender];
            rankDividends[msg.sender] = 0;
        } else if (_incomeType == 3) {
            balance = qualifierWeekly[msg.sender];
            qualifierWeekly[msg.sender] = 0;
        } else if (_incomeType == 4) {
            balance = qualifierMonthly[msg.sender];
            qualifierMonthly[msg.sender] = 0;
        } else {
            revert("AffiliateDistributor: Invalid income type");
        }

        require(balance >= MIN_HARVEST, "AffiliateDistributor: Below minimum harvest ($10)");

        uint256 livePrice = liquidityPool.getLivePrice();
        require(livePrice > 0, "AffiliateDistributor: Invalid price");

        uint256 kairoAmount = (balance * 1e18) / livePrice;
        require(kairoAmount > 0, "AffiliateDistributor: Mint amount too small");

        kairoToken.mint(msg.sender, kairoAmount);

        emit Harvested(msg.sender, _incomeType, balance, kairoAmount);
    }

    // ============ View Functions ============

    /**
     * @dev Calculate rank salary based on team volume with 50% max per leg rule
     * @param _user User address
     * @return salary Weekly rank salary in USD (18 decimals)
     */
    function calculateRankSalary(address _user) external view returns (uint256 salary) {
        uint256 totalVolume = teamVolume[_user];
        if (totalVolume == 0) return 0;

        // Find the largest leg volume
        address[] storage referrals = directReferrals[_user];
        uint256 largestLeg = 0;

        for (uint256 i = 0; i < referrals.length; i++) {
            uint256 legVolume = teamVolume[referrals[i]];
            if (legVolume > largestLeg) {
                largestLeg = legVolume;
            }
        }

        // Apply 50% max per leg rule
        uint256 maxLeg = totalVolume / 2;
        uint256 adjustedVolume;
        if (largestLeg > maxLeg) {
            adjustedVolume = totalVolume - largestLeg + maxLeg;
        } else {
            adjustedVolume = totalVolume;
        }

        // Determine rank salary from thresholds (highest qualifying)
        for (uint256 i = RANK_THRESHOLDS.length; i > 0; i--) {
            if (adjustedVolume >= RANK_THRESHOLDS[i - 1]) {
                return RANK_SALARIES[i - 1];
            }
        }

        return 0;
    }

    /**
     * @dev Get all income balances for a user
     * @param _user User address
     * @return direct Direct dividends balance
     * @return team Team dividends balance
     * @return rank Rank dividends balance
     * @return qWeekly Qualifier weekly balance
     * @return qMonthly Qualifier monthly balance
     */
    function getAllIncome(address _user) external view returns (
        uint256 direct,
        uint256 team,
        uint256 rank,
        uint256 qWeekly,
        uint256 qMonthly
    ) {
        direct = directDividends[_user];
        team = teamDividends[_user];
        rank = rankDividends[_user];
        qWeekly = qualifierWeekly[_user];
        qMonthly = qualifierMonthly[_user];
    }

    /**
     * @dev Get total harvestable amount across all income types
     * @param _user User address
     * @return total Sum of all income types in USD (18 decimals)
     */
    function getTotalHarvestable(address _user) external view returns (uint256 total) {
        total = directDividends[_user]
            + teamDividends[_user]
            + rankDividends[_user]
            + qualifierWeekly[_user]
            + qualifierMonthly[_user];
    }

    /**
     * @dev Get referrer of a user
     * @param _user User address
     * @return Referrer address
     */
    function getReferrer(address _user) external view returns (address) {
        return referrerOf[_user];
    }

    /**
     * @dev Get direct referrals of a user
     * @param _user User address
     * @return Array of direct referral addresses
     */
    function getDirectReferrals(address _user) external view returns (address[] memory) {
        return directReferrals[_user];
    }

    /**
     * @dev Get upline chain for a user up to _levels deep
     * @param _user User address
     * @param _levels Number of levels to traverse
     * @return upline Array of upline addresses
     */
    function getUpline(address _user, uint256 _levels) external view returns (address[] memory upline) {
        upline = new address[](_levels);
        address current = _user;

        for (uint256 i = 0; i < _levels; i++) {
            address ref = referrerOf[current];
            if (ref == address(0)) {
                // Resize array to actual length
                address[] memory trimmed = new address[](i);
                for (uint256 j = 0; j < i; j++) {
                    trimmed[j] = upline[j];
                }
                return trimmed;
            }
            upline[i] = ref;
            current = ref;
        }
    }

    /**
     * @dev Get team volume of a user
     * @param _user User address
     * @return Team volume in USD (18 decimals)
     */
    function getTeamVolume(address _user) external view returns (uint256) {
        return teamVolume[_user];
    }

    // ============ Admin Functions ============

    /**
     * @dev Set staking manager address and grant STAKING_ROLE
     * @param _staking Staking manager address
     */
    function setStakingManager(address _staking) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_staking != address(0), "AffiliateDistributor: Invalid staking address");

        // Revoke old role if previously set
        if (stakingManager != address(0)) {
            _revokeRole(STAKING_ROLE, stakingManager);
        }

        stakingManager = _staking;
        _grantRole(STAKING_ROLE, _staking);
    }

    /**
     * @dev Set system wallet address
     * @param _wallet System wallet address
     */
    function setSystemWallet(address _wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_wallet != address(0), "AffiliateDistributor: Invalid wallet address");
        systemWallet = _wallet;
    }

    /**
     * @dev Update team volume for a user (called when stakes change)
     * @param _user User address
     * @param _volume New team volume in USD (18 decimals)
     */
    function updateTeamVolume(address _user, uint256 _volume) external onlyRole(STAKING_ROLE) {
        teamVolume[_user] = _volume;
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
