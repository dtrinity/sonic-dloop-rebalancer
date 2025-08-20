// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

abstract contract DLoopCoreBase {
    function quoteRebalanceAmountToReachTargetLeverage()
        public
        view
        virtual
        returns (
            uint256 inputTokenAmount,
            uint256 estimatedOutputTokenAmount,
            int8 direction
        );

    function getCurrentSubsidyBps() public view virtual returns (uint256);
    function getCurrentLeverageBps() public view virtual returns (uint256);
    
    function collateralToken() public view virtual returns (ERC20);
    function debtToken() public view virtual returns (ERC20);
    
    function convertFromTokenAmountToBaseCurrency(
        uint256 amountInToken,
        address token
    ) public view virtual returns (uint256);
    
    function convertFromBaseCurrencyToToken(
        uint256 amountInBase,
        address token
    ) public view virtual returns (uint256);
}
