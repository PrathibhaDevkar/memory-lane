# Memory Lane

An AI agent that helps caregivers put together personal reminiscence sessions for people living with dementia. Built for the Qloo Agentic Hackathon.

Supports caregivers' activities. Not therapy and makes no medical claims.
Building a support system scalable to caregivers, from individuals to Nursing Care.
- **Plan:** [docs/plan.md](docs/plan.md): what we're building and why, decisions, care principles, design and diagrams, schedule, planned changes
- **Research:** [docs/research.md](docs/research.md): what our tests against the Qloo API showed

**Live demo:** https://memory-lane-two-umber.vercel.app (for now every request returns a sample kit built from saved Qloo results; live kits arrive in Phase 2)

## Local setup
Requires Node 24.
```bash
npm install
cp .env.example .env.local   # then fill in your keys; .env.local is gitignored
npm run dev                  # http://localhost:3000
```

```bash
npm test                     # vitest
npm run typecheck            # next typegen + tsc
npm run lint
```

Live agent locally (needs `QLOO_API_KEY` and `ANTHROPIC_API_KEY` in `.env.local`):
```bash
npm run dev:agent                                  # KIT_SOURCE=agent
node scripts/smoke.mjs http://localhost:3000       # builds a kit per persona and prints it
```
Live Qloo check without Claude: `set -a; source .env.local; set +a; LIVE=1 npx vitest run tests/live`.

Phase 0 era-matching test: `node --env-file=.env.local scripts/phase0-era-test.mjs`.
Rebuild the sample kit from its output: `node scripts/build-fixture-kit.mjs`.

## License
MIT. See [LICENSE](LICENSE).
