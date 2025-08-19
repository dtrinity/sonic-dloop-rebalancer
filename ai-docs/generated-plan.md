This is the implementation plan for the dloop-rebalancer bot.

## Implementation plan

- Overview
  - Build a standalone bot in `bot/dloop-rebalancer` (portable outside the monorepo).
  - Mirror structure and patterns from `bot/dlend-liquidator` (TypeScript runtime, artifacts bundled, Docker-first).
  - Drive rebalancing via `DLoopCoreBase.quoteRebalanceAmountToReachTargetLeverage()`, and execute through Odos-flashloan periphery:
    - Increase: `DLoopIncreaseLeverageOdos.increaseLeverage(...)`
    - Decrease: `DLoopDecreaseLeverageOdos.decreaseLeverage(...)`

- Key contract entrypoints to use

```1176:1202:contracts/vaults/dloop/core/DLoopCoreBase.sol
function quoteRebalanceAmountToReachTargetLeverage()
  public view
  returns (uint256 inputTokenAmount, uint256 estimatedOutputTokenAmount, int8 direction)
```

```146:203:contracts/vaults/dloop/periphery/DLoopIncreaseLeverageBase.sol
function increaseLeverage(
  uint256 rebalanceCollateralAmount,
  bytes calldata debtTokenToCollateralSwapData,
  DLoopCoreBase dLoopCore
) public nonReentrant returns (uint256 receivedDebtTokenAmount)
```

```148:199:contracts/vaults/dloop/periphery/DLoopDecreaseLeverageBase.sol
function decreaseLeverage(
  uint256 rebalanceDebtAmount,
  bytes calldata collateralToDebtTokenSwapData,
  DLoopCoreBase dLoopCore
) public nonReentrant returns (uint256 receivedCollateralTokenAmount)
```

- Repo structure (new)
  - `bot/dloop-rebalancer/`
    - `contracts/` (copy minimal interfaces used for typechain: `DLoopCoreBase`, `DLoopIncreaseLeverageOdos`, `DLoopDecreaseLeverageOdos`, Odos interfaces, IERC3156)
    - `artifacts/`, `typechain-types/` (bundled for independence; align with liquidator layout)
    - `deployments/` (optional: ABI/address JSON for mainnet/testnet; match liquidator structure)
    - `config/`
      - `config.ts` (load env, pick network, glue)
      - `constants.ts` (bps constants)
      - `deploy-ids.ts` (ids of deployed peripheries if needed)
      - `networks/{localhost,sonic_testnet,sonic_mainnet}.ts` (addresses: core, peripheries, odos router, flash lender; token metadata; minSubsidy thresholds; rebalance percentages)
      - `types.ts` (typed config, very similar to liquidator)
    - `typescript/`
      - `common/{assert.ts, log.ts, file.ts, cache.ts, erc20.ts}`
      - `odos/{client.ts, types.ts}` (copy/adapt from liquidator)
      - `rebalance_bot/`
        - `contracts.ts` (ethers factories for core and peripheries)
        - `quote.ts` (wrapper around core.quote + subsidy calc)
        - `swapdata.ts` (build Odos exact-output swapdata per trial)
        - `rebalance.ts` (attempt execution with fallback percentages)
        - `notification.ts` (Slack like liquidator)
        - `run.ts` (entrypoint loop)
    - `scripts/sh/{docker-entrypoint.sh, replace_string.sh}`
    - `Dockerfile`, `Makefile`, `hardhat.config.ts`, `package.json`, `tsconfig.json`, `.yarnrc.yml` (match liquidator)
    - `state/` (optional: simple ignore memory like liquidator)

- Config shape (suggested)
  - `network`: chainId, RPC endpoint, signer key
  - `contracts`:
    - `dloopCore`: address
    - `increaseOdos`: address
    - `decreaseOdos`: address
    - `odosRouter`: address (may be blank on networks that don’t support Odos)
    - `flashLender`: address
  - `tokens`:
    - `collateral`: {address, decimals, symbol}
    - `debt`: {address, decimals, symbol}
  - `policy`:
    - `rebalancePercentageList`: number[] (e.g., [1,0.9,0.8,...,0.1])
    - `minSubsidyAmount`: { [tokenAddress]: string } // in token base units
    - `maxTxRetriesPerTrial`: number
    - `loopIntervalSec`: number
  - `notifications`:
    - Slack: `SLACK_TOKEN`, `SLACK_CHANNEL`
    - Log verbosity

- Core algorithm (pseudocode)

```typescript
// 1) Quote
const [inputAmt, estOutputAmt, dir] = await core.quoteRebalanceAmountToReachTargetLeverage();
if (dir === 0 || inputAmt === 0n) return skip("No rebalance");

// 2) Subsidy check (bps from core to match on-chain logic)
const subsidyBps = await core.getCurrentSubsidyBps();
const estSubsidy = estOutputAmt * subsidyBps / ONE_HUNDRED_PERCENT_BPS;
const outputToken = dir === 1 ? debtToken : collateralToken;
if (estSubsidy < minSubsidyAmount[outputToken.address]) return skip("Below minSubsidy");

// 3) Trials with fallback percentages
for (const p of rebalancePercentageList) {
  const trialInput = floor(inputAmt * BigInt(Math.round(p*1e6)) / 1_000_000n);
  if (trialInput === 0n) continue;

  // Pre-flight flash-loan ceiling check to avoid revert:
  // Increase: estimate required flash in debt for trialInput collateral
  // decrease: required flash equals trialInput debt
  // ensure required <= flashLender.maxFlashLoan(debt)/10 per periphery
  if (!flashPrecheckOk(trialInput, dir)) continue;

  // 4) Build Odos swap data (exact output)
  if (dir === 1) {
    const amountOut = trialInput; // exact collateral out
    const swapData = await buildOdosExactOut(debtToken, collateralToken, amountOut);
    try {
      const tx = await increaseOdos.increaseLeverage(trialInput, swapData, core.address);
      await tx.wait();
      return success();
    } catch (e) { logTrialError(p, e); continue; }
  } else {
    const baseFee = await flashLender.flashFee(debtToken.address, trialInput);
    const amountOut = trialInput + baseFee; // exact debt out to repay loan+fee
    const swapData = await buildOdosExactOut(collateralToken, debtToken, amountOut);
    try {
      const tx = await decreaseOdos.decreaseLeverage(trialInput, swapData, core.address);
      await tx.wait();
      return success();
    } catch (e) { logTrialError(p, e); continue; }
  }
}
// 5) All trials failed: notify + skip
```

- Swap data builder
  - Use Odos API client (copied from liquidator) to:
    - Get quote for exact output:
      - inputToken: depends on direction
      - outputToken: depends on direction
      - outAmount: as computed above (BigInt→decimal string via token decimals)
    - Assemble transaction (`/sor/assemble`) → return `calldata` bytes for router.
  - Note: Odos router address is from config; network must support Odos routing.

- Flash-loan precheck (optional but recommended)
  - Increase trial:
    - Use `core.convertFromTokenAmountToBaseCurrency(trialCollateral, collateral)`
    - Then `core.convertFromBaseCurrencyToToken(base, debt)` → required flash debt
    - Ensure `requiredFlash <= maxFlashLoan(debt)/10` (matches periphery guard).
  - Decrease trial:
    - Required flash equals `trialDebt`, ensure `<= maxFlashLoan(debt)/10`.
  - If precheck fails, skip this percentage (or scale down automatically).

- Notifications
  - On success: direction, pct used, tx hash, gas used, estSubsidy in token units, new leverage (optional extra read).
  - On failure: direction, pct, revert reason (best-effort), next steps.
  - Use Slack module mirroring `bot/dlend-liquidator/typescript/odos_bot/notification.ts`.

- Docker/Make/Runtime
  - Dockerfile modeled on liquidator’s:
    - Copy `artifacts`, `typechain-types`, `contracts`, `deployments` (if used)
    - Pre-compile to fetch solc
    - Copy `typescript/`, `config/`, entrypoint
  - Makefile targets: `docker.build`, `docker.run`, `lint`, `format`.
  - Entry command runs `typescript/rebalance_bot/run.ts` in a loop (configurable interval).

- Operational safeguards
  - Idempotent: maintain ignore cache for “already within band” to reduce spam (like liquidator’s `state/ignoreMemory.json`).
  - RPC backoff/jitter; wrap external calls with retries.
  - Optional dry-run mode (build swap data only).

## Test plan (with mock cases)

- Setup
  - Hardhat tests in `bot/dloop-rebalancer`:
    - Deploy a `DLoopCoreMock` or reuse minimal testing variant copied in for independence.
    - Deploy `MockOdosRouterV2` (like in repo tests) that:
      - Mints “output” token on swapExactOutput call and reports “amountSpent”.
      - Supports encoding that mimics Odos’ `assemble` calldata return shape.
    - Deploy `DLoopIncreaseLeverageOdos` and `DLoopDecreaseLeverageOdos` wired to mock router and a mock flash lender:
      - `mockFlashLender.maxFlashLoan` returns a large number; `flashFee` returns a deterministic small fee (e.g., 0.05%).
    - Mint balances to core as needed.

- Cases
  - Happy path – increase leverage
    - Arrange: current leverage below target; `quote` returns dir=1, input>0, estOutput>0.
    - Configure `minSubsidyAmount[debt]` lower than estSubsidy; pList includes 1.0.
    - Mock Odos returns exact collateral out equal to trialInput; periphery succeeds.
    - Assert: tx success; leftover debt sent to msg.sender; leverage increased and <= target; Slack success invoked.

  - Happy path – decrease leverage
    - Arrange: current leverage above target; dir=-1 (input=debt); compute fee; Odos exact-out for `trialDebt + fee` succeeds.
    - Assert: tx success; collateral sent to msg.sender; leverage decreased and >= target; Slack success sent.

  - Below-min subsidy gate
    - Arrange: quote returns estSubsidy < minSubsidy for output token.
    - Assert: bot skips; no tx; Slack skip message.

  - Fallback percentages (liquidity-limited)
    - Arrange: mock Odos fails for 100% (revert), succeeds at 80%.
    - Assert: 100% trial recorded as failure; 80% success; only one success notification.

  - Flash-loan cap precheck
    - Arrange: set `maxFlashLoan` low so 100% would exceed; 50% fits.
    - Assert: precheck skips 100%; executes 50% and succeeds.

  - Revert paths
    - Odos revert mid-swap → bot retries next p; reports failure reason.
    - Periphery revert due to incompatible token addresses → captured and reported; next trial continues.

  - No rebalance needed
    - Arrange: dir=0 from quote.
    - Assert: bot logs and does nothing.

  - Edge: Zero input from quote (e.g., rounding to 0)
    - Assert: skip with reason.

  - Slack errors
    - Arrange: invalid Slack token.
    - Assert: bot logs but does not crash main loop.

- Metrics/assertions
  - Validate new leverage against bounds after successful runs.
  - Validate transferred token balances (received amounts match direction).
  - Validate calculated subsidy approximation against on-chain events/values where applicable.

## Review (correctness/completeness)

- Contract compatibility
  - Bot uses the exact signatures of core/periphery functions shown above; no approvals needed (flashloan supplies tokens; approvals handled internally).
  - Decrease path includes flash fee in Odos exact-output target (computed via `flashLender.flashFee`), matching periphery logic.
  - Increase path uses exact-out swap for collateral equal to `rebalanceCollateralAmount`.

- Subsidy calculation

```868:877:contracts/vaults/dloop/core/DLoopCoreLogic.sol
function getSubsidyAmountInTokenAmount(uint256 outputTokenAmount, uint256 subsidyBps)
  internal pure returns (uint256) {
  return Math.mulDiv(outputTokenAmount, subsidyBps, ONE_HUNDRED_PERCENT_BPS);
}
```

- Bot computes `subsidy = estOutput * currentSubsidyBps / 10000` (using on-chain `getCurrentSubsidyBps()` so it’s consistent with `quote`).

- Liquidity/flash constraints
  - Plan includes percentage fallback plus optional precheck against `maxFlashLoan(debt)/10` (periphery guard) and Odos routing failure.

- Portability
  - Bundling `artifacts/`, `typechain-types/`, minimal `contracts/` interfaces, and Docker build like liquidator ensures stand-alone operation.

- Build/run
  - Dockerfile and Makefile mirror `bot/dlend-liquidator`; compile step triggers solc downloads with copied artifacts (matches pattern).

- Tests
  - Full-flow tests cover both directions, gating, fallback, and failure paths using mocks; independent of monorepo dependencies.

- Deployment readiness
  - Contracts compile with `make compile` (bot doesn’t add new Solidity here).
  - Deployment scripts in monorepo are unaffected; bot config points to already-deployed `core`, `increaseOdos`, `decreaseOdos`, and `odosRouter`. Review that network configs specify valid addresses and Odos is supported (note: sonic testnet/localhost may not support Odos; plan handles via config).

- Operational notes
  - Scale subsidy gating per percentage trial (optional): skip trials where `estSubsidy * p < minSubsidy[output]` to avoid tiny, unprofitable attempts.
  - Rate limiting and retries around RPC and Odos API included.

- Assumptions
  - Odos router is available on target network (if not, mark config and skip).
  - Flash lender adheres to ERC-3156 and fee is callable off-chain.
  - Single core vault per bot instance; multi-core batching is a straightforward extension.

- Out of scope
  - No on-chain changes required.
  - No approvals needed by design; peripheries handle allowances internally.

- Slack message schema (example)
  - Success: “Rebalanced core=<addr> dir=INC p=80% input=123.45 WETH output=24690.00 dUSD subsidy=24.69 dUSD tx=<hash>”
  - Failure: “Failed dir=DEC p=100% reason=INSUFFICIENT_OUTPUT trying next…”

- Minimal runbook
  - Configure addresses, RPC, keys, Slack.
  - `make docker.build`
  - `docker run -e ... dloop-rebalancer:latest`

- Example with numbers
  - If quote says dir=1, input=25 WETH, estOutput=50,000 dUSD, subsidyBps=1% → estSubsidy=500 dUSD. If minSubsidy[dUSD]=300 dUSD → proceed. If 100% fails, retry with 90% → input=22.5 WETH, exact-out collateral=22.5 WETH (increase), Odos swaps debt→collateral, core borrows ~45,000+ dUSD back, flash is repaid; leftover debt + subsidy goes to caller.

- Make compile/deploy review
  - No edits to contracts required; the bot compiles its copied interfaces and runs with pre-baked artifacts like liquidator.
  - Deployment scripts in monorepo remain valid; ensure config points to deployed peripheries and Odos router on `sonic_mainnet`.

- Open risks to monitor
  - Odos API downtime → backoff and skip cycle.
  - On-chain price changes between quote and execution → fallback percentages and exact-output reduce risk.
  - Flash-loan availability shrinkage → precheck and fallback.

- What I would implement first
  - Config and contracts wiring (ethers factories).
  - Quote + subsidy gate.
  - Odos client exact-out builder.
  - Single-run rebalance function with fallback and notifications.
  - Dockerfile/Makefile.
  - Mock-based tests for both directions.

- What not to forget
  - Decrease path: add flash fee into exact-output target.
  - Use token decimals when formatting amounts for Odos.
  - Scale subsidy expectation by percentage when deciding whether to try a given trial.

- Minimal file stubs to mirror liquidator
  - `Dockerfile`, `Makefile`, `hardhat.config.ts`, `typescript/odos/client.ts`, `typescript/rebalance_bot/{run.ts,rebalance.ts,swapdata.ts,quote.ts,contracts.ts,notification.ts}`, `config/{types.ts,config.ts,constants.ts,networks/*.ts}`.

- CI hint
  - Lint TypeScript; optional unit tests for helpers; E2E test suite with mocks via Hardhat.

- Summary
  - Plan adheres to actual contract interfaces, handles subsidy gating and Odos exact-output building, includes fallback strategy and flash-loan precheck, mirrors the liquidator bot’s structure, is portable, and comes with a focused mock test suite.

- Edits/impact
  - None yet; this is a plan.
