import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    opbnbTestnet: {
      url: process.env.OPBNB_TESTNET_RPC || "https://opbnb-testnet.publicnode.com",
      chainId: 5611,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: 100000000, // 0.1 gwei
      timeout: 120000, // 2 minutes
      httpHeaders: {},
    },
    opbnbMainnet: {
      url: process.env.OPBNB_MAINNET_RPC || "https://opbnb-mainnet-rpc.bnbchain.org",
      chainId: 204,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: 100000000, // 0.1 gwei
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      opbnbTestnet: process.env.OPBNB_API_KEY || "",
      opbnbMainnet: process.env.OPBNB_API_KEY || "",
    },
    customChains: [
      {
        network: "opbnbTestnet",
        chainId: 5611,
        urls: {
          apiURL: "https://open-platform.nodereal.io/apiKey/op-bnb-testnet/contract/",
          browserURL: "https://testnet.opbnbscan.com/",
        },
      },
      {
        network: "opbnbMainnet",
        chainId: 204,
        urls: {
          apiURL: "https://open-platform.nodereal.io/apiKey/op-bnb-mainnet/contract/",
          browserURL: "https://opbnbscan.com/",
        },
      },
    ],
  },
};

export default config;
