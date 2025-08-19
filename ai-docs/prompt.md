I want to implement a bot to perform rebalancing calls on DLoopCoreDLend, via DecreaseLeverage/IncreaseLeverage periphery contracts. Please generate an implementation plan and test-plan (with mock test cases) for the bot, based on the following requirements. Then, do a review on the gennerated plans and make sure it is correct and complete.

## Overview

- The bot repo directory is in `bot/dloop-rebalancer`
- The bot should follow the same structure as the DLend Liquidator bot in `bot/dlend-liquidator`. Does not need to be 100% the same, but should be similar in style, code organization, etc.
- The bot repo should be independent to `./` repo, means if I move the `bot/dloop-rebalancer` out of `./`, it still work fine without any installation, dependencies issue.

## How does the bot work?

### 1. Get the quote result

The bot will call `dloopCore.quoteRebalanceAmountToReachTargetLeverage()` to get the input token amount, the estimated output token amount, and the direction.

If direction == 1:

- The bot should call `DLoopIncreaseLeverageOdos.increaseLeverage()` to increase the leverage:
- Input token is the collateral token.
- Output token is the debt token.

If direction == -1:

- The bot should call `DLoopDecreaseLeverageOdos.decreaseLeverage()` to decrease the leverage:
- Input token is the debt token.
- Output token is the collateral token.

If direction == 0 (no rebalancing needed):

- The bot should just skip the rebalancing.

### 2. Calculate the estimated subsidy amount

Calculate the estimated subsidy amount in output token amount:

- Check the `getSubsidyAmountInTokenAmount()` of `contracts/vaults/dloop/core/DLoopCoreLogic.sol` to see how to calculate the subsidy amount, given the output token amount

If the subsidy amount >= minSubsidyAmount[outputToken]:

- The bot should call the periphery contract's corresponding function to rebalance the position.

If the subsidy amount < minSubsidyAmount[outputToken]:

- The bot should just skip the rebalancing.

### 3. Call the periphery contract to rebalance the position

As the bot is going to call the flashloan-based periphery contracts (@contracts/vaults/dloop/periphery/venue/odos/DLoopIncreaseLeverageOdos.sol and @contracts/vaults/dloop/periphery/venue/odos/DLoopDecreaseLeverageOdos.sol), there is NO NEED to approve any input token to be spent (you can check the explanation in natspec of `increaseLeverage()` and `decreaseLeverage()` in the periphery contracts).

We can also control the quote result's inputTokenAmount as follows:

- When rebalancing, the bot will first try with 100% of the input token amount.
- If the transaction fails, the bot will try with 90% of the input token amount.
- If the transaction fails, the bot will try with 80% of the input token amount.
- So on and so forth, until the percentage is 10% of the input token amount.
- If all trials failed, the bot just print out the error message and skip the rebalancing.
- These [100%, 90%, 80%, ...] are the percentages of the input token amount, and these values are in the config field `rebalancePercentageList = [1, 0.9, 0.8, ...]`.
- This approach is to avoid the risky of swap pool liquidity issue, as the bot will try to rebalance with a small amount of input token amount, if the swap pool has not enough liquidity and got a high slippage, the transaction will fail as it cannot repay the flashloan debt.

### 4. Notify the result

When there is a successful rebalancing or failed rebalancing, the bot should:

- Print out the result/error.
- Send to Slack channel (similar to `bot/dlend-liquidator/typescript/odos_bot/notification.ts`) to notify the result.

## Source code structure

Please read and write the repo structure of `bot/dlend-liquidator`, then based on that to generate the repo structure for `bot/dloop-rebalancer`. Make sure it meets the following critical:

- For missing contract interfaces, just copy the interface from `./` repo.
- The core contract address will be stored in the config (similar to `bot/dlend-liquidator/config/`).
- Make sure the docker image can be built with `make docker.build` (similar to `bot/dlend-liquidator/Dockerfile` and `bot/dlend-liquidator/Makefile`).

## Test requirements

- Should have a full-flow test of running the bot with mock DLoopCoreMock, and verify the bot can rebalance the position to the target leverage.

## Review requirements

- Make sure the contracts can be compiled with `make compile`
- Make sure we can deploy the contracts with `make deploy.sonic_mainnet` (does not need to run the deployment script, just review and make sure the deployment script is correct and ready to run).
