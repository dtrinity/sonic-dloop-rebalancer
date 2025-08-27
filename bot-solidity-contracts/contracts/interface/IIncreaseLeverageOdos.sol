// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIncreaseLeverageOdos {
    function increaseLeverage(
        uint256 rebalanceCollateralAmount,
        bytes calldata swapData,
        address dLoopCore
    ) external returns (uint256);
}