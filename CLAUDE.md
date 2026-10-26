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
6. **Privacy:** nothing about a real person is stored or logged. Session notes stay in the browser. Demo personas are fictional; only the fictional example profile's kit is cached. Analytics (PostHog) send only the events and properties in `lib/analytics/events.ts`: never profile details or the support level, kit contents, session reactions or the safety check, and nothing is stored on the device ([docs/analytics.md](docs/analytics.md)).
7. **Media is linked out** (YouTube/Spotify search URLs only), never embedded; no lyrics.
8. **Care wording lives in `lib/care.ts`;** change it there, nowhere else.

## Engineering rules

1. **Model: Claude Haiku 5.5 by default.** Every API call uses `claude-haiku-5-5` unless Sonnet 5.5 or Opus 5.5 has been approved by both Abil and Prathibha after a smoke-check audit (steps in [docs/token-alerts.md](docs/token-alerts.md#changing-the-model-audit-then-approve)). The approval is recorded in `CLAUDE_MODEL_APPROVAL` and must name the model; `agentConfig()` in `lib/agent/run.ts` falls back to Haiku and logs `model_not_approved` otherwise. Never change the default, add an automatic fallback to a bigger model, or raise `CLAUDE_EFFORT` on your own.
2. **Token use stays measured.** Keep the per-call usage logging, the kit audit, the response headers (a streamed build carries the same audit in its last line), the alerts and the `kit_built` analytics event. Any change to the agent flow, prompt or tools gets a smoke-check audit (`npm run smoke -- --report`) with its token numbers, compared with the last one. Costs and measurements are public on purpose: they show why decisions were made.
3. **Rules live in code, not the prompt.** The year window, hometown, content filter, grounding and safety check are applied by the tools and route, whatever Claude asks for.
4. **The agent loop is append-only.** Within one kit, send the same system prompt and tools on every call and never edit earlier messages; add text only to the user turn about to be sent. Claude's thinking blocks are bound to that history, and the API rejects edited history on accounts created on or after Aug 31, 2026. Finish by asking for `submit_kit` and refusing further lookups. Don't use forced `tool_choice`; Opus 5.5 and Sonnet 5.5 reject it. The short traditions call (`musicForTraditions`) is a separate one-off request with no tools and no history, not part of the loop.
5. **Grounding by handle.** Claude sees short handles (`a1`, `m2`, `d3`) instead of Qloo's 36-character IDs; `ctx.handle()` makes them and `ctx.idFor()` maps them back. An unknown handle fails grounding.
6. **`lib/types.ts` (zod) is the single contract** for the API, fixtures and the agent's output. Validate against it and don't redefine types; changes to it get their own PR.
7. **Qloo client (`lib/qloo/client.ts`):** key in the `X-Api-Key` header only; at most 2 calls in flight (Qloo returns 429 on bursts); `/search` returns a list, `/v2/insights` nests results under `results.entities`; never throws (failures become gaps).
8. **Next.js 16:** read the bundled docs in `node_modules/next/dist/docs/` before using a Next API (`dynamic`/`revalidate` exports are removed with Cache Components).
9. **Keys** never go in code, commits, issues, chat or screenshots: `.env.local` locally (gitignored), Vercel environment variables in deployments. Never read out or type a key.

## UI for older adults

Many caregivers are older themselves, and session mode may be held up for the person to see. Keep these when changing the UI:

- **Text:** body text, hints and errors at least 18px (`text-base`); `text-sm` only for technical detail such as the trace steps. Text at least 7:1 against its background (WCAG AAA).
- **Targets:** buttons and button-like links use `.btn` with `.btn-primary`, `.btn-secondary` or `.btn-link` (`app/globals.css`), at least 48px tall. Inputs and choices are at least 48px too, with a `border-control` edge (at least 3:1); `border-line` is only for decorative dividers.
- **Text size:** the header's Standard, Large and Largest (18, 21 and 24px) scale the whole page because every size is in rem, so never size anything in px. The choice is kept in this browser only (`lib/text-size.ts`).
- **Forgiving:** leaving a kit never loses it ("Back to …'s kit"); confirmations stay up for 4 seconds and are announced to screen readers.
- **Read aloud:** session cards can be read aloud, only with a voice that runs on the device (`lib/read-aloud.ts`), so a card's words never go to an online speech service. No such voice, no button.
- **Check** at phone and desktop width, light and dark, at Standard and at Largest.

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
| `lib/kit-stream.ts` | The live build's progress stream (newline-delimited JSON) that the page asks for, and its reader |
| `lib/agent/run.ts` | The agent loop, `lookUpFirst` (the usual lookups, run in code), the short traditions call (`musicForTraditions`) and the model rule (`agentConfig`) |
| `lib/agent/prompts.ts` | System prompt and the `submit_kit` tool |
| `lib/agent/kit.ts` | `buildKit`: maps handles back, keeps grounded picks, checks questions and ideas |
| `lib/agent/validate-prompts.ts` | The question rules (no memory tests, one idea per card) |
| `lib/agent/audit.ts` | Per-kit audit, token alerts, response headers, prices |
| `lib/usage.ts` | Daily token and cost totals in Redis, daily alerts |
| `lib/analytics/`, `instrumentation-client.ts` | PostHog: the allowed events (`events.ts`), settings (`config.ts`), `track()` in the browser, token use from the server (`server.ts`); started in the browser by `instrumentation-client.ts` |
| `lib/qloo/tools.ts`, `lib/qloo/client.ts`, `lib/qloo/filters.ts` | Qloo tools with the rules in code; the HTTP client (2 calls in flight, retries, deadline); content and avoid-list filters |
| `lib/ratelimit.ts`, `lib/kit-cache.ts`, `lib/redis.ts` | Visitor and daily limits; example-kit reuse; the shared Upstash client |
| `lib/care.ts`, `lib/types.ts` | Care wording and kit limits per support level; the zod contract |
| `lib/session.ts`, `lib/read-aloud.ts` | Session cards, reactions, the care note and the next kit's profile (what lit up becomes a favorite, what was stopped at is avoided), all in the browser; read aloud with an on-device voice |
| `components/` | Intake form, kit view, safety stop, session mode, care note, trace panel, text size control, analytics note |
| `components/` | Intake form, build progress, kit view, safety stop, session mode, care note, trace panel, text size control, analytics note |
| `lib/text-size.ts`, `app/globals.css` | The reader's text size (kept in this browser only); the palette, text sizes and `.btn` styles for older adults |
| `scripts/smoke.mjs` | End-to-end check of 7 personas against a running app; prints tokens, cost, audit and alerts; `--report` writes `audits/*.md` |
| `docs/plan.md`, `docs/research.md`, `docs/token-alerts.md`, `docs/analytics.md`, `docs/submission.md` | The plan and decisions; Qloo research and the tester script; alerts and model approval; what analytics send and the PostHog setup; the Devpost draft |
| `tests/` | Vitest: unit, contract and UI tests with no network (`tests/live` needs keys and `LIVE=1`); `tests/token-budget.test.ts` fails if Claude would read noticeably more |

## How a live kit is built

1. `POST /api/kit` validates the profile. A sudden change returns the safety stop: no kit and no API call.
2. `KIT_SOURCE=fixture` returns the saved sample kit; `agent` continues.
3. If the profile is the form's example and Redis holds its recent kit, that kit is returned, labeled as reused: no Claude call, no limit used.
4. Visitor and daily limits (Upstash). Production refuses live kits while Redis isn't configured.
5. `lookUpFirst` runs one Qloo `/search` per favorite, then music, films, TV, places and dishes in parallel, seeded with the top match. A film or show from after the person's formative years doesn't seed music; with no other seed, music is seeded with the top film. Qloo gives artists no year, so when only artists seed music, a second list seeded with the top film (`music_from_film`) lets Claude replace a modern favorite's music without another call. Film and TV theme summaries are sent only when the caregiver listed something to avoid. With traditions, one short Claude call (no tools, no thinking) names an artist alongside these lookups, and the code looks it up (`tradition_music`); if that fails, the message asks Claude to do it (`to_do`).
6. One Claude call: Claude picks items by short handle and writes the questions in `submit_kit`. It may call a tool to fix the wrong match: at most 4 calls and 100 seconds per kit.
7. `buildKit` keeps only grounded picks and rule-abiding questions. The kit is audited; usage and alerts go to the log, today's totals and the response headers, and a `kit_built` event goes to PostHog after the response.
8. The page watches steps 5 to 7 happen: it asks for newline-delimited JSON (`lib/kit-stream.ts`), and each Qloo lookup, screening and Claude call shows as it finishes (`components/BuildProgress.tsx`); the last line is the answer, with the audit. Anything that doesn't ask (the smoke check, curl) gets plain JSON with the audit headers, as before.

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
| `NEXT_PUBLIC_POSTHOG_KEY` | none | PostHog project API key (`phc_…`); analytics are off without it. Built into the page: changing it needs a rebuild |
| `NEXT_PUBLIC_POSTHOG_REGION` | `us` | PostHog Cloud region, `us` or `eu` |

## Running and checking

```bash
npm ci
npm run dev                                     # sample kits (KIT_SOURCE=fixture)
npm run typecheck && npm run lint && npm test   # no network
MEASURE=1 npx vitest run tests/token-budget.test.ts   # what Claude reads per kit, offline
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
- Analytics need `NEXT_PUBLIC_POSTHOG_KEY`, set in Vercel for Preview and Production since Oct 21. It has to be the **Config** type (Vercel won't save a `NEXT_PUBLIC_` variable as Secret), and it's built into the page, so a change needs a redeploy.

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
| Oct 19 | One shared CLAUDE.md | Both drafts merged: product rules, branch flow and checks from Prathibha's; model rule, token measurement, project map, settings, work log and measurements from Abil's. Settled: no Claude attribution, names and costs may be public | `84524ca`, PR #4 |
| Oct 19 | First live audit on Haiku; two fixes | All 6 personas passed live (key scoped to the `memory-lane` workspace; Haiku accepts `effort`). Reading the kits found two problems. (1) The question check missed cards that open with the person's name ("Rosa, what…"): it counted 0 open questions and dropped "Rosa, tell me about…" as not a question; it now reads past the name, which also lets the "you loved…" rule see the real start of the card. (2) Elena's traditions ("Catholic hymns") were never looked up; the code now adds a `to_do` to that kit's message asking Claude to resolve an artist of the tradition from the person's formative years (a search for the tradition's own words finds bands named "Hymns"). Kits without traditions are unchanged | `24e13e2`, PR #5, [audits/2026-10-19-claude-haiku-5-5-medium.md](audits/2026-10-19-claude-haiku-5-5-medium.md) |
| Oct 19 | Care note punctuation | Activity ideas are full sentences, so the care note printed ".." and a full stop in the middle of a list ("…the music plays.. and …"), seen in a live session. Items now lose their own full stop, and a line gets one only if it doesn't already end in ".", "!" or "?" | `1641dbd`, PR #6 |
| Oct 20 | PR #5 and PR #6 merged (Abil with Claude) | Both approved and squash-merged after typecheck, lint and 188 tests passed with the two combined; their work-log rows conflicted, so both were kept | `24e13e2`, `1641dbd` |
| Oct 20 | Second token cut (Abil with Claude) | Driven by the first live audit: output (mostly thinking) was 80–90% of a one-call kit's cost, and Swift and Elena needed extra calls that re-read everything, earlier thinking included. (1) **Traditions:** one short Claude call (no tools, no thinking, about 100 tokens) names an artist alongside the lookups, and the code looks it up (`tradition_music`) instead of two more full calls; that artist can now be picked as music (Elena lost Bing Crosby before); if the call fails or Qloo has no match, the old `to_do` asks Claude. (2) **Modern favorites:** when only artists seed music, a second list seeded with the top in-era film (`music_from_film`) is ready, so Swift needs no second call. (3) Film and TV theme summaries only when the caregiver listed something to avoid. (4) Shorter system prompt and tool descriptions; "why" under 15 words; lists don't repeat artists. (5) `resolve_favorite` no longer turns an artist a lookup offered into an unpickable favorite. Qloo call cap 12 → 14. New `tests/token-budget.test.ts`. Measured offline only; the live smoke check is the next step | `6ec2f29`, PR #7 |
| Oct 20 | Live check of the second token cut (Prathibha) | Run live on `a0d4a7f` (Haiku 5.5, medium effort, the 6 personas): all passed, with 0 ungrounded picks. Swift took one Claude call (was 2) and Elena one plus the short traditions call (was 3), and Elena's alerts are gone; the short call named Bing Crosby in 0.9 s, so turning thinking off works live on Haiku. The kits read as well as before: picks from the right era, good questions, honest gaps for Lagos. Run without `--report`, so there is no audit file; the numbers are in Measurements | [PR #7 review](https://github.com/PrathibhaDevkar/memory-lane/pull/7#pullrequestreview-5603778166) |
| Oct 21 | Easier for older adults (Phase 3, Abil with Claude) | Hints, errors, the "why" lines, Watch for and the dish caveat at full size (18px, were 15.75px); grey text darkened to 8.6:1 (was 6.7:1) and the edges of inputs and buttons to 3.6:1 or more (were 1.3:1); every button and choice at least 48px tall; Spotify and YouTube links as buttons; a Text size control (Standard, Large, Largest, kept in this browser only); "Change details" no longer loses the kit; "Copied" stays for 4 seconds and is announced. Checked in the browser at phone and desktop width, light and dark, Standard and Largest | `5d3353c`, PR #8 |
| Oct 21 | PostHog analytics (Phase 3, Abil with Claude) | How the app is used, when, which screens and buttons, and each live kit's token use and cost, without anything about a real person. Only the events in `lib/analytics/events.ts` can be sent (12 browser events; `kit_built` and `kit_refused` from the server, after the response); no profile details, support level, kit contents, reactions or safety check, and a safety stop sends nothing. Cookieless (nothing stored on the device), no person profiles, no autocapture, recording, heatmaps or error capture; Do Not Track and Global Privacy Control turn it off; events go through `/ingest` on our own site. Off without `NEXT_PUBLIC_POSTHOG_KEY`. posthog-js 1.438.2 and posthog-node 5.55.0, with PostHog's own sub-packages held to releases at least two weeks old. Checked with a dummy key in the browser: every request bound for PostHog decoded, 13 events and no personal text; with PostHog unreachable a kit still returns at once. After Prathibha's review, the page says what it sends: when analytics are on, the footer says "We count which screens and buttons are used, without cookies and without anything you type" and links to docs/analytics.md, and the demo text says "no details are sent" (it said "nothing is sent", but opening a demo is counted) | `5d3353c`, PR #8, [docs/analytics.md](docs/analytics.md) |
| Oct 21 | PR #7 and PR #8 reviewed and merged (Prathibha) | PR #7 approved after her live run and squash-merged. She brought it into PR #8's branch, keeping both work-log rows (214 tests and the build passed), and reviewed PR #8: the larger text works on a phone at Largest (no overflow, smallest tap target 72px), and the analytics only send fixed labels. She asked for two wording fixes so the page says what analytics send (made by Abil with Claude, in the row above), ran PR #8 locally against a real PostHog project (nothing stored on the device, only listed properties, reactions send nothing, one event per click, `kit_built` arrives), then approved and squash-merged it | `6ec2f29`, `5d3353c` |
| Oct 21 | PostHog live (Prathibha) | PostHog project created (US Cloud) with Cookieless server hash mode and Discard client IP data on, and session replay, autocapture, heatmaps and web vitals off. `NEXT_PUBLIC_POSTHOG_KEY` set in Vercel for Preview and Production (Config type: Vercel refuses Secret for `NEXT_PUBLIC_`). Checked locally, on a preview and on production: no cookies or PostHog storage, only listed properties, no IP stored, reactions send nothing, `kit_built` arrives. The `/ingest` visitor check passed: one iPhone got different visitor IDs on mobile data and Wi-Fi. Production promoted with the larger text and analytics, still on sample kits | `066c794`, PR #9, [docs/analytics.md](docs/analytics.md#setting-it-up) |
| Oct 21 | PR #9 merged; live results recorded (Abil with Claude) | PR #9 merged after its 217 tests passed. Prathibha's Oct 20 live run of the second token cut added to the work log and Measurements, the open item that waited for it replaced, and the Phase 3 and PostHog rows pointed at their squash commits | `459a104`, PR #10 |
| Oct 21 | Today's work logged (Abil with Claude) | Rows for the reviews and merges of PRs #7 to #10; the Vercel open item updated now that production is promoted; the PostHog key's Vercel setting added to Deploying; genre tags added to the open items | `06425cf`, PR #11 |
| Oct 26 | The next kit builds on what lit up; read aloud (Phase 4, Abil with Claude) | The note said "Next time: more like Ella Fitzgerald", but the next kit only left out what was stopped. Now "Build the next kit" adds the songs, films and shows they lit up with to the favorites (within the limit of 3; any that don't fit are named), so Qloo seeds the next kit with them, and takes out of the favorites anything the session stopped at (P5); the note previews it and the form's notice names every change, for the caregiver to review. Still all in the browser. Session cards can be read aloud, only with an on-device voice (an online one is never chosen; none, no button), at 0.9 speed; new `read_aloud` analytics event with no properties. Checked in the browser with the sample kits (speech stubbed with one on-device and one online voice) at phone and desktop width, light and dark, Standard and Largest: the on-device voice read "Play a song: Ella Fitzgerald" and the question as written; the next kit's form had Frank Sinatra, Ella Fitzgerald and Nat King Cole; no console errors | This commit |
| Oct 26 | Live progress while a kit builds (Phase 4, Abil with Claude) | A live kit took 16–21 s behind a "Putting the kit together…" label. Now the page watches the agent work: each Qloo lookup, what was screened out and why (M\*A\*S\*H: war; *Julia*: grief), and "Claude is choosing…", as it happens, with plain words and the time so far. `/api/kit` streams newline-delimited JSON when the page asks for it and keeps plain JSON with the audit headers for the smoke check; the stream's last line carries the same audit. The steps come from the trace as it's recorded, so the agent itself is unchanged; music seeded with a film from the person's years is now labeled `get_music(from film)`. Checked in the browser against the real Next server with local stand-ins for Qloo (the saved responses) and Claude: steps arrived one by one over about 4 s, at phone and desktop width, light and dark, Standard and Largest, with no console errors | This commit |

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

**Measured live (Oct 19, Haiku 5.5, medium effort, 6 personas):** $0.0013–0.0019 per kit with one Claude call, $0.0025 for a kit with traditions (3 calls), $0.0105 for the whole run; 10–18 seconds per kit. Output (mostly thinking) is 2,100–3,400 tokens, above the ~1,500 estimated offline. Details: [audits/2026-10-19-claude-haiku-5-5-medium.md](audits/2026-10-19-claude-haiku-5-5-medium.md).

**Second token cut (Oct 20), measured offline** with `tests/token-budget.test.ts` on the saved Qloo responses (Elena on Rosa's responses with her traditions, so only sizes count):

| Characters Claude reads | Before (`1641dbd`) | After |
| --- | --- | --- |
| System prompt and tools (cached) | 7,370 | 6,288 |
| Rosa's message (nothing to avoid) | 5,027 | 3,695 |
| Swift's message (modern favorite) | 5,036 | 3,996 |
| Elena's message (traditions) | 5,497 | 3,799, plus a 302-character short call |
| Walt's and June's messages (avoid lists keep the theme summaries) | 5,452 and 5,490 | unchanged |

Expected per kit on Haiku, scaling the Oct 19 live numbers by these sizes and assuming thinking doesn't change (measured live below):

| Kit | Live Oct 19 | Expected |
| --- | --- | --- |
| Rosa | 1 call, 5,251 input tokens, $0.0013 | 1 call, about 4,200, about $0.0012 |
| Swift (modern favorite) | 2 calls, 10,656 input tokens, $0.0018 | 1 call, about 4,400, about $0.0013 |
| Elena (traditions) | 3 calls, 19,161 input tokens, $0.0025, two alerts | 1 call plus a short one, about 4,400, about $0.0014, no alerts |

A kit that starts with a cold cache writes the prefix at 1.25×: about 2,550 tokens now instead of 2,968, about $0.0003 instead of $0.0004.

**Measured live (Oct 20, Haiku 5.5, medium effort, 6 personas; Prathibha, on `a0d4a7f`):** all passed, with one Claude call per kit (Elena one plus the short traditions call). $0.0014–0.0018 per kit and $0.0093 for the whole run (was $0.0105 on Oct 19); 16–21 seconds per kit (10–18 on Oct 19). Costs came out a little above the estimates (Elena $0.0016 against about $0.0014) because Haiku thought a bit more in this run. No report file was saved.

| Kit | Claude calls | Cost (US$) | Total seconds |
| --- | --- | --- | --- |
| Rosa | 1 | 0.001511 | 16.3 |
| Walt | 1 | 0.001374 | 16.6 |
| June | 1 | 0.001498 | 19.2 |
| Rosa (Taylor Swift) | 1 | 0.001620 | 18.8 |
| Mr. Okafor | 1 | 0.001763 | 19.8 |
| Elena (traditions) | 1 + short | 0.001568 | 21.4 |

## Open items

- The effort side-by-side, `low` against `medium` (steps in [docs/token-alerts.md](docs/token-alerts.md#lowering-effort-side-by-side-first)): output is 80–90% of a one-call kit's cost, so this is the biggest lever left. Keep `medium` unless `low` holds up on all six personas. Run both with `--report` and commit the reports, since the Oct 20 live run of the second token cut wasn't saved as one.
- Still open from the first live audit: questions and comments can name an artist who isn't in the kit; `get_music` has no year filter, so a seed in the right era can still bring a later artist (Femi Kuti for Mr. Okafor). The traditions calls and the lost tradition artist are fixed by the second token cut.
- Genre tags: Prathibha's idea from a commit comment on the second token cut, to follow as a small PR on top of it (her review of PR #7).
- Vercel (Prathibha): keys, `KIT_SOURCE=agent`, `SMOKE_TOKEN`, Upstash for Redis, then promote again. Production was promoted on Oct 21 with Phase 3 and analytics on, still on sample kits.
- Visitor limit: revisit `VISITOR_KITS_PER_HOUR` after the live Claude phase, since judges must have access without restriction.
- Testers for Oct 24–25 (tester script in docs/research.md §5).
- Before submission: merge PR #2 (`feat/phase2-real-data` → `main`) when both agree.
- `docs/team-workspace-link` duplicates `0e80731`; delete it or keep it, once both agree.
