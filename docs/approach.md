# Memory Lane — approach going forward

Living doc. Update it when we change a decision. Change by PR.

## What we're building
An AI agent that helps caregivers put together reminiscence sessions for people living with dementia.
**Input:** birth year, hometown, 1–3 remembered favorites, things to avoid (required).
**Output:** a session kit: era-matched songs, a film/TV clip, a dish to talk about, a place to reminisce about, and open-ended conversation prompts.
Qloo's taste graph must **drive** the picks, not decorate them.

## Decisions from Phase 0 (see [phase0-results.md](phase0-results.md))

| # | Decision | Why |
|---|---|---|
| D1 | Every movie/TV Qloo call sets `filter.release_year.min/max` from the birth year (formative window = ages 10–30). Done in the wrapper code, not left to Claude. | Without it, 0% in-era for 2 of 3 personas. |
| D2 | Music era comes from the favorite (`signal.interests.entities`). Any entity type can seed music (a film works: *The Sound of Music* → Carole King, Carpenters). If the favorite is modern, the agent seeds music with the top in-era film from the year-filtered screen results instead. Verified Oct 14: Taylor Swift → *Mary Poppins* (1964) → Frank Sinatra, Dean Martin, Carole King ([phase2-recheck.md](phase2-recheck.md)). | `filter.release_year` doesn't apply to artists. |
| D3 | Content-safety filter on every result, on top of the caregiver's "things to avoid": drop explicit/mature titles and anything *about* dementia, illness, death, war or trauma. Four checks: rating blocklist (R, NC-17, X, TV-MA); Qloo's **War** genre; sensitive phrases in `plot_themes_description` **only**; profanity in the title. Filtered items show in the trace as "excluded: reason". | Phase 0 returned *Still Alice*, *Holocaust*, explicit titles. Oct 14 re-check: matching phrases against **keyword tags** excluded *The Sound of Music* (tagged "Nazi"), *The Princess Bride* and 19 of June's 25 TV shows, because keyword tags record minor plot details, not what a film is about. The theme-only version excludes all 8 known offenders and keeps every classic tested. |
| D4 | Places: prefer historic landmarks / long-standing venues. Framed like the dish: "a place to talk about," not a visit recommendation. The genre allowlist narrows candidates; Claude then picks one that existed in the person's era and says why. Same for the dish: pick a restaurant that fits the era. | Raw place results are mostly current businesses. Oct 14: the allowlist also lets in modern attractions (Cloud Gate 2006, Millennium Park 2004, Upside Down House, Madcap Motel) and theme-park or 1990s restaurants (Krusty Burger, Bubba Gump), so era judgment is still needed after it. |
| D5 | Demo comparison = modern favorite vs. era favorite, plus LLM-only vs. Memory Lane toggle. | Qloo rejects requests with no favorite (400). |
| D6 | If a Qloo call fails, the kit shows the gap and the reason. Never fill it with invented data. | Project rule. |
| D7 | Don't send `signal.demographics.age` on insights calls. Era comes from the seed favorite (D2) and year filters (D1) only. | A/B on the Sinatra seed (Oct 8): no age → Armstrong, Nat King Cole, Doris Day, Mel Tormé (purest era list); `55_and_older` → adds Paul Anka, Harry Connick Jr.; `24_and_younger` → Nina Simone, Manhattan Transfer, Sara Gazarek. The age signal reflects what that age group likes *today*, not when they were young. (The Phase 0 script still sends it; results doc reflects that.) |

## Non-negotiable rules
- `QLOO_API_KEY` / `ANTHROPIC_API_KEY` only in `.env.local` (gitignored) and Vercel env vars. All Qloo and Claude calls server-side.
- Conversation prompts are open questions, never statements about the person's past. Enforced in the system prompt **and** a validator.
- Media is linked out (YouTube/Spotify search links), never embedded. No lyrics.
- The dish is something to talk about, with a dietary caveat, not a recipe.
- Supports caregivers' activities. Never called therapy, no medical claims.
- Demo personas are fictional. No real resident data stored.

## Stack
Next.js (App Router, TypeScript, Tailwind) on Vercel · Claude API with tool use · Qloo hackathon API (`/search`, `/v2/insights`) · Upstash Redis for rate limiting and feedback.

## Code layout
See [implementation-plan.md §7](implementation-plan.md#7-repository-layout-target).

## Git workflow
All changes land on `main` by PR, one per phase from `feat/memory-lane-build`. Review on Vercel preview URLs.

## Timeline
Re-baselined Oct 14. Day-by-day schedule: [implementation-plan.md §8](implementation-plan.md#8-timeline-and-phase-plan).

| Phase | Dates | Scope | Status |
|---|---|---|---|
| 0 | Oct 8–9 | Era-matching test | ✅ Done: GO |
| 1 | Oct 14–15 | Repo, license, Next.js scaffold, `lib/types.ts`, walking skeleton deployed on Vercel | Live: [memory-lane-two-umber.vercel.app](https://memory-lane-two-umber.vercel.app) (sample kit). Caregiver tester still to book |
| 2 | Oct 16–18 | Qloo wrappers, agent loop, real data behind `/api/kit`, 3 personas. **Gate: end-to-end on live URL by Oct 18** | |
| 3 | Oct 19–25 | LLM-only vs Memory Lane toggle, trace panel, feedback loop, cached demo personas, one real caregiver test | |
| 4 | Oct 26–29 | Mobile, loading/error states, README, 2-min video, Devpost text, stranger test, **submit Oct 29** (hard deadline Oct 30, 10:45 PM CDT) | |

Submission needs ([official rules](https://qloo.devpost.com/rules)): a working demo link, a **public** repo with an open-source license visible in About (MIT; repo public since Oct 14), and a text description. A video isn't required, but judges may score from the description and video alone, so we make one. The demo must stay free and unrestricted until judging ends **Nov 16**. Other APIs and data are allowed if we're authorized under their terms; Qloo must stay central. Business view and judging criteria: [business-case.md](business-case.md).

## Open questions
- ~~Places for Los Angeles?~~ Answered Oct 14: 7 allowlisted places for June with `take=50` (Hollywood Sign, Spadena House, Natural History Museum…).
- ~~Dish for Los Angeles?~~ Answered Oct 14: a separate restaurants call (`filter.tags=urn:tag:genre:place:restaurant`, `take=50`) finds dishes for all three cities, e.g. In-N-Out Burger for June. The tag filter still lets in some hotels and live-music venues, so `get_dish` keeps only places that list `specialty_dishes`.
