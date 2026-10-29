# Memory Lane

**Personal reminiscence sessions for people living with dementia, put together in a minute.**
An agent that uses Qloo's taste graph to find the music, films, food and places from someone's youth, and turns them into a gentle, one-card-at-a-time session for the person caring for them.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) ("Agents, but with taste").

> Memory Lane supports caregivers' activities. It is not therapy, makes no medical claims, and gives no health advice.

---

## Try it

**[memory-lane-two-umber.vercel.app](https://memory-lane-two-umber.vercel.app)**: click **Try a demo**.
- **Rosa**, born 1942 in Chicago, loves Frank Sinatra: a full kit, then **Start session**.
- **Margaret**, a sudden change today: the safety check stops the session and points to her nurse or doctor. No kit.

Demos open instantly in your browser: no sign-in, no wait, nothing sent.

Or build a kit live: fill in the form (or tap **Fill in an example (Rosa)**), choose **Build the session kit**, and watch each Qloo lookup and Claude step as it happens. Under the kit, **Compare with Claude on its own** shows what Qloo adds.

> **Status (Oct 29):** live. Kits are built by the agent (Claude Haiku 5.5 with Qloo) in about 10–20 seconds; the demos open instantly. Checked end to end on the live site on Oct 29.
<!-- Update the status line at each deploy. -->

---

## The problem

Reminiscence (music, films, food and places from someone's youth, plus gentle conversation) is a widely used, non-drug way to connect with people living with dementia. Making it *personal* is the hard part: it takes time, and knowledge of another person's era, hometown and tastes that a caregiver often doesn't have. A generic playlist misses the person; the wrong item can upset them.

## What it does

1. **A few details:** a quick safety check, the name they like to be called, how much support they need today, birth year, hometown, one to three remembered favorites, things to avoid, and optionally their former work, first language and traditions.
2. **A session kit:** songs, a film or TV show, a place and a dish to talk about, all from the years they were about 10 to 30, plus questions that invite a story instead of testing memory.
3. **Session mode:** one large card at a time on a tablet or phone: play a song, ask one question, note how it landed (Lit up · Calm · Not interested · Not today · Stop). Cards can be read aloud with the device's own voice.
4. **A session note:** what sparked a reaction, written up for the family or care team. Copy, print or send it to WhatsApp. It's built in your browser; Memory Lane keeps no copy.
5. **The next kit builds on it:** what lit them up becomes a favorite, so Qloo finds more like it; what the session stopped at is left out.

## How Qloo drives it

Qloo picks; the agent decides what to ask Qloo; code enforces the rules.

| What | How Qloo is used |
|---|---|
| **Finding the favorite** | `/search` resolves "Frank Sinatra" or *The Sound of Music* to a Qloo entity |
| **Music** | `/v2/insights` seeded with that entity: what people who love it also love. Artists whose Qloo description shows they began after the person's young years are screened out |
| **Films and TV** | `/v2/insights` with a **release-year window** from the birth year, so every title is from their youth |
| **Places** | `/v2/insights` with **location** = hometown, ranked to historic landmarks first |
| **A dish** | `/v2/insights` with a **restaurant tag** filter in the hometown, using restaurants' specialty dishes |
| **A modern favorite** | Someone born in 1942 who names Taylor Swift: the agent finds an in-era film through Qloo (*Mary Poppins*, 1964) and seeds music with it, which gives Frank Sinatra, Dean Martin and Carole King |
| **Safety** | Qloo's ratings, genres and theme summaries screen out mature titles and anything *about* dementia, illness, war, grief or abuse, before the agent sees them |

Every song, film, place and dish carries the Qloo ID that proves where it came from; anything the agent can't ground in a Qloo result this run is removed. Questions name only artists in the kit or the person's own favorites, written exactly as the cards show them. The few activity ideas the agent may add (for people who need more support) are labeled as suggestions, not Qloo data. The **"How this kit was made"** panel shows every Qloo lookup and what was screened out, and why.

**Compare with Claude on its own**, under each kit, shows what Qloo adds instead of claiming it. Claude gets the same person and the same care rules but no Qloo; each of its picks is then looked up in Qloo, given its release year and screened with the kit's filters, and each question goes through the question rules. The result sits next to the kit: picks found in Qloo, films from their years, picks the filters would leave out, questions that follow the rules. Only checks that ran count against Claude: a pick Qloo doesn't list is shown as "can't be checked", since Qloo may simply not have it under that name. It's for comparison only: those picks never reach a session.

## How the agent works

A Claude agent (Claude Haiku 5.5) with five Qloo tools (`resolve_favorite`, `get_music`, `get_screen`, `get_places`, `get_dish`) and a strict `submit_kit` step:
1. Code resolves the favorites and runs the usual Qloo lookups (music, films, TV, places, dishes) first, screened by the safety filters, so a typical kit needs **one Claude call**.
2. Claude chooses 3–5 songs, one or two films or shows, a place and a dish that fit this person and existed in their era, says why for each, and writes questions for their support level. If a lookup matched the wrong thing, it calls the Qloo tools itself.
3. Code checks every pick against what Qloo returned, and every question against the communication rules. A kit too thin to show goes back to Claude once.
4. Each kit allows at most 4 Claude calls and 100 seconds.

The year window, hometown and safety rules come from the caregiver's form and are applied in code, so the agent can't widen them. Diagrams and details: [docs/plan.md §5–8](docs/plan.md#5-architecture).

## Care principles built in

- **A safety check first.** A sudden change (new confusion, unusual drowsiness) is a reason to call a nurse or doctor, not to start an activity, so there is no kit. The page shows this as soon as "Yes" is chosen, and the API checks it before anything else.
- **Support changes day to day.** "Mostly independent", "needs some help" and "needs a lot of help" change the mix: stories and open questions; one short question at a time; music, touch and calm company.
- **No memory tests, no invented memories.** Questions never ask someone to remember, never quiz, and never state facts about their past; code rejects any that do.
- **Distress means stop.** Every kit lists signs to watch for; every card has "Not today" and "Stop"; anything stopped at is left out of the next kit.
- **Nothing invented.** If Qloo has nothing suitable, the kit says so instead of guessing.
- **Privacy.** Nothing about a real person is stored. Demo personas are fictional. Optional PostHog analytics count which screens and buttons are used and what each kit cost in tokens, cookieless and without anything a caregiver types ([docs/analytics.md](docs/analytics.md)).
- **Easy to read.** Large text and buttons, strong contrast, and a Text size control for older eyes.

## Measured, not guessed

- **Cost and speed:** about 0.1–0.15 US cents of Claude tokens per kit, in 10–20 seconds (live, Oct 27–29). That is what lets the demo stay free.
- **Tests:** 309 automated tests cover the Qloo filters (on real Qloo responses), the agent loop, the safety check, the question rules and the screens.
- **Audits:** every live check is in [`audits/`](audits/), including the [production audit](audits/2026-10-27-production-audit.md) (Oct 27) and the [end-to-end check](audits/2026-10-29-end-to-end-after-merges.md) after the last fixes (Oct 29).

## Built with

Next.js 16 (App Router, TypeScript, Tailwind) on Vercel · Claude API (Claude Haiku 5.5, tool use) · Qloo Hackathon API (`/search`, `/v2/insights`) · Upstash Redis (visitor limits) · PostHog (cookieless analytics) · zod · vitest.

---

## Run it locally

Requires Node 24.
```bash
npm install
cp .env.example .env.local   # then add QLOO_API_KEY and ANTHROPIC_API_KEY; .env.local is gitignored
npm run dev                  # http://localhost:3000, saved sample kit
npm run dev:agent            # the live agent (KIT_SOURCE=agent)
```

Settings are listed in [`.env.example`](.env.example): `CLAUDE_MODEL` (default `claude-haiku-5-5`) and `CLAUDE_EFFORT` (default `low`). A value already set in your shell wins over `.env.local`.

**Model rule:** Claude Haiku 5.5 is the default. Sonnet 5.5 or Opus 5.5 is used only after both of us approve it on a smoke-check audit (`npm run smoke -- --report`), recorded in `CLAUDE_MODEL_APPROVAL`; without that the app falls back to Haiku. Every live kit is audited (tokens, cost, quality bar), and its usage and any token alerts come back in the `/api/kit` response headers; see [docs/token-alerts.md](docs/token-alerts.md).

Live kits (and comparisons) are limited to 20 per visitor an hour and 1,000 a day (`VISITOR_KITS_PER_HOUR`, `DAILY_LIVE_KITS`), counted in Upstash Redis. In production, live kits stay off until Redis is configured; sample kits and the safety stop are never limited. When the Claude spend limit is reached, the app says live kits are paused.

To keep Claude's token use low, the usual Qloo lookups run in code before Claude is called, including music for a modern favorite and for the caregiver's traditions, so a kit takes one Claude call (plus a short one that names an artist when traditions are given); Claude reads short handles (`a1`, `m2`) instead of Qloo's 36-character IDs; the tools and system prompt are cached; and the live kit for the form's example profile is reused for `EXAMPLE_KIT_HOURS` (default 6), so repeat demo clicks cost nothing.

## Tests

```bash
npm test                     # unit, contract and UI tests (no network)
npm run typecheck
npm run lint
node scripts/smoke.mjs http://localhost:3000            # 7 personas end to end against a running app
npm run smoke -- rosa walt june                         # the same with .env.local loaded: SMOKE_TOKEN skips the limits; prints tokens and cost per kit
npm run smoke -- rosa --compare                         # also Claude on its own for each persona, checked against Qloo
set -a; source .env.local; set +a; LIVE=1 npx vitest run tests/live   # the Qloo tools against the real API
```

## Docs

- **[docs/plan.md](docs/plan.md):** what we're building and why, decisions, care principles, architecture and diagrams, schedule.
- **[docs/research.md](docs/research.md):** what our tests against the Qloo API showed, and the tester study.
- **[CLAUDE.md](CLAUDE.md):** the work log, measurements and open items.
- **[docs/token-alerts.md](docs/token-alerts.md)** and **[docs/analytics.md](docs/analytics.md):** token limits and alerts, and exactly what analytics count.
- **[audits/](audits/):** live smoke checks and audits of the site.

## What's next

Built to grow from individual caregivers to care homes: saved resident profiles (with consent and proper privacy work first), group sessions that find the overlap in several residents' eras, family contributions, and kits in more languages.

## License

MIT. See [LICENSE](LICENSE).
