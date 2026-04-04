// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IKAIROToken is IERC20 {
    function burn(uint256 amount) external;
    function burnFrom(address account, uint256 amount) external;
    function mint(address to, uint256 amount) external;
    function mintTo(address recipient, uint256 usdAmount) external;
    function getTotalBurned() external view returns (uint256);
    function getSocialLockAmount() external view returns (uint256);
    function getEffectiveSupply() external view returns (uint256);
}

/**
 * @title LiquidityPool - "Mini-DEX" for KAIRO/USDT Trading (One-Way)
 * @dev Automated Market Maker with sophisticated pricing mechanism
 * Features:
 * - Dynamic pricing based on USDT balance and KAIRO supply
 * - 3% swap fees retained for price appreciation
 * - Social lock integration (5,000 KAIRO) for price stability
 * - Only KAIRO → USDT swaps allowed (one-way DEX for deflationary tokenomics)
 * - Slippage protection on all operations
 */
contract LiquidityPool is ReentrancyGuard, AccessControl {
    bytes32 public constant CORE_ROLE = keccak256("CORE_ROLE");
    bytes32 public constant REGISTRATION_ROLE = keccak256("REGISTRATION_ROLE");
    bytes32 public constant P2P_ROLE = keccak256("P2P_ROLE");
    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");
    
    // Token interfaces
    IKAIROToken public immutable kairoToken;
    IERC20 public immutable usdtToken;
    
    // Deployer address - permanently stored and cannot swap KAIRO
    address public immutable deployer;
    
    // Constants
    uint256 public constant SWAP_FEE_PERCENT = 3; // 3% swap fee
    uint256 public constant PRICE_PRECISION = 10**18;
    uint256 public constant SOCIAL_LOCK_AMOUNT = 5000 * 10**18; // 5,000 KAIRO
    
    // One-way DEX flag - USDT to KAIRO swaps disabled for deflationary tokenomics
    bool public constant USDT_TO_KAIRO_DISABLED = true;
    
    // Price tracking
    struct PriceSnapshot {
        uint256 price;
        uint256 timestamp;
        uint256 usdtBalance;
        uint256 kairoSupply;
    }
    
    mapping(uint256 => PriceSnapshot) public priceHistory;
    uint256 public currentSnapshotIndex;
    
    // Statistics
    struct SwapStats {
        uint256 totalKAIROSwapped;
        uint256 totalUSDTSwapped;
        uint256 totalFeesCollected;
        uint256 swapCount;
    }
    SwapStats public swapStats;
    
    // Events
    event KAIROSwapped(
        address indexed user,
        address indexed recipient,
        uint256 kairoAmount,
        uint256 usdtAmount,
        uint256 fee,
        uint256 price
    );
    
    event USDTSwapped(
        address indexed user,
        address indexed recipient,
        uint256 usdtAmount,
        uint256 kairoAmount,
        uint256 fee,
        uint256 price
    );
    
    event Swapped(
        address user,
        uint256 kairoAmount,
        uint256 usdtAmount,
        uint256 fee
    );
    
    event USDTWithdrawn(address indexed to, uint256 amount, uint256 timestamp);
    event PriceSnapshotUpdated(uint256 indexed snapshotId, uint256 price, uint256 timestamp);
    event RegistrationFeeReceived(uint256 amount, uint256 timestamp);
    event ForfeitedTierBonusReceived(uint256 amount, uint256 timestamp);
    event LiquidityPoolInitialized(address kairoToken, address usdtToken, uint256 timestamp);
    event DeployerSwapBlocked(address indexed deployer, uint256 attemptedAmount, uint256 timestamp);
    
    // Staking-specific events
    event StakingFundsReceived(uint256 amount, uint256 timestamp);
    event TeamGratuityPaid(address indexed recipient, uint256 amount, uint256 timestamp);
    event SupportPursePaid(address indexed recipient, uint256 amount, uint256 timestamp);
    event PrematureExitPaid(address indexed recipient, uint256 amount, uint256 timestamp);
    event P2PFeeReceived(uint256 amount, uint256 timestamp);
    
    // Pool balances for AchieversPools (0 = Elite, 1 = Peak)
    mapping(uint256 => uint256) public poolBalances;
    
    constructor(address _kairoToken, address _usdtToken) {
        require(_kairoToken != address(0), "LiquidityPool: Invalid KAIRO token");
        require(_usdtToken != address(0), "LiquidityPool: Invalid USDT token");
        
        kairoToken = IKAIROToken(_kairoToken);
        usdtToken = IERC20(_usdtToken);
        
        // Store deployer address permanently
        deployer = msg.sender;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        
        emit LiquidityPoolInitialized(_kairoToken, _usdtToken, block.timestamp);
    }
    
    /**
     * @dev Get USDT token address
     * @return USDT token address
     */
    function usdt() external view returns (address) {
        return address(usdtToken);
    }
    
    /**
     * @dev Get current KAIRO price based on LiquidityPool formula
     * P = USDT_balance / (KAIRO_effectiveSupply + 5000 KAIRO social lock)
     * @return price Current KAIRO price in USDT (with 18 decimals precision)
     */
    function getCurrentPrice() public view returns (uint256 price) {
        uint256 usdtBalance = usdtToken.balanceOf(address(this));
        uint256 kairoSupply = kairoToken.totalSupply();
        
        // Add 5000 KAIRO social lock to supply for price calculation
        uint256 effectiveSupply = kairoSupply;

        // Fix for division by zero when effectiveSupply is zero
        if (effectiveSupply == 0) {
            return 1e18; // 1 USDT per KAIRO fallback
        }
        
        price = (usdtBalance * PRICE_PRECISION) / effectiveSupply;
    }
    
    /**
     * @dev Get live KAIRO price (alias for getCurrentPrice)
     * @return Current KAIRO price in USDT (with 18 decimals precision)
     */
    function getLivePrice() public view returns (uint256) {
        return getCurrentPrice();
    }
    
    /**
     * @dev Swap KAIRO tokens for USDT (One-Way DEX)
     * @param kairoAmount Amount of KAIRO to swap
     * @param minUSDTOut Minimum USDT to receive (slippage protection)
     * @param recipient Address to receive USDT
     * @return usdtOut Amount of USDT received
     */
    function swapKAIROForUSDT(
        uint256 kairoAmount,
        uint256 minUSDTOut,
        address recipient
    ) external nonReentrant returns (uint256 usdtOut) {
        require(kairoAmount > 0, "LiquidityPool: Invalid KAIRO amount");
        require(recipient != address(0), "LiquidityPool: Invalid recipient");
        
        // DEPLOYER PROTECTION: Deployer cannot swap any KAIRO tokens
        if (msg.sender == deployer) {
            emit DeployerSwapBlocked(deployer, kairoAmount, block.timestamp);
            revert("LiquidityPool: Deployer cannot swap KAIRO tokens");
        }
        
        // Calculate USDT output before fees
        uint256 currentPrice = getCurrentPrice();
        uint256 grossUSDTOut = (kairoAmount * currentPrice) / PRICE_PRECISION;
        
        // Apply 3% swap fee
        uint256 swapFee = (grossUSDTOut * SWAP_FEE_PERCENT) / 100;
        usdtOut = grossUSDTOut - swapFee;
        
        // Slippage protection
        require(usdtOut >= minUSDTOut, "LiquidityPool: Slippage too high");
        
        // Verify USDT availability
        uint256 usdtBalance = usdtToken.balanceOf(address(this));
        require(usdtOut <= usdtBalance, "LiquidityPool: Insufficient USDT liquidity");
        
        // Execute swap - transfer KAIRO from user and burn it
        kairoToken.transferFrom(msg.sender, address(this), kairoAmount);
        kairoToken.burn(kairoAmount); // Burn received KAIRO
        usdtToken.transfer(recipient, usdtOut);
        
        // Update statistics
        swapStats.totalKAIROSwapped += kairoAmount;
        swapStats.totalFeesCollected += swapFee;
        swapStats.swapCount++;
        
        // Update price snapshot
        _updatePriceSnapshot();
        
        emit KAIROSwapped(msg.sender, recipient, kairoAmount, usdtOut, swapFee, currentPrice);
        emit Swapped(msg.sender, kairoAmount, usdtOut, swapFee);
        
        return usdtOut;
    }
    
    /**
     * @dev Swap USDT for KAIRO tokens - DISABLED FOR ONE-WAY DEX
     * @dev This function is permanently disabled to maintain deflationary tokenomics
     * @dev Only KAIRO → USDT swaps are allowed (KAIRO burning mechanism)
     * @param usdtAmount Amount of USDT to swap
     * @param minKAIROOut Minimum KAIRO to receive (slippage protection)
     * @param recipient Address to receive KAIRO
     * @return kairoOut Amount of KAIRO received
     */
    function swapUSDTForKAIRO(
        uint256 usdtAmount,
        uint256 minKAIROOut,
        address recipient
    ) external nonReentrant returns (uint256 kairoOut) {
        // ONE-WAY DEX: USDT → KAIRO swaps are permanently disabled
        require(!USDT_TO_KAIRO_DISABLED, "LiquidityPool: USDT to KAIRO swaps disabled - One-way DEX only");
        
        require(usdtAmount > 0, "LiquidityPool: Invalid USDT amount");
        require(recipient != address(0), "LiquidityPool: Invalid recipient");
        
        // Calculate KAIRO output before fees
        uint256 currentPrice = getCurrentPrice();
        uint256 grossKAIROOut = (usdtAmount * PRICE_PRECISION) / currentPrice;
        
        // Apply 3% swap fee
        uint256 swapFee = (grossKAIROOut * SWAP_FEE_PERCENT) / 100;
        kairoOut = grossKAIROOut - swapFee;
        
        // Slippage protection
        require(kairoOut >= minKAIROOut, "LiquidityPool: Slippage too high");
        
        // Execute swap
        usdtToken.transferFrom(msg.sender, address(this), usdtAmount);
        kairoToken.mint(recipient, kairoOut); // Mint new KAIRO
        
        // Update statistics
        swapStats.totalUSDTSwapped += usdtAmount;
        swapStats.totalFeesCollected += swapFee;
        swapStats.swapCount++;
        
        // Update price snapshot
        _updatePriceSnapshot();
        
        emit USDTSwapped(msg.sender, recipient, usdtAmount, kairoOut, swapFee, currentPrice);
        emit Swapped(msg.sender, kairoOut, usdtAmount, swapFee);
        
        return kairoOut;
    }
    
    /**
     * @dev Calculate minimum output for slippage protection
     * @param inputAmount Input amount
     * @param maxSlippagePercent Maximum acceptable slippage (0-100)
     * @param kairoToUsdt True if swapping KAIRO to USDT, false for USDT to KAIRO
     * @return minOutput Minimum acceptable output amount
     */
    function calculateMinOutput(
        uint256 inputAmount,
        uint256 maxSlippagePercent,
        bool kairoToUsdt
    ) external view returns (uint256 minOutput) {
        require(maxSlippagePercent <= 100, "LiquidityPool: Invalid slippage percentage");
        
        uint256 currentPrice = getCurrentPrice();
        uint256 grossOutput;
        
        if (kairoToUsdt) {
            grossOutput = (inputAmount * currentPrice) / PRICE_PRECISION;
        } else {
            grossOutput = (inputAmount * PRICE_PRECISION) / currentPrice;
        }
        
        // Apply fee
        uint256 fee = (grossOutput * SWAP_FEE_PERCENT) / 100;
        uint256 netOutput = grossOutput - fee;
        
        // Apply slippage tolerance
        uint256 slippageAmount = (netOutput * maxSlippagePercent) / 100;
        minOutput = netOutput - slippageAmount;
    }
    
    /**
     * @dev Calculate price impact of a potential swap
     * @param inputAmount Amount to swap
     * @param kairoToUsdt True if KAIRO to USDT, false if USDT to KAIRO
     * @return priceImpact Price impact percentage (with 18 decimals)
     */
    function calculatePriceImpact(
        uint256 inputAmount,
        bool kairoToUsdt
    ) external view returns (uint256 priceImpact) {
        uint256 currentPrice = getCurrentPrice();
        uint256 currentUSDTBalance = usdtToken.balanceOf(address(this));
        uint256 currentKAIROSupply = kairoToken.getEffectiveSupply();
        
        uint256 newUSDTBalance;
        uint256 newKAIROSupply;
        
        if (kairoToUsdt) {
            uint256 usdtOut = (inputAmount * currentPrice) / PRICE_PRECISION;
            uint256 fee = (usdtOut * SWAP_FEE_PERCENT) / 100;
            newUSDTBalance = currentUSDTBalance - (usdtOut - fee);
            newKAIROSupply = currentKAIROSupply - inputAmount;
        } else {
            newUSDTBalance = currentUSDTBalance + inputAmount;
            uint256 kairoOut = (inputAmount * PRICE_PRECISION) / currentPrice;
            uint256 fee = (kairoOut * SWAP_FEE_PERCENT) / 100;
            newKAIROSupply = currentKAIROSupply + (kairoOut - fee);
        }
        
        uint256 newPrice = (newUSDTBalance * PRICE_PRECISION) / newKAIROSupply;
        
        if (newPrice >= currentPrice) {
            priceImpact = ((newPrice - currentPrice) * PRICE_PRECISION) / currentPrice;
        } else {
            priceImpact = ((currentPrice - newPrice) * PRICE_PRECISION) / currentPrice;
        }
    }
    
    /**
     * @dev Withdraw USDT (only Core contract can call)
     * @param to Address to withdraw to
     * @param amount Amount to withdraw
     */
    function withdrawUSDT(address to, uint256 amount) external onlyRole(CORE_ROLE) {
        require(to != address(0), "LiquidityPool: Invalid recipient");
        require(amount > 0, "LiquidityPool: Invalid amount");
        
        uint256 balance = usdtToken.balanceOf(address(this));
        require(amount <= balance, "LiquidityPool: Insufficient balance");
        
        usdtToken.transfer(to, amount);
        emit USDTWithdrawn(to, amount, block.timestamp);
    }
    
    /**
     * @dev Receive registration fee (called by Registration contract)
     * @param amount Fee amount received
     */
    function receiveRegistrationFee(uint256 amount) external onlyRole(REGISTRATION_ROLE) {
        emit RegistrationFeeReceived(amount, block.timestamp);
    }
    
    /**
     * @dev Receive forfeited tier bonus
     * @param amount Forfeited bonus amount
     */
    function receiveForfeitedTierBonus(uint256 amount) external onlyRole(CORE_ROLE) {
        emit ForfeitedTierBonusReceived(amount, block.timestamp);
    }
    
    /**
     * @dev Receive staking funds (60% of staking amount)
     * @param amount Staking funds amount
     */
    function receiveStakingFunds(uint256 amount) external onlyRole(CORE_ROLE) {
        emit StakingFundsReceived(amount, block.timestamp);
    }
    
    /**
     * @dev Distribute Team Gratuity payment from LiquidityPool
     * @param recipient Recipient address
     * @param amount Amount to pay
     */
    function distributeTeamGratuity(address recipient, uint256 amount) external onlyRole(CORE_ROLE) {
        require(recipient != address(0), "LiquidityPool: Invalid recipient");
        require(amount > 0, "LiquidityPool: Invalid amount");
        
        uint256 balance = usdtToken.balanceOf(address(this));
        require(amount <= balance, "LiquidityPool: Insufficient balance");
        
        usdtToken.transfer(recipient, amount);
        emit TeamGratuityPaid(recipient, amount, block.timestamp);
    }
    
    /**
     * @dev Distribute Support Purse payment from LiquidityPool
     * @param recipient Recipient address
     * @param amount Amount to pay
     */
    function distributeSupportPurse(address recipient, uint256 amount) external onlyRole(CORE_ROLE) {
        require(recipient != address(0), "LiquidityPool: Invalid recipient");
        require(amount > 0, "LiquidityPool: Invalid amount");
        
        uint256 balance = usdtToken.balanceOf(address(this));
        require(amount <= balance, "LiquidityPool: Insufficient balance");
        
        usdtToken.transfer(recipient, amount);
        emit SupportPursePaid(recipient, amount, block.timestamp);
    }
    
    /**
     * @dev Get current balances
     * @return usdtBalance Current USDT balance
     * @return kairoBalance Current KAIRO balance
     */
    function getBalances() external view returns (uint256 usdtBalance, uint256 kairoBalance) {
        usdtBalance = usdtToken.balanceOf(address(this));
        kairoBalance = kairoToken.balanceOf(address(this));
    }
    
    /**
     * @dev Get total value locked in USDT terms
     * @return tvl Total value locked
     */
    function getTotalValueLocked() external view returns (uint256 tvl) {
        uint256 usdtBalance = usdtToken.balanceOf(address(this));
        uint256 kairoBalance = kairoToken.balanceOf(address(this));
        uint256 currentPrice = getCurrentPrice();
        
        tvl = usdtBalance + (kairoBalance * currentPrice / PRICE_PRECISION);
    }
    
    /**
     * @dev Get swap statistics
     * @return stats Current swap statistics
     */
    function getSwapStatistics() external view returns (SwapStats memory stats) {
        return swapStats;
    }
    
    /**
     * @dev Get price history
     * @param snapshotId Snapshot ID to retrieve
     * @return snapshot Price snapshot data
     */
    function getPriceHistory(uint256 snapshotId) external view returns (PriceSnapshot memory snapshot) {
        return priceHistory[snapshotId];
    }
    
    /**
     * @dev Get latest price snapshots
     * @param count Number of latest snapshots to return
     * @return snapshots Array of latest snapshots
     */
    function getLatestSnapshots(uint256 count) external view returns (PriceSnapshot[] memory snapshots) {
        if (count > currentSnapshotIndex) {
            count = currentSnapshotIndex;
        }
        
        snapshots = new PriceSnapshot[](count);
        for (uint256 i = 0; i < count; i++) {
            snapshots[i] = priceHistory[currentSnapshotIndex - i];
        }
    }
    
    /**
     * @dev Update price snapshot (internal)
     */
    function _updatePriceSnapshot() internal {
        currentSnapshotIndex++;
        priceHistory[currentSnapshotIndex] = PriceSnapshot({
            price: getCurrentPrice(),
            timestamp: block.timestamp,
            usdtBalance: usdtToken.balanceOf(address(this)),
            kairoSupply: kairoToken.getEffectiveSupply()
        });
        
        emit PriceSnapshotUpdated(currentSnapshotIndex, getCurrentPrice(), block.timestamp);
    }
    
    /**
     * @dev Get deployer address (permanently blocked from KAIRO swaps)
     * @return deployer address
     */
    function getDeployer() external view returns (address) {
        return deployer;
    }
    
    /**
     * @dev Check if an address is the deployer (blocked from swapping)
     * @param account Address to check
     * @return true if account is the deployer
     */
    function isDeployerBlocked(address account) external view returns (bool) {
        return account == deployer;
    }
    
    /**
     * @dev Grant CORE_ROLE to address
     * @param account Address to grant role to
     */
    function grantCoreRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(account != address(0), "LiquidityPool: Invalid account");
        grantRole(CORE_ROLE, account);
    }

    /**
     * @dev Grant REGISTRATION_ROLE to Registration contract
     * @param account Address to grant role to
     */
    function grantRegistrationRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(account != address(0), "LiquidityPool: Invalid account");
        grantRole(REGISTRATION_ROLE, account);
    }

    /**
     * @dev Grant P2P_ROLE to AtomicP2p contract
     * @param account Address to grant role to
     */
    function grantP2PRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(account != address(0), "LiquidityPool: Invalid account");
        grantRole(P2P_ROLE, account);
    }

    /**
     * @dev Receive P2P trading fee (called by AtomicP2p)
     * @param amount Fee amount received
     */
    function receiveP2PFee(uint256 amount) external onlyRole(P2P_ROLE) {
        emit P2PFeeReceived(amount, block.timestamp);
    }

    /**
     * @dev Grant POOL_ROLE to AchieversPools contract
     * @param account Address to grant role to
     */
    function grantPoolRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(account != address(0), "LiquidityPool: Invalid account");
        grantRole(POOL_ROLE, account);
    }

    // ============ AchieversPools Functions ============

    /**
     * @dev Reserve pool contribution (called by Staking via AchieversPools)
     * @param poolType 0 = Elite, 1 = Peak
     * @param amount USDT amount to reserve
     */
    function reservePoolContribution(uint256 poolType, uint256 amount) external onlyRole(POOL_ROLE) {
        poolBalances[poolType] += amount;
    }

    /**
     * @dev Distribute pool reward to recipient
     * @param recipient Reward recipient
     * @param poolType 0 = Elite, 1 = Peak  
     * @param amount USDT amount to distribute
     */
    function distributePoolReward(address recipient, uint256 poolType, uint256 amount) external onlyRole(POOL_ROLE) {
        require(recipient != address(0), "LiquidityPool: Invalid recipient");
        require(amount > 0, "LiquidityPool: Invalid amount");
        
        uint256 balance = usdtToken.balanceOf(address(this));
        require(amount <= balance, "LiquidityPool: Insufficient balance for pool reward");
        require(amount <= poolBalances[poolType], "LiquidityPool: Insufficient pool balance");
        
        poolBalances[poolType] -= amount;
        usdtToken.transfer(recipient, amount);
    }

    /**
     * @dev Get pool balance
     * @param poolType 0 = Elite, 1 = Peak
     * @return balance Current pool balance
     */
    function getPoolBalance(uint256 poolType) external view returns (uint256 balance) {
        return poolBalances[poolType];
    }

    // ============ Premature Exit Functions ============

    /**
     * @dev Distribute premature exit settlement to user
     * @param recipient Recipient address
     * @param amount USDT amount to pay
     */
    function distributePrematureExit(address recipient, uint256 amount) external onlyRole(CORE_ROLE) {
        require(recipient != address(0), "LiquidityPool: Invalid recipient");
        require(amount > 0, "LiquidityPool: Invalid amount");
        
        uint256 balance = usdtToken.balanceOf(address(this));
        require(amount <= balance, "LiquidityPool: Insufficient balance for premature exit");
        
        usdtToken.transfer(recipient, amount);
        emit PrematureExitPaid(recipient, amount, block.timestamp);
    }
}
