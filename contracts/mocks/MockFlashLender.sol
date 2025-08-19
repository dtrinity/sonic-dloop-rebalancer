// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../IERC3156FlashLender.sol";

contract MockFlashLender is IERC3156FlashLender {
    uint256 public constant MAX_FLASH_LOAN = 1000000000000000000000000; // 1M tokens
    uint256 public constant FLASH_FEE_BPS = 5; // 0.05%

    function maxFlashLoan(address token) external pure override returns (uint256) {
        return MAX_FLASH_LOAN;
    }

    function flashFee(address token, uint256 amount) external pure override returns (uint256) {
        return amount * FLASH_FEE_BPS / 10000;
    }

    function flashLoan(
        address receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external override returns (bool) {
        // Simple mock - just return true
        return true;
    }
}
