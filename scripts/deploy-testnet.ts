import { ethers } from "hardhat";

/**
 * KAIRO DeFi Ecosystem - Testnet Deployment Script
 * 
 * Deploys all contracts with MockUSDT, seeds liquidity,
 * and runs optional test transactions to verify the setup.
 * 
 * Usage: npx hardhat run scripts/deploy-testnet.ts --network opbnbTestnet
 *    or: npx hardhat run scripts/deploy-testnet.ts --network hardhat
 */
async function main() {
    const [deployer, testUser] = await ethers.getSigners();
    console.log("=== KAIRO DeFi Ecosystem - TESTNET Deployment ===");
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("Deployer:", deployer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");
    console.log("");

    const systemWallet = process.env.SYSTEM_WALLET || deployer.address;

    // ============================================================
    // PHASE 1: Deploy all contracts
    // ============================================================
    console.log("--- PHASE 1: Contract Deployment ---");
    console.log("");

    // 1. MockUSDT - constructor() mints 1M to deployer
    console.log("[1/8] Deploying MockUSDT...");
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const mockUSDT = await MockUSDT.deploy();
    await mockUSDT.waitForDeployment();
    const usdtAddress = await mockUSDT.getAddress();
    console.log("  MockUSDT:", usdtAddress);

    // 2. KAIROToken - constructor(address _admin)
    console.log("[2/8] Deploying KAIROToken...");
    const KAIROToken = await ethers.getContractFactory("KAIROToken");
    const kairoToken = await KAIROToken.deploy(deployer.address);
    await kairoToken.waitForDeployment();
    const kairoAddress = await kairoToken.getAddress();
    console.log("  KAIROToken:", kairoAddress);

    // 3. LiquidityPool - constructor(address _kairoToken, address _usdtToken)
    console.log("[3/8] Deploying LiquidityPool...");
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await LiquidityPool.deploy(kairoAddress, usdtAddress);
    await liquidityPool.waitForDeployment();
    const liquidityPoolAddress = await liquidityPool.getAddress();
    console.log("  LiquidityPool:", liquidityPoolAddress);

    // 4. Configure KAIROToken
    console.log("[4/8] Configuring KAIROToken...");
    let tx = await kairoToken.setLiquidityPool(liquidityPoolAddress);
    await tx.wait();
    console.log("  LiquidityPool -> LiquidityPool");
    tx = await kairoToken.mintInitialSupply();
    await tx.wait();
    console.log("  Social lock: 10,000 KAIRO minted to LiquidityPool");

    // 5. AffiliateDistributor - constructor(address _kairoToken, address _liquidityPool, address _admin, address _systemWallet)
    console.log("[5/8] Deploying AffiliateDistributor...");
    const AffiliateDistributor = await ethers.getContractFactory("AffiliateDistributor");
    const affiliateDistributor = await AffiliateDistributor.deploy(
        kairoAddress, liquidityPoolAddress, deployer.address, systemWallet
    );
    await affiliateDistributor.waitForDeployment();
    const affiliateAddress = await affiliateDistributor.getAddress();
    console.log("  AffiliateDistributor:", affiliateAddress);

    // 6. StakingManager - constructor(address _kairoToken, address _liquidityPool, address _usdt, address _systemWallet, address _admin)
    console.log("[6/8] Deploying StakingManager...");
    const StakingManager = await ethers.getContractFactory("StakingManager");
    const stakingManager = await StakingManager.deploy(
        kairoAddress, liquidityPoolAddress, usdtAddress, systemWallet, deployer.address
    );
    await stakingManager.waitForDeployment();
    const stakingAddress = await stakingManager.getAddress();
    console.log("  StakingManager:", stakingAddress);

    // Link StakingManager <-> AffiliateDistributor
    tx = await stakingManager.setAffiliateDistributor(affiliateAddress);
    await tx.wait();
    tx = await affiliateDistributor.setStakingManager(stakingAddress);
    await tx.wait();
    console.log("  StakingManager <-> AffiliateDistributor linked");

    // 7. CoreMembershipSubscription
    console.log("[7/8] Deploying CoreMembershipSubscription...");
    const CMS = await ethers.getContractFactory("CoreMembershipSubscription");
    const cms = await CMS.deploy(
        kairoAddress, usdtAddress, liquidityPoolAddress,
        stakingAddress, affiliateAddress, systemWallet, deployer.address
    );
    await cms.waitForDeployment();
    const cmsAddress = await cms.getAddress();
    console.log("  CoreMembershipSubscription:", cmsAddress);

    // 8. AtomicP2p - constructor(address _kairoToken, address _usdtToken, address _liquidityPool)
    console.log("[8/8] Deploying AtomicP2p...");
    const AtomicP2p = await ethers.getContractFactory("AtomicP2p");
    const atomicP2p = await AtomicP2p.deploy(kairoAddress, usdtAddress, liquidityPoolAddress);
    await atomicP2p.waitForDeployment();
    const p2pAddress = await atomicP2p.getAddress();
    console.log("  AtomicP2p:", p2pAddress);
    console.log("");

    // ============================================================
    // PHASE 2: Grant all roles
    // ============================================================
    console.log("--- PHASE 2: Role Configuration ---");
    console.log("");

    // KAIROToken roles
    const MINTER_ROLE = await kairoToken.MINTER_ROLE();
    const BURNER_ROLE = await kairoToken.BURNER_ROLE();

    tx = await kairoToken.grantRole(MINTER_ROLE, stakingAddress);
    await tx.wait();
    console.log("  KAIROToken MINTER_ROLE -> StakingManager");

    tx = await kairoToken.grantRole(MINTER_ROLE, affiliateAddress);
    await tx.wait();
    console.log("  KAIROToken MINTER_ROLE -> AffiliateDistributor");

    tx = await kairoToken.grantRole(MINTER_ROLE, cmsAddress);
    await tx.wait();
    console.log("  KAIROToken MINTER_ROLE -> CMS");

    tx = await kairoToken.grantRole(BURNER_ROLE, liquidityPoolAddress);
    await tx.wait();
    console.log("  KAIROToken BURNER_ROLE -> LiquidityPool");

    tx = await kairoToken.grantRole(BURNER_ROLE, p2pAddress);
    await tx.wait();
    console.log("  KAIROToken BURNER_ROLE -> AtomicP2p");

    // AffiliateDistributor roles
    const RANK_UPDATER_ROLE = await affiliateDistributor.RANK_UPDATER_ROLE();
    tx = await affiliateDistributor.grantRole(RANK_UPDATER_ROLE, deployer.address);
    await tx.wait();
    console.log("  AffiliateDistributor RANK_UPDATER_ROLE -> deployer");

    // StakingManager roles
    const COMPOUNDER_ROLE = await stakingManager.COMPOUNDER_ROLE();
    tx = await stakingManager.grantRole(COMPOUNDER_ROLE, deployer.address);
    await tx.wait();
    console.log("  StakingManager COMPOUNDER_ROLE -> deployer");

    // LiquidityPool roles
    tx = await liquidityPool.grantCoreRole(stakingAddress);
    await tx.wait();
    console.log("  LiquidityPool CORE_ROLE -> StakingManager");

    tx = await liquidityPool.grantCoreRole(cmsAddress);
    await tx.wait();
    console.log("  LiquidityPool CORE_ROLE -> CMS");

    tx = await liquidityPool.grantP2PRole(p2pAddress);
    await tx.wait();
    console.log("  LiquidityPool P2P_ROLE -> AtomicP2p");
    console.log("");

    // ============================================================
    // PHASE 3: Seed testnet environment
    // ============================================================
    console.log("--- PHASE 3: Seed Testnet Environment ---");
    console.log("");

    // Mint extra USDT to deployer for testing
    tx = await mockUSDT.mint(deployer.address, ethers.parseEther("100000"));
    await tx.wait();
    console.log("  Minted 100,000 extra USDT to deployer");

    // Seed LiquidityPool with 10,000 USDT initial liquidity
    const INITIAL_LIQUIDITY = ethers.parseEther("10000");
    tx = await mockUSDT.transfer(liquidityPoolAddress, INITIAL_LIQUIDITY);
    await tx.wait();
    console.log("  Transferred 10,000 USDT to LiquidityPool for liquidity");

    const initialPrice = await liquidityPool.getLivePrice();
    console.log("  Initial KAIRO price:", ethers.formatEther(initialPrice), "USDT");

    // If testUser signer exists (hardhat network has multiple), set up a test user
    if (testUser) {
        console.log("");
        console.log("  Test user:", testUser.address);

        // Mint USDT to test user
        tx = await mockUSDT.mint(testUser.address, ethers.parseEther("50000"));
        await tx.wait();
        console.log("  Minted 50,000 USDT to test user");
    }
    console.log("");

    // ============================================================
    // PHASE 4: Optional test transactions (hardhat network only)
    // ============================================================
    const network = await ethers.provider.getNetwork();
    if (network.chainId === 31337n && testUser) {
        console.log("--- PHASE 4: Test Transactions (local hardhat) ---");
        console.log("");

        try {
            // Test: User approves and stakes 100 USDT
            const stakeAmount = ethers.parseEther("100");
            tx = await mockUSDT.connect(testUser).approve(stakingAddress, stakeAmount);
            await tx.wait();
            tx = await stakingManager.connect(testUser).stake(stakeAmount, ethers.ZeroAddress);
            await tx.wait();
            console.log("  [TEST] Test user staked 100 USDT (Tier 0)");

            // Verify stake
            const stakes = await stakingManager.getUserStakes(testUser.address);
            console.log("  [TEST] Stake active:", stakes[0].active, "| Amount:", ethers.formatEther(stakes[0].amount), "USDT");

            // Test: CMS subscription
            const subCost = ethers.parseEther("10"); // 10 USDT per sub
            tx = await mockUSDT.connect(testUser).approve(liquidityPoolAddress, subCost);
            await tx.wait();
            tx = await cms.connect(testUser).subscribe(1, ethers.ZeroAddress);
            await tx.wait();
            console.log("  [TEST] Test user purchased 1 CMS subscription");

            const subCount = await cms.getSubscriptionCount(testUser.address);
            console.log("  [TEST] Subscription count:", subCount.toString());

            // Check updated price after liquidity changes
            const updatedPrice = await liquidityPool.getLivePrice();
            console.log("  [TEST] Updated KAIRO price:", ethers.formatEther(updatedPrice), "USDT");

        } catch (error: any) {
            console.log("  [TEST] Some test transactions failed (non-critical):", error.message?.substring(0, 100));
        }
        console.log("");
    }

    // ============================================================
    // Final Summary
    // ============================================================
    console.log("=============================================");
    console.log("=== TESTNET DEPLOYMENT COMPLETE ===");
    console.log("=============================================");
    console.log("");
    console.log("Contract Addresses (copy for .env / frontend config):");
    console.log(`  MOCK_USDT_ADDRESS=${usdtAddress}`);
    console.log(`  KAIRO_TOKEN_ADDRESS=${kairoAddress}`);
    console.log(`  LIQUIDITY_POOL_ADDRESS=${liquidityPoolAddress}`);
    console.log(`  AFFILIATE_DISTRIBUTOR_ADDRESS=${affiliateAddress}`);
    console.log(`  STAKING_MANAGER_ADDRESS=${stakingAddress}`);
    console.log(`  CMS_ADDRESS=${cmsAddress}`);
    console.log(`  ATOMIC_P2P_ADDRESS=${p2pAddress}`);
    console.log(`  SYSTEM_WALLET=${systemWallet}`);
    console.log("");
    console.log("Next steps:");
    console.log("  1. Copy addresses above into your .env file");
    console.log("  2. Verify contracts on explorer (npx hardhat verify)");
    console.log("  3. Configure backend with COMPOUNDER_ROLE and RANK_UPDATER_ROLE keys");
    console.log("  4. Fund system wallet with gas for operations");
    console.log("=============================================");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Testnet deployment failed:", error);
        process.exit(1);
    });
