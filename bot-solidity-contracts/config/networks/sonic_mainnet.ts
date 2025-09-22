export const SONIC_MAINNET_CONFIG = {
  name: "sonic_mainnet",

  contracts: {
    dloopCore: "0x0000000000000000000000000000000000000000",
    increaseOdos: "0x0000000000000000000000000000000000000000",
    decreaseOdos: "0x0000000000000000000000000000000000000000",
    odosRouter: "0x0000000000000000000000000000000000000000",
    flashLender: "0x0000000000000000000000000000000000000000",
  },

  deployment: {
    gasPrice: "auto",
    confirmations: 1,
  },

  blockExplorer: {
    name: "Sonic Explorer",
    url: "https://sonicscan.org",
    apiURL: "https://api.sonicscan.org",
    apiKey: "",
  },
};

export default SONIC_MAINNET_CONFIG;