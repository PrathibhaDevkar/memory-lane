# Memory Lane — approach going forward

Living doc. Update it when we change a decision. Change by PR so both of us see it.

## What we're building
An AI agent that helps caregivers put together reminiscence sessions for people living with dementia.
**Input:** birth year, hometown, 1–3 remembered favorites, things to avoid (required).
**Output:** a session kit: era-matched songs, a film/TV clip, a dish to talk about, a place to reminisce about, and open-ended conversation prompts.
Qloo's taste graph must **drive** the picks, not decorate them.

## Decisions from Phase 0 (see [phase0-results.md](phase0-results.md))

| # | Decision | Why |
|---|---|---|
| D1 | Every movie/TV Qloo call sets `filter.release_year.min/max` from the birth year (formative window = ages 10–30). Done in the wrapper code, not left to Claude. | Without it, 0% in-era for 2 of 3 personas. |
| D2 | Music era comes from the favorite (`signal.interests.entities`). If the favorite is a movie or modern, the agent first finds an era-appropriate artist to use as the seed. | `filter.release_year` doesn't apply to artists. |
| D3 | Content-safety filter on every result, on top of the caregiver's "things to avoid": drop explicit/mature titles and anything about dementia, illness, death, war or trauma. Filtered items show in the trace as "excluded: reason". | Phase 0 returned *Still Alice*, *Holocaust*, explicit titles. |
| D4 | Places: prefer historic landmarks / long-standing venues. Framed like the dish: "a place to talk about," not a visit recommendation. | Raw place results are mostly current businesses. |
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
Next.js (App Router, TypeScript, Tailwind) on Vercel · Claude API with tool use · Qloo hackathon API (`/search`, `/v2/insights`, `/v2/tags`) · feedback storage TBD (Supabase or Upstash Redis), Phase 3 only.

## Who owns what
```
lib/qloo/      Prathibha (A): Qloo client + typed tool wrappers, caching, D1/D3 filters
lib/agent/     Prathibha (A): agent loop, prompts, trace
app/api/       Prathibha (A): POST /api/kit
app/(pages)/   Abil (B): intake, kit page
components/    Abil (B)
lib/types.ts   Shared contract (Profile, Kit, TraceStep): change only with both agreeing
```

## Git workflow
`main` protected. All changes by PR, reviewed by the other person. Branches `feat/...`, `fix/...`, merged within 1–2 days. Review on Vercel preview URLs.

## Timeline
| Phase | Dates | Scope | Status |
|---|---|---|---|
| 0 | Oct 8–9 | Era-matching test | ✅ Done: GO |
| 1 | Oct 8–10 | Repo, license, Next.js scaffold, Vercel deploy, env vars, `lib/types.ts` | Next |
| 2 | Oct 11–18 | Qloo wrappers, agent loop, `/api/kit`, intake, kit page, 3 personas. **Gate: end-to-end on live URL by Oct 18** | |
| 3 | Oct 19–25 | LLM-only vs Memory Lane toggle, trace panel, feedback loop, cached demo personas, one real caregiver test | |
| 4 | Oct 26–29 | Mobile, loading/error states, README, 2-min video, Devpost text, stranger test, **submit Oct 29** (hard deadline Oct 30, 10:45 PM CDT) | |

Submission needs: live hosted demo, **public** repo (flip from private before submitting), MIT license visible in About, text description, 2-min video.

## Open questions
- Feedback storage: Supabase or Upstash Redis?
- Places: does `/v2/tags` have a landmark/historic tag we can filter on? Test in Phase 2.
- Dish: Qloo has restaurant places and cuisine tags but no dish entity. Agent picks a dish from the cuisine; confirm approach.
