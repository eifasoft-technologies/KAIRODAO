import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("=== CMS Deadline Extension ===");
    console.log("Deployer:", deployer.address);

    const CMS_ADDRESS = "0xfaD1A8AfaFb0fF44f7Bd23f33d88E8a2c4B9B39A";

    // Attach to the deployed CMS contract
    const cms = await ethers.getContractAt("CoreMembershipSubscription", CMS_ADDRESS);

    // Read current deadline
    const currentDeadline = await cms.deadline();
    const currentDate = new Date(Number(currentDeadline) * 1000);
    console.log("Current deadline:", currentDeadline.toString(), `(${currentDate.toUTCString()})`);

    // Check if deadline has passed
    const now = Math.floor(Date.now() / 1000);
    console.log("Current time:", now, `(${new Date(now * 1000).toUTCString()})`);
    console.log("Deadline passed:", now >= Number(currentDeadline));

    // Set new deadline to 24 hours from now
    const TWENTY_FOUR_HOURS = 24 * 60 * 60;
    const newDeadline = now + TWENTY_FOUR_HOURS;
    const newDate = new Date(newDeadline * 1000);
    console.log("\nSetting new deadline to:", newDeadline, `(${newDate.toUTCString()})`);

    // Call extendDeadline
    const tx = await cms.extendDeadline(newDeadline);
    console.log("Transaction hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt?.blockNumber);

    // Verify the new deadline
    const updatedDeadline = await cms.deadline();
    const updatedDate = new Date(Number(updatedDeadline) * 1000);
    console.log("\nNew deadline verified:", updatedDeadline.toString(), `(${updatedDate.toUTCString()})`);

    // Check isDeadlinePassed
    const isPassed = await cms.isDeadlinePassed();
    console.log("Is deadline passed:", isPassed);

    console.log("\n=== Deadline extension complete! ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Failed:", error);
        process.exit(1);
    });
