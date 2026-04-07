import { ethers } from "hardhat";

const TARGET = "0x6726F92AE08A26a411fAdC5B0bb8f0A28b6Dd7cA";

// v8 contract addresses (opBNB testnet)
const CMS_ADDR = "0xBb4E548A7665deB6A91DB886dE25A77b4663Df26";
const AFFILIATE_ADDR = "0x4aA618Abc4070273964ff2177C3B2fC9b7fe507D";
const STAKING_ADDR = "0x6a11f7F87391352e68B682127d44FAeaDFfCea33";
const LP_ADDR = "0xB7f59b37E2541fA39b7451e9FaA6Ba15714665B8";

async function main() {
  const cms = await ethers.getContractAt(
    [
      "function subscriptionCount(address) view returns (uint256)",
      "function loyaltyRewards(address) view returns (uint256)",
      "function leadershipRewards(address) view returns (uint256)",
      "function hasClaimed(address) view returns (bool)",
      "function referrerOf(address) view returns (address)",
      "function getClaimableRewards(address) view returns (uint256 loyalty, uint256 leadership, uint256 total)",
      "function REF_REWARDS(uint256) view returns (uint256)",
    ],
    CMS_ADDR
  );

  const affiliate = await ethers.getContractAt(
    [
      "function referrerOf(address) view returns (address)",
      "function directCount(address) view returns (uint256)",
    ],
    AFFILIATE_ADDR
  );

  const staking = await ethers.getContractAt(
    [
      "function getTotalActiveStakeValue(address) view returns (uint256)",
      "function getRemainingCap(address) view returns (uint256)",
    ],
    STAKING_ADDR
  );

  const lp = await ethers.getContractAt(
    ["function getLivePrice() view returns (uint256)"],
    LP_ADDR
  );

  const fmt = (v: bigint) => ethers.formatEther(v);
  const ZERO = ethers.ZeroAddress;

  console.log("=".repeat(70));
  console.log(`  CMS Leadership Bonus Inspector`);
  console.log(`  Target: ${TARGET}`);
  console.log("=".repeat(70));

  // ── Target info ──
  const subCount = await cms.subscriptionCount(TARGET);
  const loyalty = await cms.loyaltyRewards(TARGET);
  const leadership = await cms.leadershipRewards(TARGET);
  const claimed = await cms.hasClaimed(TARGET);
  const cmsRef = await cms.referrerOf(TARGET);
  const affRef = await affiliate.referrerOf(TARGET);
  const directs = await affiliate.directCount(TARGET);
  const activeStake = await staking.getTotalActiveStakeValue(TARGET);
  const remainCap = await staking.getRemainingCap(TARGET);
  const livePrice = await lp.getLivePrice();

  console.log("\n── TARGET STATUS ──");
  console.log(`  Subscriptions   : ${subCount}`);
  console.log(`  Loyalty Rewards : ${fmt(loyalty)} KAIRO`);
  console.log(`  Leadership Rwd  : ${fmt(leadership)} KAIRO`);
  console.log(`  Has Claimed     : ${claimed}`);
  console.log(`  CMS Referrer    : ${cmsRef}`);
  console.log(`  Affiliate Ref   : ${affRef}`);
  console.log(`  Direct Count    : ${directs}`);
  console.log(`  Active Stake    : $${fmt(activeStake)}`);
  console.log(`  Remaining Cap   : $${fmt(remainCap)}`);
  console.log(`  Live Price      : $${fmt(livePrice)}`);

  // ── Walk upline (as if TARGET just subscribed) ──
  console.log("\n── UPLINE LEADERSHIP ELIGIBILITY (if TARGET subscribes) ──");
  const refRewards = ["1.0", "0.5", "0.5", "0.25", "0.25"];
  let current = cmsRef !== ZERO ? cmsRef : affRef;

  for (let i = 0; i < 5; i++) {
    console.log(`\n  Level ${i + 1} (${refRewards[i]} KAIRO/sub):`);
    if (current === ZERO) {
      console.log(`    ❌ No referrer — chain ends`);
      break;
    }
    console.log(`    Referrer: ${current}`);

    const refSubs = await cms.subscriptionCount(current);
    const refDirects = await affiliate.directCount(current);
    const refStake = await staking.getTotalActiveStakeValue(current);
    const refCap = await staking.getRemainingCap(current);
    const unlockedLevels = refDirects > 5n ? 5n : refDirects;

    console.log(`    CMS Subs       : ${refSubs}  ${refSubs > 0n ? "✅" : "❌ FAIL — needs ≥1 CMS subscription"}`);
    console.log(`    Direct Count   : ${refDirects} → unlocks ${unlockedLevels} levels  ${BigInt(i) < unlockedLevels ? "✅" : `❌ FAIL — needs ≥${i + 1} directs to unlock level ${i + 1}`}`);
    console.log(`    Active Stake   : $${fmt(refStake)}  ${refStake > 0n ? "✅" : "❌ FAIL — no active stake"}`);
    console.log(`    Remaining Cap  : $${fmt(refCap)}  ${refCap > 0n ? "✅" : "❌ FAIL — 3X cap exhausted"}`);

    const eligible = refSubs > 0n && BigInt(i) < unlockedLevels && refStake > 0n && refCap > 0n;
    console.log(`    → ${eligible ? "✅ ELIGIBLE" : "❌ NOT ELIGIBLE"}`);

    // Next referrer
    const nextCms = await cms.referrerOf(current);
    if (nextCms !== ZERO) {
      current = nextCms;
    } else {
      try {
        const nextAff = await affiliate.referrerOf(current);
        current = nextAff;
      } catch {
        current = ZERO;
      }
    }
  }

  // ── Also check: who are target's downline (direct referrals in CMS)? ──
  console.log("\n── TARGET AS REFERRER (receiving leadership from downline) ──");
  const targetSubs = subCount;
  const targetDirects = directs;
  const targetStake = activeStake;
  const targetCap = remainCap;
  const unlockedForTarget = targetDirects > 5n ? 5n : targetDirects;

  console.log(`  CMS Subs        : ${targetSubs}  ${targetSubs > 0n ? "✅" : "❌ FAIL — needs ≥1 CMS subscription"}`);
  console.log(`  Direct Count    : ${targetDirects} → unlocks ${unlockedForTarget} levels  ${unlockedForTarget > 0n ? "✅" : "❌ FAIL — needs ≥1 direct to unlock level 1"}`);
  console.log(`  Active Stake    : $${fmt(targetStake)}  ${targetStake > 0n ? "✅" : "❌ FAIL — no active stake"}`);
  console.log(`  Remaining Cap   : $${fmt(targetCap)}  ${targetCap > 0n ? "✅" : "❌ FAIL — 3X cap exhausted"}`);

  const canReceive = targetSubs > 0n && unlockedForTarget > 0n && targetStake > 0n && targetCap > 0n;
  console.log(`\n  → ${canReceive ? "✅ CAN receive leadership bonus (up to level " + unlockedForTarget + ")" : "❌ CANNOT receive leadership bonus from downline"}`);

  console.log("\n" + "=".repeat(70));
}

main().catch(console.error);
