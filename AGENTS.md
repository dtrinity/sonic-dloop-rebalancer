# Repository Guidelines

## Project Structure & Module Organization

- `contracts/`: Solidity contracts and mocks.
- `typescript/`: Bot sources (e.g., `rebalance_bot/run.ts`, managers, utils).
- `config/`: Network, constants, and types.
- `test/`: Hardhat tests (`*.test.ts`) and `fixtures.ts`.
- `artifacts/`, `cache/`, `typechain-types/`: Build outputs (generated).
- `scripts/sh/`: Docker entrypoint and helper scripts.

## Build, Test, and Development Commands

- `make install`: Install dependencies (Yarn 3).
- `make compile` / `yarn compile`: Compile contracts and generate TypeChain types.
- `make test` / `yarn test`: Run Hardhat test suite.
- `make lint`: Lint and auto-fix TypeScript.
- `make format` / `yarn format`: Format code with Prettier.
- `make docker.build` / `make docker.run.daemon`: Build and run the bot in Docker.
- Local run (dev): `npx ts-node typescript/rebalance_bot/run.ts`.

## Coding Style & Naming Conventions

- TypeScript: 2-space indent, camelCase, explicit return types (tests exempt).
- Imports: sorted via `simple-import-sort`; unused imports disallowed.
- Lint/format: ESLint + Prettier configured in `eslint.config.mjs`.
- JSDoc: required for code, relaxed in tests.
- Solidity: target `^0.8.20`; keep interfaces minimal and safe math by compiler.

## Testing Guidelines

- Framework: Hardhat + Mocha/Chai (TypeScript).
- Location/naming: place tests in `test/` as `*.test.ts`.
- Usage examples:
  - All tests: `make test`
  - Filter by suite: `npx hardhat test --grep "RebalanceManager"`
- Prefer focused unit tests plus end-to-end flows using provided `fixtures.ts`.

## Commit & Pull Request Guidelines

- Commits: concise, imperative present tense (history uses short messages).
  - Example: `Fix exactOutput naming`, `Implement retry backoff`.
- Branches: `feature/...`, `fix/...`, `chore/...`.
- PRs must include: clear description, rationale, test plan/outputs, linked issues, and any config updates. Add logs/screenshots for behavior changes.

## Security & Configuration Tips

- Secrets: never commit `.env`; start from `.env.example`.
- Required vars: `PRIVATE_KEY`, `NETWORK`, optional `SLACK_TOKEN`, `DRY_RUN`.
- Networks: see `hardhat.config.ts` and `config/networks/*`.
- Safety: use `DRY_RUN=true` for first runs; validate addresses on testnet before mainnet.
