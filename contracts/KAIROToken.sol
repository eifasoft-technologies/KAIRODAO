// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ILiquidityPool - Interface for querying live KAIRO price
 */
interface ILiquidityPool {
    function getLivePrice() external view returns (uint256);
}

/**
 * @title KAIROToken - Foundation ERC20 Token for the KAIRO DeFi Ecosystem
 * @dev ERC20 token with role-based minting/burning, social lock mechanism,
 *      and price-aware minting via LiquidityPool integration.
 *
 * Features:
 * - ERC20 + ERC20Permit (gasless approvals via EIP-2612)
 * - ERC20Burnable (burn functionality)
 * - AccessControl (role-based access: MINTER_ROLE, BURNER_ROLE)
 * - Social lock: 10,000 KAIRO minted to LP and locked forever
 * - Price-aware minting via LiquidityPool oracle
 * - Tracks total burned supply and effective supply for LiquidityPool compatibility
 */
contract KAIROToken is ERC20, ERC20Permit, ERC20Burnable, AccessControl {
    // ============ Roles ============
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // ============ State Variables ============
    address public liquidityPool;
    uint256 public constant SOCIAL_LOCK = 10_000 * 10 ** 18; // 10,000 KAIRO locked forever
    bool public socialLockApplied;

    // Track total burned tokens for LiquidityPool/AtomicP2p compatibility
    uint256 private _totalBurned;

    // ============ Events ============
    event MintedTo(address indexed recipient, uint256 usdAmount, uint256 kairoAmount);
    event LiquidityPoolSet(address indexed pool);
    event SocialLockApplied(uint256 amount);

    // ============ Constructor ============

    /**
     * @param _admin Address to receive DEFAULT_ADMIN_ROLE
     */
    constructor(address _admin) ERC20("KAIRO", "KAIRO") ERC20Permit("KAIRO") {
        require(_admin != address(0), "KAIROToken: Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    // ============ Admin Functions ============

    /**
     * @dev Set the liquidity pool address (one-time, admin only)
     * @param _lp LiquidityPool / AuxFund contract address
     */
    function setLiquidityPool(address _lp) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_lp != address(0), "KAIROToken: Invalid LP address");
        require(liquidityPool == address(0), "KAIROToken: LP already set");
        liquidityPool = _lp;
        emit LiquidityPoolSet(_lp);
    }

    /**
     * @dev Mint initial supply to LP and apply social lock
     *      - Requires liquidityPool to be set
     *      - Requires socialLockApplied == false
     *      - Mints 10,000 KAIRO to liquidityPool address
     *      - Sets socialLockApplied = true
     */
    function mintInitialSupply() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(liquidityPool != address(0), "KAIROToken: LP not set");
        require(!socialLockApplied, "KAIROToken: Social lock already applied");

        socialLockApplied = true;
        _mint(liquidityPool, SOCIAL_LOCK);

        emit SocialLockApplied(SOCIAL_LOCK);
    }

    // ============ Minting Functions ============

    /**
     * @dev Mint KAIRO based on USD amount using live price from LiquidityPool
     * @param recipient Address to receive minted KAIRO
     * @param usdAmount USD amount (18 decimals) to convert to KAIRO
     */
    function mintTo(address recipient, uint256 usdAmount) external onlyRole(MINTER_ROLE) {
        require(recipient != address(0), "KAIROToken: Invalid recipient");
        require(usdAmount > 0, "KAIROToken: Invalid USD amount");
        require(liquidityPool != address(0), "KAIROToken: LP not set");

        uint256 livePrice = ILiquidityPool(liquidityPool).getLivePrice();
        require(livePrice > 0, "KAIROToken: Invalid price");

        uint256 kairoAmount = (usdAmount * 1e18) / livePrice;
        require(kairoAmount > 0, "KAIROToken: Mint amount too small");

        _mint(recipient, kairoAmount);

        emit MintedTo(recipient, usdAmount, kairoAmount);
    }

    /**
     * @dev Direct mint of exact KAIRO amount (for rewards, etc.)
     * @param to Address to receive minted KAIRO
     * @param amount Exact KAIRO amount to mint (18 decimals)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "KAIROToken: Invalid recipient");
        require(amount > 0, "KAIROToken: Invalid amount");
        _mint(to, amount);
    }

    // ============ Burn Functions ============

    /**
     * @dev Burn tokens from caller. Overridden to track total burned.
     *      Open to any holder (ERC20Burnable default) OR BURNER_ROLE.
     * @param amount Amount to burn
     */
    function burn(uint256 amount) public override {
        _totalBurned += amount;
        super.burn(amount);
    }

    /**
     * @dev Burn tokens from another account (requires allowance). Tracks total burned.
     * @param account Account to burn from
     * @param amount Amount to burn
     */
    function burnFrom(address account, uint256 amount) public override {
        _totalBurned += amount;
        super.burnFrom(account, amount);
    }

    // ============ View Functions ============

    /**
     * @dev Returns total amount of KAIRO tokens that have been burned
     * @return Total burned supply
     */
    function getTotalBurned() external view returns (uint256) {
        return _totalBurned;
    }

    /**
     * @dev Returns the social lock amount (10,000 KAIRO)
     * @return Social lock amount if applied, 0 otherwise
     */
    function getSocialLockAmount() external view returns (uint256) {
        return socialLockApplied ? SOCIAL_LOCK : 0;
    }

    /**
     * @dev Returns effective circulating supply: totalSupply - socialLock
     *      Used by LiquidityPool for price calculations
     * @return Effective supply
     */
    function getEffectiveSupply() external view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 locked = socialLockApplied ? SOCIAL_LOCK : 0;
        return supply > locked ? supply - locked : 0;
    }

    // ============ Internal Overrides (required by Solidity for multiple inheritance) ============

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
