## Follow-up Fix & Test Plan for PR Review #3131540020

Reference: [PR Review Comments](https://github.com/dtrinity/sonic-dloop-rebalancer/pull/1#pullrequestreview-3131540020)

### Unresolved items after code comparison

- ECONNREFUSED missing from retryable transaction errors in `typescript/rebalance_bot/rebalance.ts`.
- Exact-output input cap hardcoded at 150%; not configurable.
- Potential sensitive token/secret exposure in error messages (no sanitization before logging/sending Slack).
- No targeted tests for the main runner loop (`typescript/rebalance_bot/run.ts`) covering ignore window and global handlers.
- Documentation for why `PERCENTAGE_PRECISION = 1_000_000_000n` (9 dp) could be clearer outside code comments.

All other critical/high-priority issues from the review appear resolved in the current codebase (env key loading, exact-output swaps, flash-loan precheck, retry logic, price impact guard, Odos HTTP retry/timeout, receipt status check, and unit/integration tests for core components).

### Implementation plan

1) Add ECONNREFUSED to retryable transaction errors
   - Edit `typescript/rebalance_bot/rebalance.ts` in `retryTransaction()` to also treat messages containing `ECONNREFUSED`/`connection refused` as retryable.
   - Keep exponential backoff and respect `config.policy.maxTxRetriesPerTrial`.

2) Make exact-output input cap configurable
   - In `config/constants.ts`, add:
     - `DEFAULT_EXACT_OUT_INPUT_CAP_BPS = 15000` (150%).
     - `getExactOutInputCapBps()` that reads `EXACT_OUT_INPUT_CAP_BPS` from env (validate 10000..50000).
   - Update `typescript/rebalance_bot/swapdata.ts` to compute input caps using `getExactOutInputCapBps()` for both increase/decrease paths.
   - Log the configured cap (in percent) at debug level.

3) Sanitize sensitive values in notifications/logs
   - Create `typescript/common/sanitize.ts` with `sanitizeForLogs(message: string): string` masking:
     - Slack tokens (`xox[bap]-[A-Za-z0-9-]+`) → `xoxb-[REDACTED]`, etc.
     - Private keys-like hex strings when prefixed in messages (defensive): `0x[0-9a-fA-F]{64}` → `0x[REDACTED]`.
   - Use it in `NotificationManager` for all outbound Slack messages and in `notifyError()`.
   - Optionally apply to top-level error logging in `run.ts` (unhandled rejection/exception), keeping raw errors in debug logs only if needed.

4) Tests for runner loop and new behavior
   - Add `test/RunLoop.test.ts`:
     - Stub `ContractManager.create()` and `RebalanceManager` to avoid network.
     - Verify one cycle executes and respects ignore window (`IGNORE_DURATION_MS`).
     - Simulate an unhandled rejection with `ECONNREFUSED` to assert the bot stops.
   - Add `test/RebalanceRetry.test.ts`:
     - Unit-test `retryTransaction()` treats `ECONNREFUSED` as retryable.
   - Update `test/SwapDataBuilder.test.ts`:
     - Set env `EXACT_OUT_INPUT_CAP_BPS` and assert input cap reflects env override.
   - Add `test/Sanitize.test.ts`:
     - Ensure Slack tokens and 64-char hex strings are redacted in messages passed through `sanitizeForLogs` and via `NotificationManager`.

5) Documentation
   - In `README.md` (Testing/Architecture Decisions), add a short note explaining the rationale for 9-decimal percentage precision (avoids rounding error across small trial percentages while keeping math in integers).
   - In `config/constants.ts`, document `EXACT_OUT_INPUT_CAP_BPS` trade-offs and bounds.

### Acceptance criteria

- Transaction retry treats `ECONNREFUSED` as retryable; backoff and attempt limits unchanged.
- Exact-output input cap sourced from `EXACT_OUT_INPUT_CAP_BPS` env (default 15000), applied consistently for increase/decrease.
- Slack/error messages redact Slack tokens and 64-char private-key-like hex strings.
- New tests added and passing:
  - Run loop behavior and stop-on-ECONNREFUSED.
  - Retry classification for `ECONNREFUSED`.
  - Input cap env override honored.
  - Sanitization utility works and used by notifications.

### How to test

- Unit/integration tests:
  - `make test` [[memory:5262866]]
  - Or: `yarn hardhat test` (all suites)
  - Focused runs:
    - `yarn hardhat test --grep "RunLoop"`
    - `yarn hardhat test --grep "RebalanceRetry"`
    - `yarn hardhat test --grep "SwapDataBuilder"`
    - `yarn hardhat test --grep "Sanitize"`

- Manual dry-run:
  - Set `.env`: `NETWORK=localhost`, `PRIVATE_KEY=...`, `DRY_RUN=true`, optional `EXACT_OUT_INPUT_CAP_BPS=16000`.
  - Run: `yarn ts-node typescript/rebalance_bot/run.ts`
  - Kill network/RPC temporarily to observe retry behavior; confirm graceful stop on `ECONNREFUSED`.

### Rollout notes

- Start on testnet with conservative `EXACT_OUT_INPUT_CAP_BPS` (e.g., 15000) and monitor price impact/route stability.
- Keep `LOG_LEVEL=debug` initially to verify sanitization and retry decisions; revert to `info` after bake-in.

