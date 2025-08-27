// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDLoopCore {
    function quoteRebalanceAmountToReachTargetLeverage()
        external
        view
        returns (uint256, uint256, int8);

    function getCurrentSubsidyBps() external view returns (uint256);

    function getCurrentLeverageBps() external view returns (uint256);

    function collateralToken() external view returns (address);

    function debtToken() external view returns (address);

    function convertFromTokenAmountToBaseCurrency(uint256 amount, address token)
        external
        view
        returns (uint256);

    function convertFromBaseCurrencyToToken(uint256 amount, address token)
        external
        view
        returns (uint256);
}