// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DLoopCoreBase.sol";

interface DLoopIncreaseLeverageOdos {
    function increaseLeverage(
        uint256 rebalanceCollateralAmount,
        bytes calldata debtTokenToCollateralSwapData,
        DLoopCoreBase dLoopCore
    ) external returns (uint256 receivedDebtTokenAmount);
}
