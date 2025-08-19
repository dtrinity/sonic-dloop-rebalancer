// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../DLoopCoreBase.sol";

contract DLoopCoreMock is DLoopCoreBase {
    ERC20 public immutable collateralTokenContract;
    ERC20 public immutable debtTokenContract;
    
    uint256 public mockInputTokenAmount;
    uint256 public mockEstimatedOutputTokenAmount;
    int8 public mockDirection;
    uint256 public mockSubsidyBps;
    uint256 public mockLeverageBps;

    constructor(address _collateralToken, address _debtToken) {
        collateralTokenContract = ERC20(_collateralToken);
        debtTokenContract = ERC20(_debtToken);
        
        // Default mock values
        mockInputTokenAmount = 1000000000000000000; // 1 token
        mockEstimatedOutputTokenAmount = 2000000000000000000; // 2 tokens
        mockDirection = 1; // increase leverage
        mockSubsidyBps = 100; // 1%
        mockLeverageBps = 25000; // 2.5x
    }

    function setMockQuote(
        uint256 _inputTokenAmount,
        uint256 _estimatedOutputTokenAmount,
        int8 _direction
    ) external {
        mockInputTokenAmount = _inputTokenAmount;
        mockEstimatedOutputTokenAmount = _estimatedOutputTokenAmount;
        mockDirection = _direction;
    }

    function setMockSubsidyBps(uint256 _subsidyBps) external {
        mockSubsidyBps = _subsidyBps;
    }

    function setMockLeverageBps(uint256 _leverageBps) external {
        mockLeverageBps = _leverageBps;
    }

    function quoteRebalanceAmountToReachTargetLeverage()
        public
        view
        override
        returns (
            uint256 inputTokenAmount,
            uint256 estimatedOutputTokenAmount,
            int8 direction
        )
    {
        return (mockInputTokenAmount, mockEstimatedOutputTokenAmount, mockDirection);
    }

    function getCurrentSubsidyBps() public view override returns (uint256) {
        return mockSubsidyBps;
    }

    function getCurrentLeverageBps() public view override returns (uint256) {
        return mockLeverageBps;
    }

    function collateralToken() public view override returns (ERC20) {
        return collateralTokenContract;
    }

    function debtToken() public view override returns (ERC20) {
        return debtTokenContract;
    }

    function convertFromTokenAmountToBaseCurrency(
        uint256 amountInToken,
        address // token
    ) public pure override returns (uint256) {
        // Simple 1:1 conversion for testing
        return amountInToken;
    }

    function convertFromBaseCurrencyToToken(
        uint256 amountInBase,
        address // token
    ) public pure override returns (uint256) {
        // Simple 1:1 conversion for testing
        return amountInBase;
    }
}
