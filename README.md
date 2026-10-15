# Memory Lane

An AI agent that helps caregivers put together personal reminiscence sessions for people living with dementia. Built for the Qloo Agentic Hackathon.

Supports caregivers' activities. Not therapy and makes no medical claims.
Building a support system scalable to caregivers, from individuals to Nursing Care.
- **Implementation plan (architecture, agent loop, timeline, diagrams):** [docs/implementation-plan.md](docs/implementation-plan.md)
- **Business case (audience, judging criteria, roadmap):** [docs/business-case.md](docs/business-case.md)
- **Approach & decisions:** [docs/approach.md](docs/approach.md)
- **Phase 0 era-matching results:** [docs/phase0-results.md](docs/phase0-results.md)

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

Phase 0 era-matching test: `node --env-file=.env.local scripts/phase0-era-test.mjs`.
Rebuild the sample kit from its output: `node scripts/build-fixture-kit.mjs`.

## License
MIT. See [LICENSE](LICENSE).
