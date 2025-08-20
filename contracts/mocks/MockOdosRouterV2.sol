// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockOdosRouterV2 {
    // Mock router that simulates successful swaps
    uint256 public mockAmountSpent;
    bool public shouldRevert;
    string public revertReason;

    constructor() {
        mockAmountSpent = 1000000000000000000; // 1 token by default
    }

    function setMockAmountSpent(uint256 _amount) external {
        mockAmountSpent = _amount;
    }

    function setShouldRevert(bool _shouldRevert, string memory _reason) external {
        shouldRevert = _shouldRevert;
        revertReason = _reason;
    }

    // This function will be called via raw calldata from the swap
    // We simulate the behavior by minting output tokens and returning amount spent
    fallback() external payable {
        if (shouldRevert) {
            revert(revertReason);
        }
        
        // Return the mock amount spent in the expected format
        uint256 amount = mockAmountSpent;
        assembly {
            mstore(0x00, amount)
            return(0x00, 0x20)
        }
    }

    // Add receive function to handle plain ether transfers
    receive() external payable {}
}
