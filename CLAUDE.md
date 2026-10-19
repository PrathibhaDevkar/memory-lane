# Memory Lane: notes for Claude and the team

Memory Lane is a Qloo Agentic Hackathon entry: an agent that uses Qloo's taste graph to build personal reminiscence session kits for caregivers of people living with dementia, with Claude choosing the picks and writing the questions. This file is the handover for both of us and our Claude sessions: the rules, how the agent works, every step so far, and the measurements behind the design. Read it, and **[docs/plan.md](docs/plan.md)**, before changing behavior; the evidence behind decisions is in **[docs/research.md](docs/research.md)**. Add a row to the work log for every change you make.

**Deadline:** Oct 30, 2026, 11:45 pm ET (target Oct 29). The demo must stay **free and unrestricted for judges until Nov 16**.

@AGENTS.md

## Product rules (never break these)

1. **Supports caregivers' activities. Not therapy, no medical claims, no health or medication advice.** No "therapy", "treatment" or "improves memory" anywhere.
2. **Nothing invented.** Every song, film, place and dish in a kit must come from a Qloo tool result in the same run; `buildKit` removes anything else. An empty section shows a gap with its reason. Model-written activity ideas are labeled as suggestions.
3. **Safety check first.** A sudden change (`suddenChange: true`) returns the safety stop with no kit and **no Qloo or Claude call**. The next session always asks the question again.
4. **Questions invite stories, never test memory:** no "remember/recall", no quizzes, no statements about the person's past, one idea per card, adult language. Enforced in `lib/agent/validate-prompts.ts`.
5. **Things to avoid is required;** the content filter (ratings, War genre, theme summaries) runs on every Qloo result.
6. **Privacy:** nothing about a real person is stored or logged. Session notes stay in the browser. Demo personas are fictional; only the fictional example profile's kit is cached.
7. **Media is linked out** (YouTube/Spotify search URLs only), never embedded; no lyrics.
8. **Care wording lives in `lib/care.ts`;** change it there, nowhere else.

## Engineering rules

1. **Model: Claude Haiku 5.5 by default.** Every API call uses `claude-haiku-5-5` unless Sonnet 5.5 or Opus 5.5 has been approved by both Abil and Prathibha after a smoke-check audit (steps in [docs/token-alerts.md](docs/token-alerts.md#changing-the-model-audit-then-approve)). The approval is recorded in `CLAUDE_MODEL_APPROVAL` and must name the model; `agentConfig()` in `lib/agent/run.ts` falls back to Haiku and logs `model_not_approved` otherwise. Never change the default, add an automatic fallback to a bigger model, or raise `CLAUDE_EFFORT` on your own.
2. **Token use stays measured.** Keep the per-call usage logging, the kit audit, the response headers and the alerts. Any change to the agent flow, prompt or tools gets a smoke-check audit (`npm run smoke -- --report`) with its token numbers, compared with the last one. Costs and measurements are public on purpose: they show why decisions were made.
3. **Rules live in code, not the prompt.** The year window, hometown, content filter, grounding and safety check are applied by the tools and route, whatever Claude asks for.
4. **The agent loop is append-only.** Within one kit, send the same system prompt and tools on every call and never edit earlier messages; add text only to the user turn about to be sent. Claude's thinking blocks are bound to that history, and the API rejects edited history on accounts created on or after Aug 31, 2026. Finish by asking for `submit_kit` and refusing further lookups. Don't use forced `tool_choice`; Opus 5.5 and Sonnet 5.5 reject it.
5. **Grounding by handle.** Claude sees short handles (`a1`, `m2`, `d3`) instead of Qloo's 36-character IDs; `ctx.handle()` makes them and `ctx.idFor()` maps them back. An unknown handle fails grounding.
6. **`lib/types.ts` (zod) is the single contract** for the API, fixtures and the agent's output. Validate against it and don't redefine types; changes to it get their own PR.
7. **Qloo client (`lib/qloo/client.ts`):** key in the `X-Api-Key` header only; at most 2 calls in flight (Qloo returns 429 on bursts); `/search` returns a list, `/v2/insights` nests results under `results.entities`; never throws (failures become gaps).
8. **Next.js 16:** read the bundled docs in `node_modules/next/dist/docs/` before using a Next API (`dynamic`/`revalidate` exports are removed with Cache Components).
9. **Keys** never go in code, commits, issues, chat or screenshots: `.env.local` locally (gitignored), Vercel environment variables in deployments. Never read out or type a key.

## Working together

- **Branch flow:** for every change, branch from `feat/phase2-real-data` (`fix/...`, `feat/...` or `docs/...`), open a small PR into `feat/phase2-real-data`, squash-merge it, and keep the branch. `feat/phase2-real-data` reaches `main` only through [PR #2](https://github.com/PrathibhaDevkar/memory-lane/pull/2), when both of us decide (before submission).
- **Never push to or merge into `main`** directly.
- **Don't force-push a shared branch** unless the other person agrees first; if you must, use `--force-with-lease` and say so in the team workspace.
- **Pull before starting** (`git pull --ff-only`). Commit small, push often.
- **Ask the person you're working for before** pushing, opening or merging PRs, deploying, or changing Vercel settings.
- **Commits:** made as the person you're working for (their name and GitHub no-reply email), with **no Claude co-author, session links or "Generated with" footers**. The subject is one short plain-English line saying what changed; for bigger changes, a few short lines of why.
- **Names and cost figures can appear in the repo;** keys and private links can't. Plans, decisions and links go in the team workspace (linked in docs/plan.md).

## Project map

| Path | What it does |
| --- | --- |
| `app/api/kit/route.ts` | `POST /api/kit`: safety stop, then the saved kit (`KIT_SOURCE=fixture`) or the live agent (`agent`): example-kit reuse, limits, build, audit headers |
| `lib/agent/run.ts` | The agent loop, `lookUpFirst` (the usual lookups, run in code) and the model rule (`agentConfig`) |
| `lib/agent/prompts.ts` | System prompt and the `submit_kit` tool |
| `lib/agent/kit.ts` | `buildKit`: maps handles back, keeps grounded picks, checks questions and ideas |
| `lib/agent/validate-prompts.ts` | The question rules (no memory tests, one idea per card) |
| `lib/agent/audit.ts` | Per-kit audit, token alerts, response headers, prices |
| `lib/usage.ts` | Daily token and cost totals in Redis, daily alerts |
| `lib/qloo/tools.ts`, `lib/qloo/client.ts`, `lib/qloo/filters.ts` | Qloo tools with the rules in code; the HTTP client (2 calls in flight, retries, deadline); content and avoid-list filters |
| `lib/ratelimit.ts`, `lib/kit-cache.ts`, `lib/redis.ts` | Visitor and daily limits; example-kit reuse; the shared Upstash client |
| `lib/care.ts`, `lib/types.ts` | Care wording and kit limits per support level; the zod contract |
| `components/` | Intake form, kit view, safety stop, session mode, care note, trace panel |
| `scripts/smoke.mjs` | End-to-end check of 7 personas against a running app; prints tokens, cost, audit and alerts; `--report` writes `audits/*.md` |
| `docs/plan.md`, `docs/research.md`, `docs/token-alerts.md`, `docs/submission.md` | The plan and decisions; Qloo research and the tester script; alerts and model approval; the Devpost draft |
| `tests/` | Vitest: unit, contract and UI tests with no network (`tests/live` needs keys and `LIVE=1`) |

## How a live kit is built

1. `POST /api/kit` validates the profile. A sudden change returns the safety stop: no kit and no API call.
2. `KIT_SOURCE=fixture` returns the saved sample kit; `agent` continues.
3. If the profile is the form's example and Redis holds its recent kit, that kit is returned, labeled as reused: no Claude call, no limit used.
4. Visitor and daily limits (Upstash). Production refuses live kits while Redis isn't configured.
5. `lookUpFirst` runs one Qloo `/search` per favorite, then music, films, TV, places and dishes in parallel, seeded with the top match. A film or show from after the person's formative years doesn't seed music; with no other seed, music is seeded with the top film.
6. Usually one Claude call: Claude picks items by short handle and writes the questions in `submit_kit`. It may call a tool to fix a modern favorite, a missing tradition or the wrong match: at most 4 calls and 100 seconds per kit.
7. `buildKit` keeps only grounded picks and rule-abiding questions. The kit is audited; usage and alerts go to the log, today's totals and the response headers.

## Settings

All are listed in `.env.example`. A value already set in your shell wins over `.env.local`; Claude Code cloud sessions set `CLAUDE_EFFORT=max`, so unset it before running the app there.

| Variable | Default | Purpose |
| --- | --- | --- |
| `QLOO_API_KEY`, `ANTHROPIC_API_KEY` | none | API keys |
| `KIT_SOURCE` | `fixture` | `agent` for live kits (`npm run dev:agent` sets it) |
| `CLAUDE_MODEL` | `claude-haiku-5-5` | Sonnet or Opus only with `CLAUDE_MODEL_APPROVAL` naming the model |
| `CLAUDE_EFFORT` | `medium` | Thinking depth; lower only after a side-by-side check |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | none | Upstash Redis, set by Vercel's Upstash integration (or the `UPSTASH_REDIS_REST_*` pair) |
| `VISITOR_KITS_PER_HOUR`, `DAILY_LIVE_KITS` | 3, 100 | Live-kit limits (to revisit, see Open items) |
| `EXAMPLE_KIT_HOURS` | 6 | How long the example profile's kit is reused |
| `SMOKE_TOKEN` | none | Lets `scripts/smoke.mjs` skip the limits and always build fresh |
| `TOKEN_ALERT_KIT_*`, `TOKEN_ALERT_DAILY_*` | see docs/token-alerts.md | Token alert limits |

## Running and checking

```bash
npm ci
npm run dev                                     # sample kits (KIT_SOURCE=fixture)
npm run typecheck && npm run lint && npm test   # no network
npm run build                                   # Node 24
npm run dev:agent                               # live agent, needs keys in .env.local
npm run smoke -- rosa walt june --report        # in a second terminal; about $0.005 on Haiku
```

- **Before pushing:** typecheck, lint, tests and build, on Node 24.
- **Verify before calling something done:** run the tests, and for UI changes check it in the browser (desktop and phone width, light and dark).
- **Report results exactly as they happened.** Never claim tests, live runs or tester results that didn't happen. Testers are "adults aged 60+" or "people who have looked after an older relative", never "caregivers" or people with dementia.

## Deploying

- **Production** (https://memory-lane-two-umber.vercel.app) is updated by promoting a preview: `npx vercel promote <preview-url> --yes`. Branch pushes only make previews, which need a Vercel login. Check production as an anonymous visitor afterwards.
- The claude.ai Vercel connector can't reach this project's scope; use the Vercel CLI (`npx vercel`).
- Live kits need `KIT_SOURCE=agent`, both API keys, Upstash Redis and `SMOKE_TOKEN` set in Vercel. Demo kits and the safety stop are never limited. Kill switch: `KIT_SOURCE=fixture` and redeploy.

## Known gotchas

- **Cloud-synced folders:** don't keep the repo where files can become cloud-only placeholders: iCloud Desktop/Documents on macOS, OneDrive Desktop/Documents ("Files On-Demand") on Windows. Tests then hang at 0% CPU waiting for downloads. Fix: move the repo to a local folder, delete `node_modules` and `.next`, and run `npm ci`. On macOS, `find node_modules -type f -flags +dataless | wc -l` counts cloud-only files.
- **Shell commands differ by OS.** Commands here are written for bash (macOS, Linux, Claude cloud sessions, Git Bash on Windows). In PowerShell, use the equivalent (e.g. `Remove-Item -Recurse -Force node_modules`). macOS has no `timeout` command.
- **`npm run typecheck` runs `next typegen` first;** plain `tsc` in a fresh checkout fails on `LayoutProps`.
- **`next dev` rewrites `AGENTS.md`.** Commit it as-is rather than removing it.

## Work log

Every step so far, oldest first. Commit IDs are on `feat/phase2-real-data`.

| Date | Step | What changed and why | Where |
| --- | --- | --- | --- |
| Oct 14–15 | Phase 1 and Phase 2 built (Prathibha) | Walking skeleton on Vercel, shared contract, Qloo tools and safety filters, the Claude loop, care features (safety check, support levels, question rules), session mode, care note, trace panel, demos | PR #1, PR #2 |
| Oct 15 | Reviews of PR #1 and PR #2 (Abil with Claude) | Bugs found in the agent loop, Qloo client, filters and UI; the fixes are the next two rows | Review notes |
| Oct 15 | Agent and Qloo fixes | Same tools on every turn, with a "finish now" note instead of removing tools; one 100 s deadline with abortable Claude and Qloo calls; avoid list matches plurals, topics and comma lists; sensitive themes match at word starts; each dish is credited to the restaurant that listed it; the Qloo client hands freed slots to the next waiter | `1685a2c` |
| Oct 15 | UI fixes | "Build the next kit" uses the kit's own profile and the 10-item avoid limit; focus handling; avoid list splits on new lines only; dark mode on screens only; Spotify links by URL; Rosa's sample no longer credits Giordano's (opened 1974) | `d43b122` |
| Oct 16 | Deploy failure diagnosed | An early docs commit had been cut from `main`, which has no app, so its Vercel build failed; a later commit replaced it. No redeploy was needed | `docs/team-workspace-link` |
| Oct 17 | Token plan and go-live guide | Cost-per-kit estimates, budget and guardrails; an 8-step guide to keys, limits, Vercel and rollback (a shared Claude doc; ask Abil for access) | — |
| Oct 18 | Live APIs connected | Prompt caching; favorites looked up in code; per-call token logging; Upstash limits (3 per visitor an hour, 100 a day); spend limit answers 503 "Live kits are paused"; smoke prints tokens and cost | `b07d2ab` |
| Oct 18 | Merged into the Phase 2 branch | `fix/phase2-review` fast-forwarded into `feat/phase2-real-data` | PR #2 |
| Oct 19 | Team workspace linked; PR #1 closed | The workspace link added to the plan via a short branch (PR #3, squash-merged); PR #1 closed because PR #2 holds every Phase 1 commit | `0e80731`, PR #3 |
| Oct 19 | Commits re-authored as Abil | Git identity set to Abil's GitHub no-reply address, signing off, Claude lines removed; the 4 earlier commits rewritten with their original dates and force-pushed with a safety lease; Prathibha's commit kept with her name, date and change | `0e80731` and earlier |
| Oct 19 | Token cut | The usual lookups run in code, so a typical kit takes 1 Claude call instead of 2; short handles instead of Qloo IDs; slightly shorter lists; only tools and system prompt cached; at most 4 calls; the example profile's kit reused for 6 hours | `00baeb3` |
| Oct 19 | Haiku default, audits, token alerts | Haiku 5.5 is the default, Sonnet or Opus only with a recorded approval; each live kit is audited and returns usage and alerts in its headers; daily totals and alerts in Redis; `smoke --report`; [docs/token-alerts.md](docs/token-alerts.md) | `21a06e9` |
| Oct 19 | One shared CLAUDE.md | Both drafts merged: product rules, branch flow and checks from Prathibha's; model rule, token measurement, project map, settings, work log and measurements from Abil's. Settled: no Claude attribution, names and costs may be public | This commit |

## Measurements

Measured offline on the saved Qloo responses, with a scripted stand-in for Claude (Rosa, Walt, June). Claude's thinking isn't included: it can only be measured live.

| Per kit | Before (`b07d2ab`) | After (`00baeb3`) |
| --- | --- | --- |
| Claude calls | 2 | 1 |
| Characters Claude reads | ~27,000 | ~13,000 |
| Long Qloo IDs in what Claude reads | ~67 | 0 |
| Characters Claude writes | ~2,330 | ~1,425 |

Per person, characters read before and after: Rosa 26,778 → 13,122, Walt 27,764 → 13,603, June 27,655 → 13,631. All three kits filled the same sections before and after (4 songs, 2 films or shows, 1 dish, 1 place).

Estimated cost per kit at list prices on Oct 19, 2026 (prices in [docs/token-alerts.md](docs/token-alerts.md#limits)). Thinking is the least certain part:

| Model | Cost per kit (US$, est.) | Kits per $40 |
| --- | --- | --- |
| `claude-haiku-5-5` (default) | about 0.001 | about 36,000 |
| `claude-sonnet-5-5` | about 0.022 | about 1,800 |
| `claude-opus-5-5` | about 0.045 | about 890 |

Not yet measured live: no session so far has had API keys. The first live step is the smoke check with `--report` on Haiku.

## Open items

- First live smoke check on Haiku with `--report` (Claude API key coming from Abil); commit the report under `audits/`. Check that Haiku accepts the `effort` setting.
- Vercel (Prathibha): keys, `KIT_SOURCE=agent`, `SMOKE_TOKEN`, Upstash for Redis, then promote.
- Visitor limit: revisit `VISITOR_KITS_PER_HOUR` after the live Claude phase, since judges must have access without restriction.
- Testers for Oct 24–25 (tester script in docs/research.md §5).
- Before submission: merge PR #2 (`feat/phase2-real-data` → `main`) when both agree.
- `docs/team-workspace-link` duplicates `0e80731`; delete it or keep it, once both agree.
