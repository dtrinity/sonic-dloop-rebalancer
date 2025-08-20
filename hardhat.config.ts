import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import "hardhat-deploy";
import { config } from "dotenv";

config();

const hardhatConfig: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    sonic_testnet: {
      url: process.env.SONIC_TESTNET_RPC_URL || "https://rpc.testnet.soniclabs.com",
      chainId: 57054,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    sonic_mainnet: {
      url: process.env.SONIC_MAINNET_RPC_URL || "https://rpc.soniclabs.com",
      chainId: 146,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deployments: "./deployments",
    deploy: "./deploy",
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
};

export default hardhatConfig;
