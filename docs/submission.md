# Memory Lane: Submission

> Draft Devpost text and the submission checklist. **[Bracketed]** items are placeholders: results that don't exist yet, or things only the team can write. Every other sentence is true of the code as of Oct 15; re-check before submitting.
> Deadline: **Oct 30, 2026, 11:45 pm ET**; target Oct 29. Rules: [qloo.devpost.com/rules](https://qloo.devpost.com/rules).

---

## Checklist (from the official rules)

- [ ] **Working demo link:** https://memory-lane-two-umber.vercel.app, with the latest branch deployed and live kits on
- [ ] **Public repo** with an **open-source license visible in the About section** (MIT); repo contains everything needed to run it
- [ ] **Text description** (below), in English
- [ ] **Testing instructions** (below): free and **unrestricted for judges until Nov 16**; demo kits never rate-limited
- [ ] **Video** (not required, but judges may score from the description and video alone): **[link]**
- [ ] Explain how Qloo is integrated and why the project is **agentic** (below)
- [ ] One team member submits as the **Representative**
- [ ] After submitting: keep Vercel up, the Qloo key valid and Claude credits funded **until Nov 16**

---

## Tagline (one line)

Memory Lane: an agent that uses Qloo's taste graph to turn one remembered favorite into a personal reminiscence session for someone living with dementia.

## Inspiration

**[In your own words: why this matters to the team. A sentence or two of real experience is stronger than anything general.]**

Reminiscence (music, films, food and places from someone's youth, shared in gentle conversation) is a widely used non-drug approach in dementia care **[cite a public source, e.g. the Alzheimer's Association or the National Institute on Aging]**. The hard part is making it *personal*: it takes time and knowledge of someone else's era, hometown and tastes. We wanted an agent that could do that research in a minute, and do it carefully.

## What it does

A caregiver answers a few questions: a safety check, the name the person likes to be called, how much support they need today, birth year, hometown, one to three remembered favorites, and things to avoid (optionally their former work, first language and traditions). Memory Lane returns a **session kit**:

- **Songs** from what people who love their favorite also love
- **A film or TV show** from the years they were about 10 to 30
- **A place and a dish to talk about** from their hometown
- **Questions** that invite a story, never test memory

Then **session mode** shows one large card at a time on a tablet. The caregiver plays a song, asks one question, and marks how it landed: *Lit up, Calm, Not interested, Not today, Stop*. At the end Memory Lane writes a **session note** for the family or care team (copy, print or send to WhatsApp), and the next kit leaves out anything the session stopped at.

**Safety comes first.** If the caregiver reports a sudden change (new confusion, unusual drowsiness), there is no kit: Memory Lane says to contact their nurse or doctor, because that can have a medical cause.

## How Qloo makes it work

Qloo does the picking; the agent decides what to ask; code enforces the rules.
- **`/search`** resolves a favorite ("Frank Sinatra", *The Sound of Music*) to a Qloo entity.
- **`/v2/insights`** seeded with that entity finds the **music** people who love it also love.
- **Films and TV** use a **release-year window** computed from the birth year. Without it, Qloo returned films older audiences watch *today*; with it, every title we tested was from the right years.
- **Places** use the hometown as the location, ranked to historic landmarks first; **dishes** come from hometown restaurants' specialty dishes via a restaurant tag filter.
- **A modern favorite still works:** for someone born in 1942 who names Taylor Swift, the agent finds an in-era film through Qloo (*Mary Poppins*, 1964) and seeds music with that, which gives Frank Sinatra, Dean Martin and Carole King. **[Qloo side verified Oct 14; confirm the agent takes this path in a live run.]**
- **Qloo's own metadata keeps it safe:** ratings, genres and one-line theme summaries screen out mature titles and anything *about* dementia, illness, war, grief or abuse. Every exclusion is shown with its reason.

Every song, film, place and dish carries the Qloo ID that proves where it came from. Anything the agent can't ground in a Qloo result from this run is removed, and an empty section says so instead of guessing. The few activity ideas the agent may add are labeled as suggestions, not Qloo data.

## Why it's agentic

**[Confirm each behavior in this paragraph with live runs before submitting.]** A Claude agent with five Qloo tools plans its own lookups. It resolves the favorites, runs music, film, TV, place and dish lookups together, notices when a favorite is too modern and routes around it, and chooses picks that existed in the person's era, explaining each choice. It finishes with a strict "submit the kit" step that code checks. The **"How this kit was made"** panel shows every Claude turn, every Qloo lookup and everything screened out.

## How we built it

Next.js 16 on Vercel, the Claude API with tool use, and the Qloo Hackathon API. Rules that must never be skipped (the year window, the hometown, the safety filter, the safety check) live in code rather than in the prompt. Qloo calls are capped per kit, queued two at a time, cached and retried; the agent has a turn limit and a time budget, and always ends. **[N]** automated tests cover the filters (against real Qloo responses), the agent loop, the safety check, the question rules and the screens.

## Challenges we ran into

- **Qloo's age signal describes today's tastes, not youth.** Adding `55_and_older` made picks *more* modern, so we dropped it and let the favorite and the year window carry the era.
- **Our first safety filter would have emptied the kits.** Matching sensitive words against Qloo's keyword tags removed *The Sound of Music* (tagged "Nazi") and most classic TV, because those tags record small plot details. Matching Qloo's theme summary instead caught every problem title we knew of and kept every classic we tested.
- **Places are mostly current businesses,** and some "landmarks" are modern attractions. We rank historic places first and have the agent check each place existed in the person's era.
- **Bursts of parallel calls hit Qloo's rate limit,** so the client queues them.
- **Even "Do you remember…?" can feel like a test.** We rewrote the question rules around inviting stories, adjusted for how much support someone needs.

## Accomplishments that we're proud of

- Nothing in a kit is invented: every pick traces back to a Qloo result.
- The safety check: the right answer for a sudden change is no kit at all.
- A session tool, not just a list: one card at a time, reactions, and a note that closes the loop.
- **[Tester results, reported exactly: e.g. how many adults aged 60+ preferred the Memory Lane list in a blind comparison with an AI-only list, and how many items they placed in their youth. See docs/research.md §5.]**

## What we learned

- Taste data is strongest when the agent *routes* through it (favorite → in-era film → music) rather than just querying it once.
- The safest rules are the ones in code; the prompt explains, the code enforces.
- Care practice changes product design: a "no" is useful information, stopping is a good outcome, and questions should invite rather than test.

## What's next

From individual caregivers to care homes: saved resident profiles (with consent and proper privacy work first), group sessions that find the overlap in several residents' eras, family contributions, and kits in more languages.

## Built with

`nextjs` · `typescript` · `react` · `tailwindcss` · `vercel` · `claude` · `anthropic` · `qloo` · `zod` · `vitest`

---

## Testing instructions (for judges)

1. Open **https://memory-lane-two-umber.vercel.app**. No sign-in.
2. Click **Try a demo → Rosa** for a full kit; open **"How this kit was made"** at the bottom to see the Qloo lookups and what was screened out. Click **Start session**, mark a few reactions, tap **Stop**, and read the session note.
3. Click **Try a demo → Margaret** to see the safety check: no kit, a prompt to contact a nurse or doctor.
4. To build your own kit, fill in the form (or **Fill in an example**) and click **Build the session kit**. **[Expected time for a live kit: N seconds.]**

All personas are fictional. Please don't enter details about a real person.
