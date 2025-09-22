import { ethers } from "ethers";

// Common error definitions from various contracts and standards
const customErrors = [
  // ERC20 standard errors
  {
    name: "ERC20InsufficientBalance",
    signature: "ERC20InsufficientBalance(address,uint256,uint256)",
    inputs: ["address", "uint256", "uint256"],
  },
  {
    name: "ERC20InsufficientAllowance",
    signature: "ERC20InsufficientAllowance(address,uint256,uint256)",
    inputs: ["address", "uint256", "uint256"],
  },

  // Custom error definitions from DLoopIncreaseLeverageBase and DLoopCoreBase contracts
  // DLoopIncreaseLeverageBase errors
  {
    name: "UnknownLender",
    signature: "UnknownLender(address,address)",
    inputs: ["address", "address"],
  },
  {
    name: "UnknownInitiator",
    signature: "UnknownInitiator(address,address)",
    inputs: ["address", "address"],
  },
  {
    name: "IncompatibleDLoopCoreDebtToken",
    signature: "IncompatibleDLoopCoreDebtToken(address,address)",
    inputs: ["address", "address"],
  },
  {
    name: "DebtTokenBalanceNotIncreasedAfterIncreaseLeverage",
    signature: "DebtTokenBalanceNotIncreasedAfterIncreaseLeverage(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },
  {
    name: "DebtTokenReceivedNotMetUsedAmountWithFlashLoanFee",
    signature: "DebtTokenReceivedNotMetUsedAmountWithFlashLoanFee(uint256,uint256,uint256)",
    inputs: ["uint256", "uint256", "uint256"],
  },
  {
    name: "FlashLoanAmountExceedsMaxAvailable",
    signature: "FlashLoanAmountExceedsMaxAvailable(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },
  {
    name: "LeverageNotIncreased",
    signature: "LeverageNotIncreased(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },
  {
    name: "RequiredFlashLoanCollateralAmountIsZero",
    signature: "RequiredFlashLoanCollateralAmountIsZero()",
    inputs: [],
  },
  {
    name: "LeverageAlreadyAtOrAboveTarget",
    signature: "LeverageAlreadyAtOrAboveTarget(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },

  // DLoopCoreBase errors
  {
    name: "TooImbalanced",
    signature: "TooImbalanced(uint256,uint256,uint256)",
    inputs: ["uint256", "uint256", "uint256"],
  },
  {
    name: "InsufficientAllowanceOfDebtAssetToRepay",
    signature: "InsufficientAllowanceOfDebtAssetToRepay(address,address,address,uint256)",
    inputs: ["address", "address", "address", "uint256"],
  },
  {
    name: "InsufficientAllowanceOfCollateralAssetToSupply",
    signature: "InsufficientAllowanceOfCollateralAssetToSupply(address,address,address,uint256)",
    inputs: ["address", "address", "address", "uint256"],
  },
  {
    name: "DecreaseLeverageOutOfRange",
    signature: "DecreaseLeverageOutOfRange(uint256,uint256,uint256)",
    inputs: ["uint256", "uint256", "uint256"],
  },
  {
    name: "IncreaseLeverageOutOfRange",
    signature: "IncreaseLeverageOutOfRange(uint256,uint256,uint256)",
    inputs: ["uint256", "uint256", "uint256"],
  },
  {
    name: "TokenBalanceNotDecreasedAfterRepay",
    signature: "TokenBalanceNotDecreasedAfterRepay(address,uint256,uint256,uint256)",
    inputs: ["address", "uint256", "uint256", "uint256"],
  },
  {
    name: "UnexpectedRepayAmountToPool",
    signature: "UnexpectedRepayAmountToPool(address,uint256,uint256,uint256)",
    inputs: ["address", "uint256", "uint256", "uint256"],
  },
  {
    name: "TokenBalanceNotDecreasedAfterSupply",
    signature: "TokenBalanceNotDecreasedAfterSupply(address,uint256,uint256,uint256)",
    inputs: ["address", "uint256", "uint256", "uint256"],
  },
  {
    name: "UnexpectedSupplyAmountToPool",
    signature: "UnexpectedSupplyAmountToPool(address,uint256,uint256,uint256)",
    inputs: ["address", "uint256", "uint256", "uint256"],
  },
  {
    name: "TokenBalanceNotIncreasedAfterBorrow",
    signature: "TokenBalanceNotIncreasedAfterBorrow(address,uint256,uint256,uint256)",
    inputs: ["address", "uint256", "uint256", "uint256"],
  },
  {
    name: "UnexpectedBorrowAmountFromPool",
    signature: "UnexpectedBorrowAmountFromPool(address,uint256,uint256,uint256)",
    inputs: ["address", "uint256", "uint256", "uint256"],
  },
  {
    name: "TokenBalanceNotIncreasedAfterWithdraw",
    signature: "TokenBalanceNotIncreasedAfterWithdraw(address,uint256,uint256,uint256)",
    inputs: ["address", "uint256", "uint256", "uint256"],
  },
  {
    name: "UnexpectedWithdrawAmountFromPool",
    signature: "UnexpectedWithdrawAmountFromPool(address,uint256,uint256,uint256)",
    inputs: ["address", "uint256", "uint256", "uint256"],
  },
  {
    name: "InvalidLeverageBounds",
    signature: "InvalidLeverageBounds(uint256,uint256,uint256)",
    inputs: ["uint256", "uint256", "uint256"],
  },
  {
    name: "AssetPriceIsZero",
    signature: "AssetPriceIsZero(address)",
    inputs: ["address"],
  },
  {
    name: "LeverageExceedsTarget",
    signature: "LeverageExceedsTarget(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },
  {
    name: "LeverageBelowTarget",
    signature: "LeverageBelowTarget(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },
  {
    name: "IncreaseLeverageReceiveLessThanMinAmount",
    signature: "IncreaseLeverageReceiveLessThanMinAmount(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },
  {
    name: "DecreaseLeverageReceiveLessThanMinAmount",
    signature: "DecreaseLeverageReceiveLessThanMinAmount(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },
  {
    name: "ZeroShares",
    signature: "ZeroShares()",
    inputs: [],
  },
  {
    name: "WithdrawalFeeIsGreaterThanMaxFee",
    signature: "WithdrawalFeeIsGreaterThanMaxFee(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },
  {
    name: "InvalidTargetLeverage",
    signature: "InvalidTargetLeverage(uint256)",
    inputs: ["uint256"],
  },
  {
    name: "InvalidCollateralToken",
    signature: "InvalidCollateralToken(address)",
    inputs: ["address"],
  },
  {
    name: "InvalidDebtToken",
    signature: "InvalidDebtToken(address)",
    inputs: ["address"],
  },

  // OdosSwapLogic errors
  {
    name: "InsufficientOutputAmount",
    signature: "InsufficientOutputAmount(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },
  {
    name: "OutputTokenBalanceDecreasedAfterSwap",
    signature: "OutputTokenBalanceDecreasedAfterSwap(uint256,uint256)",
    inputs: ["uint256", "uint256"],
  },

  // Unknown error with selector 0xe450d38c - trying to match the pattern
  {
    name: "PotentialCustomError",
    signature: "PotentialCustomError(address,uint256,uint256)",
    inputs: ["address", "uint256", "uint256"],
  },
];

function decodeCustomError(errorData: string): string {
  try {
    // Remove the 0x prefix if present
    const cleanData = errorData.startsWith('0x') ? errorData.slice(2) : errorData;

    // Extract the function selector (first 8 characters = 4 bytes)
    const selector = '0x' + cleanData.substring(0, 8);

    // Find matching error
    for (const error of customErrors) {
      const computedSelector = ethers.id(error.signature).substring(0, 10); // 0x + 8 chars

      if (computedSelector === selector) {
        console.log(`Found matching error: ${error.name}`);
        console.log(`Signature: ${error.signature}`);
        console.log(`Selector: ${selector}`);

        // If no parameters, return the error name
        if (error.inputs.length === 0) {
          return error.name;
        }

        // Decode parameters
        const paramData = '0x' + cleanData.substring(8);
        const decodedParams = ethers.AbiCoder.defaultAbiCoder().decode(error.inputs, paramData);

        console.log("Decoded parameters:");
        decodedParams.forEach((param, index) => {
          console.log(`  ${error.inputs[index]}: ${param}`);
        });

        return `${error.name}(${decodedParams.join(', ')})`;
      }
    }

    return `Unknown custom error with selector: ${selector}`;
  } catch (error) {
    console.error("Error decoding:", error);
    return "Failed to decode error";
  }
}

// Get error data from command line argument or use the one from the terminal output
const errorData = process.argv[2];

if (errorData === undefined || errorData === "") {
  console.error("Error data is undefined");
  process.exit(1);
}

console.log("=== Custom Error Decoder ===");
console.log(`Error data: ${errorData}`);
const decodedError = decodeCustomError(errorData);
console.log(`Decoded error: ${decodedError}`);

// // Provide human-readable explanation for the specific error
// if (decodedError.includes("ERC20InsufficientBalance")) {
//   console.log("\n=== Human Readable Explanation ===");
//   console.log("❌ ERC20 Insufficient Balance Error");
//   console.log("The contract doesn't have enough tokens to complete the transaction.");
//   console.log("This typically happens when:");
//   console.log("- Flash loan repayment amount exceeds available balance");
//   console.log("- Token transfer amount exceeds contract balance");
//   console.log("- Slippage in swap operations results in insufficient output");
//   console.log("\n💡 Possible solutions:");
//   console.log("- Check if the contract has sufficient token balance");
//   console.log("- Verify flash loan amounts and fees");
//   console.log("- Adjust slippage tolerance");
//   console.log("- Ensure proper token approvals");
// }
// console.log("===========================");

// // Also show all available custom errors
// console.log("\nAvailable custom errors:");
// customErrors.forEach(error => {
//   const selector = ethers.id(error.signature).substring(0, 10);
//   console.log(`${error.name}: ${selector}`);
// });

// // Try to decode the error data with common parameter patterns
// console.log("\n=== Attempting to decode error data manually ===");
// function tryDecodeErrorData(errorData: string) {
//   try {
//     const cleanData = errorData.startsWith('0x') ? errorData.slice(2) : errorData;
//     const paramData = '0x' + cleanData.substring(8);

//     console.log(`\nParameter data: ${paramData}`);

//     // Try different decoding patterns
//     const patterns = [
//       { name: "address + uint256 + uint256", types: ["address", "uint256", "uint256"] },
//       { name: "address + address + uint256", types: ["address", "address", "uint256"] },
//       { name: "uint256 + uint256 + uint256", types: ["uint256", "uint256", "uint256"] },
//       { name: "address + uint256", types: ["address", "uint256"] },
//       { name: "uint256 + uint256", types: ["uint256", "uint256"] },
//       { name: "address", types: ["address"] },
//       { name: "uint256", types: ["uint256"] },
//     ];

//     for (const pattern of patterns) {
//       try {
//         const decoded = ethers.AbiCoder.defaultAbiCoder().decode(pattern.types, paramData);
//         console.log(`\n${pattern.name}:`);
//         decoded.forEach((param, index) => {
//           console.log(`  ${pattern.types[index]}: ${param}`);
//         });
//       } catch (e) {
//         // Skip if this pattern doesn't work
//       }
//     }
//   } catch (error) {
//     console.error("Error in manual decoding:", error);
//   }
// }

// tryDecodeErrorData(errorData);
