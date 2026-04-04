// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AtomicP2p - Atomic Settlement P2P Trading
 * @notice Decentralized peer-to-peer escrow for KAIRO/USDT trades with instant settlement
 * @dev Zero-confirmation atomic swaps - trades settle instantly with mathematical certainty
 *      No dispute windows, no manual confirmations, pure trustless execution
 *      KAIRO fee burning for deflation
 */

interface ILiquidityPool {
    function getCurrentPrice() external view returns (uint256);
    function receiveP2PFee(uint256 amount) external;
}

interface IKAIROToken is IERC20 {
    function burn(uint256 amount) external;
}

contract AtomicP2p is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;
    using SafeERC20 for IKAIROToken;

    // ============ Role Definitions ============
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // ============ State Variables ============
    IKAIROToken public immutable kairoToken;
    IERC20 public immutable usdtToken;
    ILiquidityPool public immutable liquidityPool;

    uint256 public constant FEE_PERCENTAGE = 200; // 2% = 200 basis points
    uint256 public constant FEE_DENOMINATOR = 10000;

    uint256 public nextBuyOrderId = 1;
    uint256 public nextSellOrderId = 1;
    uint256 public nextTradeId = 1;

    // ============ Structs ============
    
    /// @notice Buy order - creator locks USDT, no price specified
    struct OrderBuy {
        address creator;
        uint256 usdtAmount;      // Total USDT locked
        uint256 usdtRemaining;   // USDT still available for matching
        bool active;
        uint256 createdAt;
    }

    /// @notice Sell order - creator locks KAIRO, no price specified
    struct OrderSell {
        address creator;
        uint256 kairoAmount;      // Total KAIRO locked
        uint256 kairoRemaining;   // KAIRO still available for matching
        bool active;
        uint256 createdAt;
    }

    /// @notice Atomic trade execution record (event-only, minimal storage)
    struct TradeExecution {
        uint256 buyOrderId;
        uint256 sellOrderId;
        address buyer;
        address seller;
        uint256 kairoAmount;
        uint256 usdtAmount;
        uint256 price;
        uint256 kairoFee;
        uint256 usdtFee;
        uint256 executedAt;
    }

    /// @dev Internal struct to reduce stack depth in trade execution
    struct TradeCalc {
        uint256 currentPrice;
        uint256 usdtRequired;
        uint256 usdtFee;
        uint256 kairoFee;
        uint256 netUsdt;
        uint256 netKairo;
    }

    // ============ Storage Mappings ============
    mapping(uint256 => OrderBuy) public buyOrders;
    mapping(uint256 => OrderSell) public sellOrders;
    mapping(uint256 => TradeExecution) public tradeHistory;

    // ============ Events ============
    
    event BuyOrderCreated(
        uint256 indexed orderId,
        address indexed creator,
        uint256 usdtAmount,
        uint256 timestamp
    );
    
    event SellOrderCreated(
        uint256 indexed orderId,
        address indexed creator,
        uint256 kairoAmount,
        uint256 timestamp
    );
    
    event OrderCancelled(
        uint256 indexed orderId,
        address indexed creator,
        bool isBuyOrder,
        uint256 refundedAmount
    );
    
    // Atomic trade execution event (comprehensive)
    event TradeExecuted(
        uint256 indexed tradeId,
        uint256 indexed buyOrderId,
        uint256 indexed sellOrderId,
        address buyer,
        address seller,
        uint256 kairoAmount,
        uint256 usdtAmount,
        uint256 price,
        uint256 kairoFee,
        uint256 usdtFee
    );
    
    event USDTFeeDistributed(uint256 indexed tradeId, uint256 feeAmount);
    event KAIROFeeBurned(uint256 indexed tradeId, uint256 feeAmount);
    
    event PartialFillExecuted(
        uint256 indexed orderId,
        bool isBuyOrder,
        uint256 filledAmount,
        uint256 remainingAmount
    );

    // ============ Constructor ============
    
    /**
     * @notice Initialize AtomicP2p with token addresses
     * @param _kairoToken KAIRO token contract address
     * @param _usdtToken USDT token contract address
     * @param _liquidityPool LiquidityPool contract address for pricing and fees
     */
    constructor(
        address _kairoToken,
        address _usdtToken,
        address _liquidityPool
    ) {
        require(_kairoToken != address(0), "Invalid KAIRO address");
        require(_usdtToken != address(0), "Invalid USDT address");
        require(_liquidityPool != address(0), "Invalid LiquidityPool address");

        kairoToken = IKAIROToken(_kairoToken);
        usdtToken = IERC20(_usdtToken);
        liquidityPool = ILiquidityPool(_liquidityPool);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ============ Order Creation ============

    /**
     * @notice Create a buy order by locking USDT
     * @dev Creator locks USDT, no price specified - matches at live LiquidityPool price
     * @param usdtAmount Amount of USDT to lock for buying KAIRO
     * @return orderId The ID of the created buy order
     */
    function createBuyOrder(uint256 usdtAmount)
        external
        nonReentrant
        returns (uint256 orderId)
    {
        require(usdtAmount > 0, "Amount must be positive");

        orderId = nextBuyOrderId++;

        // Lock USDT from creator
        usdtToken.safeTransferFrom(msg.sender, address(this), usdtAmount);

        buyOrders[orderId] = OrderBuy({
            creator: msg.sender,
            usdtAmount: usdtAmount,
            usdtRemaining: usdtAmount,
            active: true,
            createdAt: block.timestamp
        });

        emit BuyOrderCreated(orderId, msg.sender, usdtAmount, block.timestamp);
    }

    /**
     * @notice Create a sell order by locking KAIRO
     * @dev Creator locks KAIRO, no price specified - matches at live LiquidityPool price
     * @param kairoAmount Amount of KAIRO to lock for selling
     * @return orderId The ID of the created sell order
     */
    function createSellOrder(uint256 kairoAmount)
        external
        nonReentrant
        returns (uint256 orderId)
    {
        require(kairoAmount > 0, "Amount must be positive");

        orderId = nextSellOrderId++;

        // Lock KAIRO from creator
        kairoToken.safeTransferFrom(msg.sender, address(this), kairoAmount);

        sellOrders[orderId] = OrderSell({
            creator: msg.sender,
            kairoAmount: kairoAmount,
            kairoRemaining: kairoAmount,
            active: true,
            createdAt: block.timestamp
        });

        emit SellOrderCreated(orderId, msg.sender, kairoAmount, block.timestamp);
    }

    // ============ Order Cancellation ============

    /**
     * @notice Cancel a buy order and refund remaining USDT
     * @param orderId The buy order ID to cancel
     */
    function cancelBuyOrder(uint256 orderId) external nonReentrant {
        OrderBuy storage order = buyOrders[orderId];
        require(order.creator == msg.sender, "Not order creator");
        require(order.active, "Order not active");
        require(order.usdtRemaining > 0, "No funds to refund");

        uint256 refundAmount = order.usdtRemaining;
        order.usdtRemaining = 0;
        order.active = false;

        // Refund USDT
        usdtToken.safeTransfer(msg.sender, refundAmount);

        emit OrderCancelled(orderId, msg.sender, true, refundAmount);
    }

    /**
     * @notice Cancel a sell order and refund remaining KAIRO
     * @param orderId The sell order ID to cancel
     */
    function cancelSellOrder(uint256 orderId) external nonReentrant {
        OrderSell storage order = sellOrders[orderId];
        require(order.creator == msg.sender, "Not order creator");
        require(order.active, "Order not active");
        require(order.kairoRemaining > 0, "No funds to refund");

        uint256 refundAmount = order.kairoRemaining;
        order.kairoRemaining = 0;
        order.active = false;

        // Refund KAIRO
        kairoToken.safeTransfer(msg.sender, refundAmount);

        emit OrderCancelled(orderId, msg.sender, false, refundAmount);
    }

    // ============ Taker Execution Functions ============

    /**
     * @notice Sell KAIRO to an existing buy order (taker sells to maker)
     * @dev Caller provides KAIRO, receives USDT from escrow
     * @param buyOrderId The buy order ID to execute against
     * @param kairoAmount Amount of KAIRO to sell
     * @return tradeId Unique trade execution identifier
     */
    function sellToOrder(uint256 buyOrderId, uint256 kairoAmount) 
        external 
        nonReentrant 
        returns (uint256 tradeId) 
    {
        // ==========================================
        // VALIDATION PHASE
        // ==========================================
        
        OrderBuy storage buyOrder = buyOrders[buyOrderId];
        
        // 1. Order validation
        require(buyOrder.active, "P2P: Buy order inactive");
        require(buyOrder.creator != msg.sender, "P2P: Cannot trade with yourself");
        
        // 2. Amount validation
        require(kairoAmount > 0, "P2P: Invalid KAIRO amount");
        
        // 3. Get current price
        uint256 currentPrice = _getValidatedPrice();
        
        // 4. Calculate USDT required
        uint256 usdtRequired = (kairoAmount * currentPrice) / 1e18;
        require(usdtRequired > 0, "P2P: Invalid USDT calculation");
        require(usdtRequired <= buyOrder.usdtRemaining, "P2P: Insufficient USDT in buy order");
        
        // ==========================================
        // FEE CALCULATION
        // ==========================================
        
        uint256 usdtFee = (usdtRequired * FEE_PERCENTAGE) / FEE_DENOMINATOR; // 2% USDT fee
        uint256 kairoFee = (kairoAmount * FEE_PERCENTAGE) / FEE_DENOMINATOR;   // 2% KAIRO fee
        
        uint256 netUsdt = usdtRequired - usdtFee; // Net USDT to seller (caller)
        uint256 netKairo = kairoAmount - kairoFee;   // Net KAIRO to buyer (order creator)
        
        require(netUsdt > 0, "P2P: Net USDT too small");
        require(netKairo > 0, "P2P: Net KAIRO too small");
        
        // ==========================================
        // ATOMIC TRANSFERS
        // ==========================================
        
        tradeId = nextTradeId++;
        
        // 1. Transfer KAIRO from caller to contract
        kairoToken.safeTransferFrom(msg.sender, address(this), kairoAmount);
        
        // 2. Burn KAIRO fee for deflation
        kairoToken.burn(kairoFee);
        emit KAIROFeeBurned(tradeId, kairoFee);
        
        // 3. Transfer net KAIRO to buy order creator
        kairoToken.safeTransfer(buyOrder.creator, netKairo);
        
        // 4. Transfer USDT fee to LiquidityPool
        usdtToken.safeTransfer(address(liquidityPool), usdtFee);
        liquidityPool.receiveP2PFee(usdtFee);
        emit USDTFeeDistributed(tradeId, usdtFee);
        
        // 5. Transfer net USDT to seller (caller)
        usdtToken.safeTransfer(msg.sender, netUsdt);
        
        // ==========================================
        // UPDATE BUY ORDER STATE
        // ==========================================
        
        uint256 newBuyRemaining = buyOrder.usdtRemaining - usdtRequired;
        buyOrder.usdtRemaining = newBuyRemaining;
        buyOrder.active = newBuyRemaining > 0;
        
        if (newBuyRemaining > 0) {
            emit PartialFillExecuted(buyOrderId, true, usdtRequired, newBuyRemaining);
        }
        
        // ==========================================
        // RECORD TRADE HISTORY
        // ==========================================
        
        tradeHistory[tradeId] = TradeExecution({
            buyOrderId: buyOrderId,
            sellOrderId: 0, // No sell order (taker is seller)
            buyer: buyOrder.creator,
            seller: msg.sender,
            kairoAmount: kairoAmount,
            usdtAmount: usdtRequired,
            price: currentPrice,
            kairoFee: kairoFee,
            usdtFee: usdtFee,
            executedAt: block.timestamp
        });
        
        // ==========================================
        // EVENT EMISSION
        // ==========================================
        
        emit TradeExecuted(
            tradeId,
            buyOrderId,
            0, // sellOrderId = 0 (taker)
            buyOrder.creator,
            msg.sender,
            kairoAmount,
            usdtRequired,
            currentPrice,
            kairoFee,
            usdtFee
        );
        
        return tradeId;
    }

    /**
     * @notice Buy KAIRO from an existing sell order (taker buys from maker)
     * @dev Caller provides USDT, receives KAIRO from escrow
     * @param sellOrderId The sell order ID to execute against
     * @param kairoAmount Amount of KAIRO to buy
     * @return tradeId Unique trade execution identifier
     */
    function buyFromOrder(uint256 sellOrderId, uint256 kairoAmount) 
        external 
        nonReentrant 
        returns (uint256 tradeId) 
    {
        // ==========================================
        // VALIDATION PHASE
        // ==========================================
        
        OrderSell storage sellOrder = sellOrders[sellOrderId];
        
        // 1. Order validation
        require(sellOrder.active, "P2P: Sell order inactive");
        require(sellOrder.creator != msg.sender, "P2P: Cannot trade with yourself");
        
        // 2. Amount validation
        require(kairoAmount > 0, "P2P: Invalid KAIRO amount");
        require(kairoAmount <= sellOrder.kairoRemaining, "P2P: Insufficient KAIRO in sell order");
        
        // 3. Get current price
        uint256 currentPrice = _getValidatedPrice();
        
        // 4. Calculate USDT required
        uint256 usdtRequired = (kairoAmount * currentPrice) / 1e18;
        require(usdtRequired > 0, "P2P: Invalid USDT calculation");
        
        // ==========================================
        // FEE CALCULATION
        // ==========================================
        
        uint256 usdtFee = (usdtRequired * FEE_PERCENTAGE) / FEE_DENOMINATOR; // 2% USDT fee
        uint256 kairoFee = (kairoAmount * FEE_PERCENTAGE) / FEE_DENOMINATOR;   // 2% KAIRO fee
        
        uint256 netUsdt = usdtRequired - usdtFee; // Net USDT to seller (order creator)
        uint256 netKairo = kairoAmount - kairoFee;   // Net KAIRO to buyer (caller)
        
        require(netUsdt > 0, "P2P: Net USDT too small");
        require(netKairo > 0, "P2P: Net KAIRO too small");
        
        // ==========================================
        // ATOMIC TRANSFERS
        // ==========================================
        
        tradeId = nextTradeId++;
        
        // 1. Transfer USDT from caller to contract
        usdtToken.safeTransferFrom(msg.sender, address(this), usdtRequired);
        
        // 2. Transfer USDT fee to LiquidityPool
        usdtToken.safeTransfer(address(liquidityPool), usdtFee);
        liquidityPool.receiveP2PFee(usdtFee);
        emit USDTFeeDistributed(tradeId, usdtFee);
        
        // 3. Transfer net USDT to sell order creator
        usdtToken.safeTransfer(sellOrder.creator, netUsdt);
        
        // 4. Burn KAIRO fee for deflation
        kairoToken.burn(kairoFee);
        emit KAIROFeeBurned(tradeId, kairoFee);
        
        // 5. Transfer net KAIRO to buyer (caller)
        kairoToken.safeTransfer(msg.sender, netKairo);
        
        // ==========================================
        // UPDATE SELL ORDER STATE
        // ==========================================
        
        uint256 newSellRemaining = sellOrder.kairoRemaining - kairoAmount;
        sellOrder.kairoRemaining = newSellRemaining;
        sellOrder.active = newSellRemaining > 0;
        
        if (newSellRemaining > 0) {
            emit PartialFillExecuted(sellOrderId, false, kairoAmount, newSellRemaining);
        }
        
        // ==========================================
        // RECORD TRADE HISTORY
        // ==========================================
        
        tradeHistory[tradeId] = TradeExecution({
            buyOrderId: 0, // No buy order (taker is buyer)
            sellOrderId: sellOrderId,
            buyer: msg.sender,
            seller: sellOrder.creator,
            kairoAmount: kairoAmount,
            usdtAmount: usdtRequired,
            price: currentPrice,
            kairoFee: kairoFee,
            usdtFee: usdtFee,
            executedAt: block.timestamp
        });
        
        // ==========================================
        // EVENT EMISSION
        // ==========================================
        
        emit TradeExecuted(
            tradeId,
            0, // buyOrderId = 0 (taker)
            sellOrderId,
            msg.sender,
            sellOrder.creator,
            kairoAmount,
            usdtRequired,
            currentPrice,
            kairoFee,
            usdtFee
        );
        
        return tradeId;
    }

    // ============ Atomic Trade Execution ============

    /**
     * @notice Execute instant atomic trade between buy/sell orders
     * @dev Zero-confirmation settlement with immediate fee distribution
     *      All transfers succeed atomically or entire transaction reverts
     * @param buyOrderId Buy order identifier
     * @param sellOrderId Sell order identifier  
     * @param kairoFillAmount Exact KAIRO amount to trade
     * @return tradeId Unique trade execution identifier
     */
    function executeTrade(
        uint256 buyOrderId,
        uint256 sellOrderId,
        uint256 kairoFillAmount
    ) external nonReentrant returns (uint256 tradeId) {
        OrderBuy storage buyOrder = buyOrders[buyOrderId];
        OrderSell storage sellOrder = sellOrders[sellOrderId];
        
        // Validate orders and calculate trade
        TradeCalc memory calc = _validateAndCalculateTrade(
            buyOrder, sellOrder, kairoFillAmount
        );
        
        // Generate trade ID and execute atomic settlement
        tradeId = nextTradeId++;
        _executeAtomicSettlement(
            tradeId,
            buyOrder,
            sellOrder,
            calc.netKairo,
            calc.netUsdt,
            calc.kairoFee,
            calc.usdtFee
        );
        
        // Update order states and emit events
        _updateOrderStates(
            buyOrderId, sellOrderId, buyOrder, sellOrder,
            calc.usdtRequired, kairoFillAmount
        );
        
        // Record and emit trade
        _recordAndEmitTrade(
            tradeId, buyOrderId, sellOrderId, buyOrder, sellOrder,
            kairoFillAmount, calc
        );
        
        return tradeId;
    }
    
    /**
     * @dev Validate orders and calculate trade amounts
     */
    function _validateAndCalculateTrade(
        OrderBuy storage buyOrder,
        OrderSell storage sellOrder,
        uint256 kairoFillAmount
    ) internal view returns (TradeCalc memory calc) {
        // Order validation
        require(buyOrder.active, "P2P: Buy order inactive");
        require(sellOrder.active, "P2P: Sell order inactive");
        require(kairoFillAmount > 0, "P2P: Invalid fill amount");
        require(kairoFillAmount <= sellOrder.kairoRemaining, "P2P: Insufficient KAIRO in sell order");
        require(buyOrder.creator != sellOrder.creator, "P2P: Cannot trade with yourself");
        
        // Price and USDT calculation
        calc.currentPrice = _getValidatedPrice();
        calc.usdtRequired = (kairoFillAmount * calc.currentPrice) / 1e18;
        require(calc.usdtRequired > 0, "P2P: Invalid USDT calculation");
        require(calc.usdtRequired <= buyOrder.usdtRemaining, "P2P: Insufficient USDT in buy order");
        
        // Fee calculation (2% on both sides)
        calc.usdtFee = (calc.usdtRequired * FEE_PERCENTAGE) / FEE_DENOMINATOR;
        calc.kairoFee = (kairoFillAmount * FEE_PERCENTAGE) / FEE_DENOMINATOR;
        calc.netUsdt = calc.usdtRequired - calc.usdtFee;
        calc.netKairo = kairoFillAmount - calc.kairoFee;
        
        require(calc.netUsdt > 0, "P2P: Net USDT amount too small");
        require(calc.netKairo > 0, "P2P: Net KAIRO amount too small");
        
        return calc;
    }
    
    /**
     * @dev Update order states after trade execution
     */
    function _updateOrderStates(
        uint256 buyOrderId,
        uint256 sellOrderId,
        OrderBuy storage buyOrder,
        OrderSell storage sellOrder,
        uint256 usdtRequired,
        uint256 kairoFillAmount
    ) internal {
        uint256 newBuyRemaining = buyOrder.usdtRemaining - usdtRequired;
        uint256 newSellRemaining = sellOrder.kairoRemaining - kairoFillAmount;
        
        buyOrder.usdtRemaining = newBuyRemaining;
        sellOrder.kairoRemaining = newSellRemaining;
        buyOrder.active = newBuyRemaining > 0;
        sellOrder.active = newSellRemaining > 0;
        
        if (newBuyRemaining > 0) {
            emit PartialFillExecuted(buyOrderId, true, usdtRequired, newBuyRemaining);
        }
        if (newSellRemaining > 0) {
            emit PartialFillExecuted(sellOrderId, false, kairoFillAmount, newSellRemaining);
        }
    }
    
    /**
     * @dev Record trade history and emit event
     */
    function _recordAndEmitTrade(
        uint256 tradeId,
        uint256 buyOrderId,
        uint256 sellOrderId,
        OrderBuy storage buyOrder,
        OrderSell storage sellOrder,
        uint256 kairoFillAmount,
        TradeCalc memory calc
    ) internal {
        tradeHistory[tradeId] = TradeExecution({
            buyOrderId: buyOrderId,
            sellOrderId: sellOrderId,
            buyer: buyOrder.creator,
            seller: sellOrder.creator,
            kairoAmount: kairoFillAmount,
            usdtAmount: calc.usdtRequired,
            price: calc.currentPrice,
            kairoFee: calc.kairoFee,
            usdtFee: calc.usdtFee,
            executedAt: block.timestamp
        });
        
        emit TradeExecuted(
            tradeId,
            buyOrderId,
            sellOrderId,
            buyOrder.creator,
            sellOrder.creator,
            kairoFillAmount,
            calc.usdtRequired,
            calc.currentPrice,
            calc.kairoFee,
            calc.usdtFee
        );
    }
    
    /**
     * @dev Internal atomic settlement - all transfers succeed or transaction reverts
     * @param tradeId Trade identifier
     * @param buyOrder Buy order reference
     * @param sellOrder Sell order reference
     * @param netKairo KAIRO amount after fees
     * @param netUsdt USDT amount after fees
     * @param kairoFee KAIRO fee amount
     * @param usdtFee USDT fee amount
     */
    function _executeAtomicSettlement(
        uint256 tradeId,
        OrderBuy storage buyOrder,
        OrderSell storage sellOrder,
        uint256 netKairo,
        uint256 netUsdt,
        uint256 kairoFee,
        uint256 usdtFee
    ) internal {
        
        // ==========================================
        // TRANSFER SEQUENCE (ATOMIC)
        // All succeed together or all fail together
        // ==========================================
        
        // 1. FEE DISTRIBUTION TO LIQUIDITYPOOL (USDT)
        usdtToken.safeTransfer(address(liquidityPool), usdtFee);
        liquidityPool.receiveP2PFee(usdtFee);
        emit USDTFeeDistributed(tradeId, usdtFee);
        
        // 2. DEFLATIONARY BURN (KAIRO)
        kairoToken.burn(kairoFee);
        emit KAIROFeeBurned(tradeId, kairoFee);
        
        // 3. NET KAIRO TO BUYER
        kairoToken.safeTransfer(buyOrder.creator, netKairo);
        
        // 4. NET USDT TO SELLER
        usdtToken.safeTransfer(sellOrder.creator, netUsdt);
        
        // ==========================================
        // SETTLEMENT COMPLETE
        // If we reach here, all transfers succeeded
        // If any fail, entire transaction reverts
        // ==========================================
    }
    
    /**
     * @dev Enhanced price validation from LiquidityPool
     * @return price Validated current price
     */
    function _getValidatedPrice() internal view returns (uint256 price) {
        price = liquidityPool.getCurrentPrice();
        
        // Sanity checks
        require(price > 0, "P2P: Zero price from oracle");
        require(price < 1000e18, "P2P: Price too high (>1000 USDT/KAIRO)");
        require(price > 1e12, "P2P: Price too low (<0.000001 USDT/KAIRO)");
        
        return price;
    }

    // ============ View Functions ============

    /**
     * @notice Get buy order details
     * @param orderId The buy order ID
     * @return Order details
     */
    function getBuyOrder(uint256 orderId) 
        external 
        view 
        returns (OrderBuy memory) 
    {
        return buyOrders[orderId];
    }

    /**
     * @notice Get sell order details
     * @param orderId The sell order ID
     * @return Order details
     */
    function getSellOrder(uint256 orderId) 
        external 
        view 
        returns (OrderSell memory) 
    {
        return sellOrders[orderId];
    }

    /**
     * @notice Get trade execution history
     * @param tradeId The trade ID
     * @return Trade execution details
     */
    function getTrade(uint256 tradeId) 
        external 
        view 
        returns (TradeExecution memory) 
    {
        return tradeHistory[tradeId];
    }

    /**
     * @notice Get current LiquidityPool price
     * @return Current KAIRO/USDT price from LiquidityPool
     */
    function getCurrentPrice() external view returns (uint256) {
        return liquidityPool.getCurrentPrice();
    }

    /**
     * @notice Calculate USDT equivalent for given KAIRO amount at current price
     * @param kairoAmount Amount of KAIRO
     * @return USDT equivalent
     */
    function calculateUSDTForKAIRO(uint256 kairoAmount) 
        external 
        view 
        returns (uint256) 
    {
        uint256 currentPrice = liquidityPool.getCurrentPrice();
        return (kairoAmount * currentPrice) / 1e18;
    }

    /**
     * @notice Calculate KAIRO equivalent for given USDT amount at current price
     * @param usdtAmount Amount of USDT
     * @return KAIRO equivalent
     */
    function calculateKAIROForUSDT(uint256 usdtAmount) 
        external 
        view 
        returns (uint256) 
    {
        uint256 currentPrice = liquidityPool.getCurrentPrice();
        require(currentPrice > 0, "Invalid price");
        return (usdtAmount * 1e18) / currentPrice;
    }
    
    /**
     * @notice Simulate a trade to check feasibility and calculate outputs
     * @param buyOrderId Buy order to match
     * @param sellOrderId Sell order to match
     * @param kairoAmount Amount of KAIRO to trade
     * @return netKairoToBuyer KAIRO buyer receives after fees
     * @return netUsdtToSeller USDT seller receives after fees
     * @return kairoFee Fee to be burned
     * @return usdtFee Fee to LiquidityPool
     * @return canExecute Whether trade is executable
     */
    function simulateTrade(
        uint256 buyOrderId,
        uint256 sellOrderId,
        uint256 kairoAmount
    ) external view returns (
        uint256 netKairoToBuyer,
        uint256 netUsdtToSeller,
        uint256 kairoFee,
        uint256 usdtFee,
        bool canExecute
    ) {
        OrderBuy storage buyOrder = buyOrders[buyOrderId];
        OrderSell storage sellOrder = sellOrders[sellOrderId];
        
        // Check executability
        canExecute = buyOrder.active && 
                     sellOrder.active && 
                     kairoAmount > 0 &&
                     kairoAmount <= sellOrder.kairoRemaining &&
                     buyOrder.creator != sellOrder.creator;
        
        if (!canExecute) {
            return (0, 0, 0, 0, false);
        }
        
        // Calculate trade details
        uint256 currentPrice = liquidityPool.getCurrentPrice();
        uint256 usdtRequired = (kairoAmount * currentPrice) / 1e18;
        
        canExecute = canExecute && 
                     (usdtRequired > 0) &&
                     (usdtRequired <= buyOrder.usdtRemaining);
        
        if (!canExecute) {
            return (0, 0, 0, 0, false);
        }
        
        // Calculate fees
        kairoFee = (kairoAmount * FEE_PERCENTAGE) / FEE_DENOMINATOR;
        usdtFee = (usdtRequired * FEE_PERCENTAGE) / FEE_DENOMINATOR;
        
        netKairoToBuyer = kairoAmount - kairoFee;
        netUsdtToSeller = usdtRequired - usdtFee;
    }
    
    /**
     * @notice Get best available buy price from order book
     * @return bestPrice Best buy price available
     * @return orderId Associated order ID
     * @return usdtAvailable USDT available at this price
     */
    function getBestBuyPrice() external view returns (
        uint256 bestPrice,
        uint256 orderId,
        uint256 usdtAvailable
    ) {
        uint256 currentPrice = liquidityPool.getCurrentPrice();
        uint256 maxLiquidity = 0;
        
        for (uint256 i = 1; i < nextBuyOrderId; i++) {
            OrderBuy storage order = buyOrders[i];
            if (order.active && order.usdtRemaining > 0) {
                if (order.usdtRemaining > maxLiquidity) {
                    maxLiquidity = order.usdtRemaining;
                    orderId = i;
                    usdtAvailable = order.usdtRemaining;
                    bestPrice = currentPrice;
                }
            }
        }
    }
    
    /**
     * @notice Get best available sell price from order book
     * @return bestPrice Best sell price available
     * @return orderId Associated order ID
     * @return kairoAvailable KAIRO available at this price
     */
    function getBestSellPrice() external view returns (
        uint256 bestPrice,
        uint256 orderId,
        uint256 kairoAvailable
    ) {
        uint256 currentPrice = liquidityPool.getCurrentPrice();
        uint256 maxLiquidity = 0;
        
        for (uint256 i = 1; i < nextSellOrderId; i++) {
            OrderSell storage order = sellOrders[i];
            if (order.active && order.kairoRemaining > 0) {
                if (order.kairoRemaining > maxLiquidity) {
                    maxLiquidity = order.kairoRemaining;
                    orderId = i;
                    kairoAvailable = order.kairoRemaining;
                    bestPrice = currentPrice;
                }
            }
        }
    }

    // ============ User Query Functions ============

    /**
     * @notice Get all trade IDs for a user
     * @param user The user address
     * @return tradeIds Array of trade IDs the user is involved in
     */
    function getUserTrades(address user) external view returns (uint256[] memory tradeIds) {
        uint256 count = 0;
        
        // First pass: count trades
        for (uint256 i = 1; i < nextTradeId; i++) {
            TradeExecution storage trade = tradeHistory[i];
            if (trade.buyer == user || trade.seller == user) {
                count++;
            }
        }
        
        // Second pass: fill array
        tradeIds = new uint256[](count);
        uint256 index = 0;
        
        for (uint256 i = 1; i < nextTradeId; i++) {
            TradeExecution storage trade = tradeHistory[i];
            if (trade.buyer == user || trade.seller == user) {
                tradeIds[index] = i;
                index++;
            }
        }
    }

    /**
     * @notice Get all order IDs for a user
     * @param user The user address
     * @return buyOrderIds Array of buy order IDs
     * @return sellOrderIds Array of sell order IDs
     */
    function getUserOrders(address user) external view returns (
        uint256[] memory buyOrderIds,
        uint256[] memory sellOrderIds
    ) {
        uint256 buyCount = 0;
        uint256 sellCount = 0;
        
        // First pass: count orders
        for (uint256 i = 1; i < nextBuyOrderId; i++) {
            if (buyOrders[i].creator == user) {
                buyCount++;
            }
        }
        
        for (uint256 i = 1; i < nextSellOrderId; i++) {
            if (sellOrders[i].creator == user) {
                sellCount++;
            }
        }
        
        // Second pass: fill arrays
        buyOrderIds = new uint256[](buyCount);
        sellOrderIds = new uint256[](sellCount);
        
        uint256 buyIndex = 0;
        uint256 sellIndex = 0;
        
        for (uint256 i = 1; i < nextBuyOrderId; i++) {
            if (buyOrders[i].creator == user) {
                buyOrderIds[buyIndex] = i;
                buyIndex++;
            }
        }
        
        for (uint256 i = 1; i < nextSellOrderId; i++) {
            if (sellOrders[i].creator == user) {
                sellOrderIds[sellIndex] = i;
                sellIndex++;
            }
        }
    }

    /**
     * @notice Get active buy orders with pagination
     * @param offset Starting index
     * @param limit Number of orders to return
     * @return activeOrders Array of active buy orders
     */
    function getActiveBuyOrders(uint256 offset, uint256 limit) 
        external 
        view 
        returns (OrderBuy[] memory activeOrders) 
    {
        uint256 count = 0;
        
        for (uint256 i = 1; i < nextBuyOrderId; i++) {
            if (buyOrders[i].active && buyOrders[i].usdtRemaining > 0) {
                count++;
            }
        }
        
        uint256 start = offset;
        uint256 end = offset + limit;
        if (end > count) end = count;
        uint256 resultSize = end > start ? end - start : 0;
        
        activeOrders = new OrderBuy[](resultSize);
        uint256 activeIndex = 0;
        uint256 resultIndex = 0;
        
        for (uint256 i = 1; i < nextBuyOrderId && resultIndex < resultSize; i++) {
            if (buyOrders[i].active && buyOrders[i].usdtRemaining > 0) {
                if (activeIndex >= start && activeIndex < end) {
                    activeOrders[resultIndex] = buyOrders[i];
                    resultIndex++;
                }
                activeIndex++;
            }
        }
    }

    /**
     * @notice Get active buy order IDs with pagination
     * @param offset Starting index
     * @param limit Number of IDs to return
     * @return orderIds Array of active buy order IDs
     */
    function getActiveBuyOrderIds(uint256 offset, uint256 limit) 
        external 
        view 
        returns (uint256[] memory orderIds) 
    {
        uint256 count = 0;
        
        for (uint256 i = 1; i < nextBuyOrderId; i++) {
            if (buyOrders[i].active && buyOrders[i].usdtRemaining > 0) {
                count++;
            }
        }
        
        uint256 start = offset;
        uint256 end = offset + limit;
        if (end > count) end = count;
        uint256 resultSize = end > start ? end - start : 0;
        
        orderIds = new uint256[](resultSize);
        uint256 activeIndex = 0;
        uint256 resultIndex = 0;
        
        for (uint256 i = 1; i < nextBuyOrderId && resultIndex < resultSize; i++) {
            if (buyOrders[i].active && buyOrders[i].usdtRemaining > 0) {
                if (activeIndex >= start && activeIndex < end) {
                    orderIds[resultIndex] = i;
                    resultIndex++;
                }
                activeIndex++;
            }
        }
    }

    /**
     * @notice Get active sell orders with pagination
     * @param offset Starting index
     * @param limit Number of orders to return
     * @return activeOrders Array of active sell orders
     */
    function getActiveSellOrders(uint256 offset, uint256 limit) 
        external 
        view 
        returns (OrderSell[] memory activeOrders) 
    {
        uint256 count = 0;
        
        for (uint256 i = 1; i < nextSellOrderId; i++) {
            if (sellOrders[i].active && sellOrders[i].kairoRemaining > 0) {
                count++;
            }
        }
        
        uint256 start = offset;
        uint256 end = offset + limit;
        if (end > count) end = count;
        uint256 resultSize = end > start ? end - start : 0;
        
        activeOrders = new OrderSell[](resultSize);
        uint256 activeIndex = 0;
        uint256 resultIndex = 0;
        
        for (uint256 i = 1; i < nextSellOrderId && resultIndex < resultSize; i++) {
            if (sellOrders[i].active && sellOrders[i].kairoRemaining > 0) {
                if (activeIndex >= start && activeIndex < end) {
                    activeOrders[resultIndex] = sellOrders[i];
                    resultIndex++;
                }
                activeIndex++;
            }
        }
    }

    /**
     * @notice Get active sell order IDs with pagination
     * @param offset Starting index
     * @param limit Number of IDs to return
     * @return orderIds Array of active sell order IDs
     */
    function getActiveSellOrderIds(uint256 offset, uint256 limit) 
        external 
        view 
        returns (uint256[] memory orderIds) 
    {
        uint256 count = 0;
        
        for (uint256 i = 1; i < nextSellOrderId; i++) {
            if (sellOrders[i].active && sellOrders[i].kairoRemaining > 0) {
                count++;
            }
        }
        
        uint256 start = offset;
        uint256 end = offset + limit;
        if (end > count) end = count;
        uint256 resultSize = end > start ? end - start : 0;
        
        orderIds = new uint256[](resultSize);
        uint256 activeIndex = 0;
        uint256 resultIndex = 0;
        
        for (uint256 i = 1; i < nextSellOrderId && resultIndex < resultSize; i++) {
            if (sellOrders[i].active && sellOrders[i].kairoRemaining > 0) {
                if (activeIndex >= start && activeIndex < end) {
                    orderIds[resultIndex] = i;
                    resultIndex++;
                }
                activeIndex++;
            }
        }
    }

    // ============ Statistics Functions ============

    /**
     * @notice Get order book statistics
     * @return totalBuyOrders Total buy orders created
     * @return totalSellOrders Total sell orders created
     * @return totalTrades Total trades executed
     * @return activeBuyOrders Number of active buy orders
     * @return activeSellOrders Number of active sell orders
     */
    function getOrderBookStats() external view returns (
        uint256 totalBuyOrders,
        uint256 totalSellOrders,
        uint256 totalTrades,
        uint256 activeBuyOrders,
        uint256 activeSellOrders
    ) {
        totalBuyOrders = nextBuyOrderId - 1;
        totalSellOrders = nextSellOrderId - 1;
        totalTrades = nextTradeId - 1;
        
        for (uint256 i = 1; i < nextBuyOrderId; i++) {
            if (buyOrders[i].active) activeBuyOrders++;
        }
        
        for (uint256 i = 1; i < nextSellOrderId; i++) {
            if (sellOrders[i].active) activeSellOrders++;
        }
    }

    /**
     * @notice Get total liquidity in the order book
     * @return totalBuyLiquidity Total USDT locked in buy orders
     * @return totalSellLiquidity Total KAIRO locked in sell orders
     */
    function getTotalLiquidity() external view returns (
        uint256 totalBuyLiquidity,
        uint256 totalSellLiquidity
    ) {
        for (uint256 i = 1; i < nextBuyOrderId; i++) {
            if (buyOrders[i].active) {
                totalBuyLiquidity += buyOrders[i].usdtRemaining;
            }
        }
        
        for (uint256 i = 1; i < nextSellOrderId; i++) {
            if (sellOrders[i].active) {
                totalSellLiquidity += sellOrders[i].kairoRemaining;
            }
        }
    }
}