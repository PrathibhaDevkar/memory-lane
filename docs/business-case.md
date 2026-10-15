# Memory Lane: Business Case

> **Status:** Draft v1 · 2026-10-15
> What Memory Lane is worth, who it's for, how it will be judged, and what to build next.
> How it's built: [implementation-plan.md](implementation-plan.md). Decisions: [approach.md](approach.md).

---

## 1. The problem

Reminiscence activities (music, films, food and places from someone's youth, plus gentle conversation) are a common part of dementia care. Putting together a *personal* session is hard. It takes time, and it takes knowledge of another person's era, hometown and tastes, which a caregiver often doesn't have. Generic playlists miss the person; the wrong item can upset them.

Memory Lane turns a few details (birth year, hometown, one remembered favorite, things to avoid) into a ready-to-use session kit in about a minute, using Qloo's taste graph to find what people with that favorite also loved, limited to the person's formative years.

## 2. Who it's for

| Audience | Need | Strength as a business |
|---|---|---|
| **Family caregivers** | Ideas for meaningful time together | Highest emotional need, lowest willingness to pay, occasional use |
| **Activity coordinators** in care homes, memory care and adult day programs | Fresh, personal activities every day, for many residents | Daily use, many people per account, existing activity budgets: **the strongest path** |
| **Care organizations and senior-living software** | Activity content inside tools staff already use | Partnership or licensing later |

The README's direction, "scalable to caregivers, from individuals to nursing care", matches this: start with individual caregivers, grow into care settings.

## 3. Honest assessment

| Lens | Rating | Why |
|---|---|---|
| Problem | Strong | Real, frequent, emotional |
| Who pays | Mixed | Families feel it most; care settings can pay |
| Differentiation | **Must be proven** | Anyone can ask a general AI chatbot for "songs from 1950s Chicago". Memory Lane's edge is personal picks from one favorite, safety screening, nothing invented, and a complete kit. That edge has to be *shown* (see §6) |
| Lasting advantage | Weak today, strong later | Learning per person (what made someone light up shapes their next kit) is the real moat. It needs the feedback loop |
| Risks | Manageable | Vulnerable users: privacy, upsetting content and medical claims are covered by the project rules. Business risks: dependence on Qloo access and pricing after the hackathon; AI cost per kit; modern places and venues need an era check |

## 4. How the hackathon judges it

From the [official rules](https://qloo.devpost.com/rules) (Qloo Agentic Hackathon):

- **Stage one (pass/fail):** the project fits the theme and reasonably applies the Qloo API.
- **Stage two:** four criteria, **equally weighted**. Ties are broken by the first criterion.

| Criterion | What judges look for | Where Memory Lane stands | What raises the score |
|---|---|---|---|
| **Technological implementation** (tie-breaker) | How thoroughly and skillfully Qloo is used; a working, non-trivial build | Search, insights with year/location/tag filters, seeding by entity, the modern-favorite hop through a film, safety screening of Qloo data, grounding every pick to a Qloo ID | Use more of Qloo where it fits (for example other entity types such as books, if available); make Qloo's role visible in the trace panel |
| **Design** | A complete, coherent product, not a proof of concept | Form → kit, gap states, print | **Session mode**; demo kits that always work |
| **Potential impact** | A credible, specific case for a real audience, *based on what's demonstrated* | Strong problem, no evidence yet | **Tester comparison** with older adults (§6) |
| **Quality of the idea** | A creative, non-obvious use of Qloo; real understanding of the problem | Era fidelity, safety, nothing invented | Explain the reminiscence reasoning (why ages 10–30, open questions, things to avoid) in the README, description and video |

**Rules that shape the build:**
- The project must be **agentic** and **integrate the Qloo API**. Memory Lane is an agentic tool: Claude decides which Qloo lookups to make.
- **Other APIs, SDKs and data are allowed** if we're authorized under their terms (§7).
- The demo must be available **free of charge and without restriction until judging ends on Nov 16, 2026**, so hosting, the Qloo key and AI credits must last through that date, and any rate limit must never block a judge.
- Required: working demo link, public repo with an **open-source license visible in the About section**, text description. A video isn't listed as required, but judges may score from the description, images and video alone, so we make one.
- Submission deadline: **Oct 30, 2026, 11:45 pm ET**. Judges may use AI-assisted analysis, so the README and description must be clear.

## 5. Improvements to what exists

1. **Prove the value.** Blind comparison of an AI-only kit and a Memory Lane kit with older adults (§6).
2. **Make the wait feel short.** Show the agent's progress live ("finding songs Sinatra fans love… screening films… choosing a place") instead of a spinner.
3. **Back the era check with data.** Use opening and release dates from Wikidata so "did this place exist back then?" isn't left to the model's memory.
4. **Control cost per kit.** Cache results for common favorites and eras; compare a cheaper model on the same personas.

## 6. Evidence plan (no caregiver available)

No professional caregiver is available to test. The plan:

| Tester | What they can judge | How |
|---|---|---|
| 2–3 adults aged 60+ | **Era accuracy**: "does this feel like *your* youth?" | Build a kit for themselves; then a blind A/B with an AI-only kit for the same details |
| People who have looked after an older relative | Usefulness in a session | Walk through a kit and the questions |
| A first-time user | Ease of use | Uses the app without help (Phase 4 stranger test) |

Testers use the demo with **fictional personas or themselves**, never a real person living with dementia. Results are reported **exactly as they happened** (for example "3 adults aged 65+ chose the Memory Lane kit in 3 of 3 comparisons"); the submission never claims caregiver testing that didn't happen.

## 7. Resources beyond Qloo

Allowed by the rules when we're authorized to use them. Qloo stays the source of the picks; anything added supports it.

| Resource | Adds | Status |
|---|---|---|
| Claude API | The agent: chooses lookups, picks, writes questions | In use |
| Vercel, Next.js, zod, vitest | Hosting and code libraries | In use |
| **Wikidata** (public domain, no key) | Opening and release dates for the era check; Qloo already returns `wikidata_id` for media | **Recommended before submission** |
| Library of Congress / Wikimedia Commons | Free-to-use historic photos of the hometown place | Optional, if time allows |
| YouTube / Spotify APIs | Exact links instead of search links | Skip: extra keys, quotas and terms for little gain |

## 8. Feature roadmap

**Before submission (Oct 29), by value:**
1. **Session mode:** large type, one item at a time on a tablet: play a song, show a question, tap "next". Turns a planning tool into something used during the session.
2. **Demo kits that always work:** saved kits for the personas, with no rate limit, so a judge never hits a wall.
3. **Trace panel:** shows Qloo's work and what was screened out, and why.
4. **AI-only comparison toggle:** the differentiation argument, shown live.
5. **Feedback buttons:** 👍/👎 per item and "they lit up at this", feeding the next kit. First to cut if time runs short.
6. **"Swap this one":** replace a single item without rebuilding the kit.
7. **Share to WhatsApp:** a "Send to WhatsApp" button that opens WhatsApp with a short text version of the kit (songs, film, place, questions, links) via a standard share link. No API, no account, no keys; it simply hands text to the caregiver's own WhatsApp. Families and care teams often coordinate there.

**After the hackathon (the business):**
- Saved resident profiles, with consent and proper privacy work before any real resident data is stored
- Care-home roster and **group sessions** (overlap of several residents' eras)
- Family contributions: relatives add favorites they remember
- Other languages and regions, where Qloo's data covers them
- A weekly activity plan built from kits
- Integrations with activity-planning software already used in care settings
- **A WhatsApp assistant:** a caregiver messages a birth year, hometown and favorite and gets a kit back in the chat. Reaches people who won't open a web app. Needs the WhatsApp Business Platform (business verification, message templates, per-conversation fees under Meta's terms) and a privacy review, since details travel through a third party: post-hackathon only

## 9. Operating costs to plan for

| Item | Through Nov 16 | Note |
|---|---|---|
| Vercel hosting | Hobby plan | Function duration must fit the agent's time budget |
| Qloo API | Hackathon key | Rate-limits bursts; the client queues calls |
| Claude API | Credits needed | Measure cost per kit on the first live runs, then budget for judging traffic; demo kits cost nothing |
| Upstash Redis | Free tier | Abuse limit and feedback storage |
