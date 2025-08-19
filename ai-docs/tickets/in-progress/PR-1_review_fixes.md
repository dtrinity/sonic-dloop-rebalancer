## Fix & Test Plan for PR Review #3131258836

References: [PR Review Comments](https://github.com/dtrinity/sonic-dloop-rebalancer/pull/1#pullrequestreview-3131258836)

### Scope

Address unresolved issues called out in the review for the Odos rebalancer bot. This ticket tracks fixes and associated tests to reach production readiness.

### Unresolved Issues (from review)

- Private key not loaded from env in network configs (`config/networks/*.ts`).
- Odos swap built as exact-input with `proportion` instead of exact-output in `typescript/rebalance_bot/swapdata.ts`.
- Flash-loan precheck returns `true` on error in `typescript/rebalance_bot/rebalance.ts`.
- `maxTxRetriesPerTrial` unused: no transaction retry logic.
- Type safety gaps: `any` casting for periphery calls; contracts untyped in `typescript/rebalance_bot/contracts.ts`.
- Hardcoded magic numbers: 5% slippage buffers, 1% slippage limit, `maxFlashLoan/10n`, 5-minute ignore window.
- Subsidy gate ignores trial percentage; uses full quote amounts in `typescript/rebalance_bot/quote.ts`.
- No price impact guard using Odos quote response.
- Odos API calls have no retry/timeout.
- Missing global `unhandledRejection` handling.
- Transaction receipt validation only checks null, not `status`.
- Missing tests for `SwapDataBuilder`, `NotificationManager`, `OdosClient`, and runner loop.
- Mocks are simplistic (`contracts/mocks/MockOdosRouterV2.sol`).

### Implementation Plan

1) Load private key from env
   - Edit `config/networks/sonic_mainnet.ts`, `sonic_testnet.ts`, `localhost.ts`: set `network.privateKey: process.env.PRIVATE_KEY || ""`.
   - In `config/config.ts`, after selecting base config, optionally allow overriding `rpcUrl` and contract addresses via env if present (non-blocking).
   - Ensure logs never print `PRIVATE_KEY`.

2) Exact-output Odos swaps
   - Update `typescript/odos/types.ts` `QuoteRequest` to support specifying exact output per Odos v2: allow `outputTokens: [{ tokenAddress, amount: string }]` and do not use `proportion` when doing exact-out.
   - In `typescript/rebalance_bot/swapdata.ts`:
     - Increase path: treat `collateralAmountOut` as exact output; stop estimating input with 5% buffer. Pass `outputTokens[0].amount = collateralAmountOut` and a sufficiently high `inputTokens[0].amount` cap or switch to Odos exact-out mode if supported by API; verify with Odos docs and adjust accordingly.
     - Decrease path: compute `totalDebtNeeded = trialDebt + flashFee`; pass as exact output amount for debt. Remove input-side 5% buffer; rely on Odos slippage limit field only.
   - Keep `slippageLimitPercent` configurable (see item 5).

3) Flash-loan precheck strictness
   - In `typescript/rebalance_bot/rebalance.ts` `checkFlashLoanAvailability()`, return `false` on errors instead of `true`.
   - Log structured context in the catch block.

4) Transaction retry logic
   - Add retry wrapper around the periphery tx send/wait in `executeTrial()` using `config.policy.maxTxRetriesPerTrial` with exponential backoff (e.g., 1s, 2s, 4s). Retry on common transient errors (nonce too low, underpriced replacement, rate limit, 5xx).

5) Extract magic numbers to config/constants
   - Add constants in `config/constants.ts`:
     - `DEFAULT_SLIPPAGE_BUFFER_BPS` (used only if exact-out fallback needs a buffer)
     - `DEFAULT_SLIPPAGE_LIMIT_BPS` (for Odos `slippageLimitPercent`)
     - `FLASH_LOAN_SAFETY_DIVISOR = 10n`
     - `IGNORE_DURATION_MS = 5 * 60 * 1000`
     - `PERCENTAGE_PRECISION = 1_000_000n` (or higher per item 7)
   - Replace literals in `swapdata.ts`, `rebalance.ts`, and `run.ts`.
   - Make slippage settings optionally overridable via env.

6) Type safety and contract bindings
   - Introduce minimal TypeScript interfaces for periphery functions and core reads, or wire TypeChain artifacts if available.
   - Update `typescript/rebalance_bot/contracts.ts` to use typed interfaces instead of broad `ethers.Contract` + `any`.
   - Remove `as any` casts in `rebalance.ts` when calling `increaseLeverage()` and `decreaseLeverage()`.

7) Subsidy gate per trial
   - Move subsidy validation inside the trial loop: compute `trialEstimatedOutput = quote.estimatedOutputTokenAmount * pct` (using same precision as trial selection), then `trialSubsidy = trialEstimatedOutput * subsidyBps / 10000`.
   - Compare `trialSubsidy` against `minSubsidyAmount` for the output token for that direction.
   - Keep an initial coarse gate on the full amount as a quick skip, but the binding decision should be per-trial.

8) Precision for percentages
   - Increase `PERCENTAGE_PRECISION` to `1_000_000_000n` (9 dp) or use integer basis points if sufficient. Update `calculateTrialAmount()` accordingly.

9) Price impact guard
   - After Odos `getQuote()`, read `priceImpact` and fail the trial if it exceeds a configured max (e.g., `MAX_PRICE_IMPACT_BPS` from constants/env).

10) Odos client resilience

- Add axios timeout (e.g., 10s) and simple retry (e.g., 3 attempts) with backoff for `getQuote()` and `assembleTransaction()` on retryable errors (network, 5xx, rate limits).

11) Process-wide error handling

- In `typescript/rebalance_bot/run.ts`, add `process.on('unhandledRejection', ...)` to log and continue or perform a clean stop depending on severity.

12) Transaction receipt checks

- In `rebalance.ts`, check `receipt.status === 1`. If not, treat as failure and allow retry according to item 4.

13) Tests

- Unit tests:
  - `SwapDataBuilder` (increase/decrease): builds correct exact-output requests; respects slippage limit; enforces price impact guard.
  - `OdosClient`: timeout and retry behavior using HTTP stubs; error mapping.
  - `RebalanceManager`: flash-loan precheck failure paths; per-trial subsidy check; tx retry logic; receipt status handling.
  - `NotificationManager`: success/failure/skip messages; redaction of sensitive values.
  - `config/config.ts`: env overrides for private key and slippage/limits.
- Integration tests:
  - Happy-path increase and decrease with mocked Odos responses returning acceptable `priceImpact` and assembled tx data.
  - Failure at 100% succeeding at lower percentage due to flash-loan cap.
  - Exact-out failure (insufficient liquidity) leading to retry and/or next percentage.
- Mocks:
  - Extend `contracts/mocks/MockOdosRouterV2.sol` or decouple router from tests; prefer stubbing Odos HTTP in TS and asserting that assembled calldata is consumed by periphery calls.

### Acceptance Criteria

- Network configs read `PRIVATE_KEY` from env and pass validation.
- `swapdata.ts` uses Odos exact-output flow for both directions; no input-side 5% buffers remain.
- Flash-loan precheck returns `false` on errors; trials are skipped accordingly.
- Per-trial subsidy validation is enforced.
- Retry logic respects `maxTxRetriesPerTrial`; failures are retried with backoff.
- Magic numbers replaced by named constants; slippage and price impact thresholds configurable.
- No `any` casts remain at periphery call sites; contracts are typed.
- Odos client has timeout and retry; price impact guard enforced.
- Receipt `status` is checked; non-success treated as failure.
- New unit/integration tests added and passing.

### Rollout & Ops

- Start with `NETWORK=sonic_testnet` and small percentages (`rebalancePercentageList` ending at 0.05) for smoke tests.
- Monitor logs; verify no sensitive values are printed (Slack token, private key).
- Gradually deploy to `NETWORK=sonic_mainnet` after testnet confidence.

### How to Test

- Install deps and run tests:
  - `make install`
  - `make test` [[memory:5262866]]
- Lint:
  - `make lint`
- Local dry-run on localhost:
  - Set `.env`: `NETWORK=localhost`, `PRIVATE_KEY=...`, `DRY_RUN=true`.
  - `yarn ts-node typescript/rebalance_bot/run.ts`

### Notes

- The exact-output request shape must be aligned with current Odos v2 API. Verify fields in `outputTokens` and adjust the interface before coding.
