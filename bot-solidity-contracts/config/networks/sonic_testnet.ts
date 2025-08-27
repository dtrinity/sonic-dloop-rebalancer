export const SONIC_TESTNET_CONFIG = {
  chainId: 64165, // Sonic testnet chain ID
  name: "sonic_testnet",

  contracts: {
    // External protocol contracts your bot interacts with
    dloopCore: process.env.DLOOP_CORE_ADDRESS || "0x0000000000000000000000000000000000000000",
    increaseOdos: process.env.INCREASE_ODOS_ADDRESS || "0x0000000000000000000000000000000000000000",
    decreaseOdos: process.env.DECREASE_ODOS_ADDRESS || "0x0000000000000000000000000000000000000000",
    odosRouter: process.env.ODOS_ROUTER_ADDRESS || "0x0000000000000000000000000000000000000000",
    flashLender: process.env.FLASH_LENDER_ADDRESS || "0x0000000000000000000000000000000000000000",

    // Your deployed contracts (update after deployment)
    yourBotContract: "0x0000000000000000000000000000000000000000",
  },

  deployment: {
    gasPrice: "auto",
    confirmations: 1,
  },

  blockExplorer: {
    name: "Sonic Testnet Explorer",
    url: "https://testnet.sonicscan.org",
    apiURL: "https://api.testnet.sonicscan.org",
    apiKey: process.env.SONICSCAN_API_KEY || "",
  },
};

export default SONIC_TESTNET_CONFIG;