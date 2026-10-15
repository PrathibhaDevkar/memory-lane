# Memory Lane: Change Plan (care-practice direction)

> **Status:** Draft v1 · 2026-10-15 · covers Oct 15 → submission Oct 29 (deadline Oct 30, 11:45 pm ET)
> What changes in the existing code, and what gets added, to move Memory Lane from "a list of era-matched picks" to "a session tool that follows good dementia-care practice".
> Context: [implementation-plan.md](implementation-plan.md) (architecture), [business-case.md](business-case.md) (why), [approach.md](approach.md) (decisions).

---

## 1. The direction in one paragraph

Reminiscence, familiar music and life-story activities are recognized non-drug approaches in dementia care. Memory Lane makes them **personal** (Qloo finds what fits the person's era and tastes) and **safe** (it follows care-practice rules for communication and distress). The new pieces: the kit adapts to **how much support the person needs**; a **sudden-change check** stops the session and points to a nurse or doctor instead of building a kit; questions follow stricter **communication rules**; and every session can **close the loop** with a short care note the caregiver copies or shares. Memory Lane stays a support tool: no diagnosis, no health advice, nothing about real people stored.

## 2. Care principles we design to

Written in our own words. For public claims in the submission, cite public sources (for example the Alzheimer's Association or the National Institute on Aging), not internal training material.

| # | Principle | What it means in the product |
|---|---|---|
| P1 | **No memory tests, no invented memories** | Questions invite stories; they never quiz ("Do you remember…", "What year…", "Who sang…") or state facts about the person ("You used to…") |
| P2 | **One idea at a time, adult tone** | One question per card; simple choices ("this one or that one?") for people who need more support; never childlike |
| P3 | **Support changes with the stage, and day to day** | The caregiver picks how much support is needed today; the kit's mix changes |
| P4 | **A sudden change is reported, not assumed to be progression** | Sudden-change check before any kit; if yes, no kit and a prompt to contact their nurse or doctor |
| P5 | **Distress means stop** | "Watch for" signs on every kit; "Not today" and "Stop" on every card; a distressing item is left out of the next kit |
| P6 | **A "no" is an answer** | "Not today" is logged as useful information, not failure |
| P7 | **Life story drives the activity** | Preferred name, former work, first language and traditions shape the picks and questions |
| P8 | **Close the loop** | Notice → try → observe → share → adjust: the session note records reactions and suggests what to try next |
| P9 | **Food follows the care plan** | The dish is for conversation; any tasting follows the person's diet plan |
| P10 | **Not a clinical tool** | No health or medication advice; no diagnosis; the stage question is about support, chosen by the caregiver |

## 3. What changes in the existing code

### 3.1 Shared contract: `lib/types.ts`

| Change | Detail |
|---|---|
| `Profile.displayName` | Becomes the **preferred name** ("What do they like to be called?"). Same field, new label and help text |
| **Add** `Profile.supportLevel` | `"early" \| "middle" \| "late"`, required. Shown to caregivers as "Mostly independent / Needs some help / Needs a lot of help" |
| **Add** `Profile.suddenChange` | `boolean`, required. "Any sudden change in the last few hours or days: new confusion, unusual drowsiness, not recognizing familiar people?" |
| **Add** `Profile.formerWork` | Optional, ≤ 80 chars ("teacher", "ran the family farm") |
| **Add** `Profile.firstLanguage` | Optional, ≤ 40 chars |
| **Add** `Profile.traditions` | Optional, ≤ 80 chars (faith or cultural traditions, e.g. "Catholic hymns", "Diwali"). Sent to the agent for one request, never stored |
| **Add** `SafetyStopSchema` | `{ mode: "safety_stop", message, profile }`, the response when `suddenChange` is true |
| **Add** `KitResponse` | `Kit \| SafetyStop`; the UI branches on `mode` |
| **Add** `Kit.supportLevel` | Copied from the profile, so the kit view and session mode can adapt |
| **Add** `Kit.watchFor` | `string[]`, fixed per support level (grimacing, moaning, tense body, pulling away, tears…), written in code, not by the model |
| **Add** `Kit.activityIdeas` | `{ text, source: "llm" }[]`, at most 3: objects to hold (middle) or textures and sensory ideas (late). Labeled in the UI as suggestions, not Qloo data |
| `Kit.prompts` | Stays `string[]`; the rules per level are enforced by the validator (§3.3) |
| **Add** `SessionLog`, `CareNote` | Client-only types (§3.6). Never sent to the server |

### 3.2 API: `app/api/kit/route.ts`

- **Safety gate first:** if `suddenChange` is true, return `SafetyStop` immediately. **No Qloo or Claude call.** Message: a sudden change can have a medical cause; please tell their nurse or doctor now; Memory Lane isn't the right activity for today.
- Generous abuse limit on **live** kits only (`lib/ratelimit.ts`, Upstash); demo kits are never limited (official rules: judges get access "without any restriction" until Nov 16). `SMOKE_TOKEN` header exempt.
- Response validated against `KitResponse`.

### 3.3 Agent: `lib/agent/*`

| File | Change |
|---|---|
| `prompts.ts`: system prompt | Add the care principles (§2) in plain instructions: use the preferred name; questions per support level (**early**: 5 open, story-inviting questions; **middle**: 3 short questions, one idea each, some as a choice of two; **late**: 0–2 gentle comments about the music, no questions required); use former work and traditions for questions and seeds (e.g. traditions → hymns as a music seed via `resolve_favorite`); if the first language isn't English and Qloo's results look thin for it, say so in `gaps` instead of padding |
| `prompts.ts`: `submit_kit` schema | Add `activity_ideas` (array of ≤ 3 strings) |
| `validate-prompts.ts` | **Tighten (P1, P2):** reject "do you remember", "remember", "you used to/loved/were"; reject quiz forms ("what year", "what was the name", "who sang", "how old were you"); reject two questions in one card; reject childlike wording. **Per level:** early needs ≥ 3 open questions; middle allows choice questions; late allows short comments that are about the item, not the person ("This was a favorite song for many people in the 1950s."). *This reverses the current rule that allows "Do you remember…?"* |
| `kit.ts` | Add `supportLevel`, `watchFor` (fixed lists per level), `activityIdeas` (source `llm`, max 3, same tone check); item counts per level (late: 3 songs, 0 films, place optional) |
| `run.ts` | Pass the new profile fields; nothing else changes |

### 3.4 Qloo tools: `lib/qloo/*`

- **No rule changes.** Traditions and former work reach Qloo only as extra seeds that Claude resolves with `resolve_favorite` (for example "hymns", or a singer tied to a tradition), so every pick stays grounded.
- **Optional, cut first: era check for places** (`lib/wikidata.ts`). Qloo places carry **no** Wikidata ID (0 of 50 in the Oct 14 data; films have one, but already come with a year). A place check would need a name + city lookup on Wikidata, accepting only an exact match located in that city, and saying "unknown" otherwise. Build only if Phase 2 lands on time.

### 3.5 UI: `components/*`

| Component | Change |
|---|---|
| `IntakeForm.tsx` | **Sudden-change question first** (yes/no, required). Then: preferred name, birth year, hometown, **support level** (three plain-language choices with one-line descriptions), favorites, things to avoid, and a collapsed "More about them (optional)" group: former work, first language, traditions. Note under the optional group: used for this kit only, not saved |
| **New** `SafetyStop.tsx` | Calm full-page message with the reason and a "Back" button. No kit |
| `KitView.tsx` | Header shows the preferred name and support level. **"Watch for" strip** at the top. **"Ideas" section** for `activityIdeas`, labeled "Suggestions, not from Qloo". Questions styled per level. Buttons: Start session · Print · Send to WhatsApp |
| **New** `SessionMode.tsx` | Full-screen, large type, **one card at a time** (song → question → film → place → dish → ideas). Each card: Play/Search link · **Lit up · Calm · Not interested · Not today · Stop**. "Stop" ends the session with brief reassurance guidance (pause, simplify, comfort) and goes to the note |
| **New** `SessionNote.tsx` | Summary of reactions and time of day, plus a short **care note** built from a template in the browser ("Responded well to Ella Fitzgerald; calm with Route 66; not today for questions about Chicago. Try more 1950s jazz, earlier in the day."). Buttons: Copy · Send to WhatsApp · Print. **Nothing sent to the server.** "Build next kit" reuses the profile and adds anything marked Stop to things to avoid (P5) |
| **New** `TracePanel.tsx` | Collapsible "How this kit was made": Claude turns, Qloo calls, what was screened out and why |
| **New** `lib/share.ts` | Plain-text kit and note builders + `https://wa.me/?text=` share link (no API, no account) |
| `MemoryLaneApp.tsx` | Views: form → kit (or safety stop) → session → note. Profile and log kept in memory only |
| **New** demo buttons | "Try a demo" with saved kits per persona, loaded from `fixtures/kits/` in the browser (no API, never limited) |
| `app/page.tsx` | Footer wording unchanged (support tool, not therapy) |

### 3.6 Session log and care note (client only)

```
SessionLog = { startedAt, supportLevel, entries: [{ itemKind, itemTitle, reaction, note? }] }
reaction   = "lit_up" | "calm" | "not_interested" | "not_today" | "stopped"
CareNote   = template text from the log; no model call
```

Why a template and not Claude: it keeps health-related observations about a real person **in the caregiver's browser**, adds no latency or cost, and can't invent anything.

### 3.7 Demo personas (our own, fictional)

Inspired by common care situations; names and details are ours.

| Persona | Situation | What it proves |
|---|---|---|
| **Margaret**, 1940, Boston | Sudden change today: drowsy, didn't know her regular caregiver | **No kit.** Safety stop. *Must pass* |
| **Mr. Okafor**, 1946, Lagos → London, former maths teacher, needs some help | Restless in unstructured afternoons | Middle-level kit; questions draw on teaching; flags thin coverage if Qloo is sparse |
| **Elena**, 1938, Chicago, needs a lot of help, Catholic hymns | Calm with familiar hymns | Late-level kit: music-first, hymn seed, textures, few questions |
| **Rosa**, **Walt**, **June** | Existing personas | Early/middle kits, safety filter, landmarks, dish |
| **Taylor Swift case** | Modern favorite, born 1942 | The film-to-music hop |

## 4. Tests to add or change

| Test file | Covers |
|---|---|
| `types.test.ts` | New fields; `suddenChange` required; optional fields' limits; `KitResponse` union |
| `api-kit.test.ts` | **Sudden change → `safety_stop`, and Qloo/Claude are never called** |
| `validate-prompts.test.ts` (new, split from `agent.test.ts`) | "Do you remember…" and quiz forms rejected; two-in-one rejected; level rules (late allows item comments) |
| `agent.test.ts` | Kit carries `supportLevel`, `watchFor`, labeled `activityIdeas`; late-level counts |
| `kit-view.test.tsx` | Watch-for strip; ideas labeled as suggestions; support level shown |
| `session.test.tsx` (new) | One card at a time; Stop ends the session; note text built from the log; nothing posted to the server |
| `share.test.ts` (new) | WhatsApp text and link encoding |
| `intake-form.test.tsx` | Sudden-change question first; optional group; errors per field |
| `scripts/smoke.mjs` | Add Margaret (expects `safety_stop`), Mr. Okafor, Elena |

## 5. Sequence

Live kits (Phase 2) still come first. Work that doesn't need the Claude key starts now.

| Date | Work | Needs Claude key? |
|---|---|---|
| **Oct 15–16** | Contract changes (§3.1), safety gate (§3.2), intake form (§3.5), tightened validator (§3.3), tests | No |
| **Oct 17** | Live run of all personas once the key arrives; tune the system prompt per support level; save demo kits | Yes |
| **Oct 18 (gate)** | Abuse limit, deploy to production, smoke on the live URL | Yes |
| Oct 19 | Buffer; place era check *only if on time* | — |
| Oct 20 | Trace panel; time two models, confirm `CLAUDE_MODEL` | Yes |
| Oct 21 | Session mode + session note + WhatsApp share | No |
| Oct 22 | AI-only comparison toggle; demo buttons | Yes |
| Oct 23 | Polish: watch-for, ideas, print layout for the kit and the note | No |
| Oct 24–25 | Tester comparison (adults 60+; people who've looked after a relative); fixes | Yes |
| Oct 26–29 | Mobile, loading/error states, README, description, video, stranger test, submit | — |
| Oct 30 – Nov 16 | Keep the demo live, free and unrestricted; credits funded | — |

**Cut order if late:** place era check → AI-only toggle → print layout for the note → activity ideas. **Never cut:** the safety gate, the question rules, session mode.

## 6. Out of scope for the hackathon

Saved resident profiles and history (needs consent and a privacy setup); "their reactions outrank intake favorites" across sessions (needs saved history); care-routine playlists; comfort picks; family recording prompts; purposeful task cards; sundowning schedules and time-of-day patterns; full language-specific kits; a family visit kit; a WhatsApp chat assistant.

## 7. Decisions this adds (to record in approach.md)

| # | Decision |
|---|---|
| D8 | Stage-aware kits: the caregiver chooses the support level; it changes the mix and the questions |
| D9 | Sudden-change check before any kit; "yes" returns a safety stop and no API calls |
| D10 | Question rules tightened: no "Do you remember…", no quizzes, one idea per card, adult tone |
| D11 | Session notes are built and kept in the caregiver's browser; nothing about a real person is sent to or stored by Memory Lane beyond the single kit request |
| D12 | Model-written suggestions (activity ideas) are labeled as suggestions and never presented as Qloo data |
