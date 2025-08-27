import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { HardhatUserConfig } from "hardhat/config";
import { getEnvPrivateKeys } from "./typescript/named-accounts";

import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const config: HardhatUserConfig = {
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
      chainId: 1337,
    },
    sonic_mainnet: {
      url: "https://rpc.soniclabs.com",
      saveDeployments: true,
      deploy: ["deploy"],
      accounts: getEnvPrivateKeys("sonic_mainnet"),
    },
    sonic_testnet: {
      url: "https://rpc.sonic.fantom.network",
      saveDeployments: true,
      deploy: ["deploy-mocks", "deploy"],
      accounts: getEnvPrivateKeys("sonic_testnet"),
    },
  },
  gasReporter: {
    enabled: false,
    currency: "USD",
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
};

export default config;