// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDecreaseLeverageOdos {
  function decreaseLeverage(
    uint256 rebalanceDebtAmount,
    bytes calldata swapData,
    address dLoopCore
  ) external returns (uint256);
}
