// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DLoopCoreBase.sol";

interface DLoopDecreaseLeverageOdos {
    function decreaseLeverage(
        uint256 rebalanceDebtAmount,
        bytes calldata collateralToDebtTokenSwapData,
        DLoopCoreBase dLoopCore
    ) external returns (uint256 receivedCollateralTokenAmount);
}
