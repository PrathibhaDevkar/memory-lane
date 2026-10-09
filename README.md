# Memory Lane

An AI agent that helps caregivers put together personal reminiscence sessions for people living with dementia. Built for the Qloo Agentic Hackathon.

Supports caregivers' activities. Not therapy and makes no medical claims.

- **Approach & decisions:** [docs/approach.md](docs/approach.md)
- **Phase 0 era-matching results:** [docs/phase0-results.md](docs/phase0-results.md)

## Local setup
```bash
cp .env.example .env.local   # then fill in your keys; .env.local is gitignored
node --env-file=.env.local scripts/phase0-era-test.mjs
```

## License
MIT. See [LICENSE](LICENSE).
