# Memory Lane: Research

> The tests we ran against the Qloo API and what they showed. Decisions drawn from them are in [plan.md §3](plan.md#3-decisions).
> Personas are fictional. Formative window = ages 10–30 (birth year + 10 to + 30).

| Persona | Born | Hometown | Favorite | Window |
|---|---|---|---|---|
| Rosa | 1942 | Chicago | Frank Sinatra (artist) | 1952–1972 |
| Walt | 1950 | Memphis | Elvis Presley (artist) | 1960–1980 |
| June | 1958 | Los Angeles | The Sound of Music (film) | 1968–1988 |

---

## 1. Phase 0: can Qloo match an era? (Oct 8)

**Verdict: GO.** Script: [`scripts/phase0-era-test.mjs`](../scripts/phase0-era-test.mjs) (`node --env-file=.env.local scripts/phase0-era-test.mjs`). Each favorite resolved with `/search`, then `/v2/insights` seeded with it (`signal.interests.entities`, plus `signal.demographics.age=55_and_older`, later dropped; see §1.3). 21 calls; no failures except the planned control.

| Persona | Artists | Films, no year filter | Films + year filter | TV + year filter | Places |
|---|---|---|---|---|---|
| Rosa | era-correct (9/10 by eye) | **0% in era** | 100% | 100% | weak (modern businesses) |
| Walt | era-correct (10/10) | **0% in era** | 100% | 100% | good (Graceland, Sun Studio) |
| June | era-correct (10/10) | 60% in era | 100% | 100% | weak (hotels, Starbucks) |

### 1.1 Findings
1. **Music works from the favorite alone.** Sinatra → Louis Armstrong, Tony Bennett, Ella Fitzgerald, Nat King Cole, Peggy Lee. Elvis → Roy Orbison, Jerry Lee Lewis, Chuck Berry, Little Richard. `filter.release_year` doesn't apply to artists, so the seed is the only era lever for music (→ D2).
2. **Films and TV need the year filter every time.** Without it Qloo returns what older audiences watch *today* (*La La Land*, *Green Book*); with it, 100% in era for all three (→ D1).
3. **Results need a content filter.** Lists included explicit titles (a Rolling Stones documentary with an explicit name, *Last Tango in Paris*), a film about Alzheimer's (*Still Alice*), and distressing subjects (*Holocaust*) (→ D3).
4. **A "no favorite" baseline isn't possible.** Qloo returns 400 `at least one valid signal or filter is required` (→ D5).
5. **Places are mostly current businesses.** Rosa got Museum of Illusions and Benihana; June got hotels and Starbucks. Memphis worked because its landmarks are music history (→ D4).
6. **Qloo's oldest age bucket is `55_and_older`,** so it can't tell a 1942 birth from a 1968 one.

### 1.2 Results by persona (year-filtered where applicable)
- **Rosa, artists:** Louis Armstrong, Tony Bennett, Dean Martin, Nat King Cole, Peggy Lee, Paul Anka, Glenn Miller, Harry Connick Jr., Bobby Darin, Ella Fitzgerald
- **Rosa, films:** There's No Business Like Show Business (1954), Designing Woman (1957), Last Tango in Paris (1972), All That Heaven Allows (1955), Sweet Charity (1969), Charly (1968), Guess Who's Coming to Dinner (1967), Play It Again, Sam (1972), Let's Make Love (1960), The Best of Everything (1959)
- **Rosa, films without the filter:** Her (2013), Still Alice (2014), Youth (2015), The Danish Girl (2015), Wild (2014), La La Land (2016)…
- **Walt, artists:** Roy Orbison, Jerry Lee Lewis, Chuck Berry, The Animals, Creedence Clearwater Revival, Little Richard, Nancy Sinatra, The Turtles, Bee Gees, The Rolling Stones
- **Walt, places:** Lorraine Motel, Sun Studio, Graceland, The Arcade Restaurant, Blues City Cafe…
- **June, artists:** Bette Midler, Johnny Mathis, Carole King, Peter, Paul & Mary, Carly Simon, Barry Manilow, Barbra Streisand, Neil Diamond, Carpenters, Elton John
- **June, TV:** Masterpiece (1971), The Waltons (1972), Shogun (1980), Roseanne (1988), Holocaust (1978), The Brady Bunch (1969)…
- **June, places:** Revenge of the Mummy ride, a railroad museum, two hotels, Starbucks, Angels Flight Railway, an art museum…

### 1.3 The age signal (A/B on the Sinatra seed, Oct 8)
| Age signal | Artists returned |
|---|---|
| none | Armstrong, Nat King Cole, Doris Day, Mel Tormé: the purest era list |
| `55_and_older` | adds Paul Anka, Harry Connick Jr. |
| `24_and_younger` | Nina Simone, Manhattan Transfer, Sara Gazarek |

The age signal reflects what an age group likes *today*, not when they were young → **D7: never send it.**

---

## 2. Phase 2 re-check: the call shapes the agent uses (Oct 14)

Script: [`scripts/qloo-recheck.mjs`](../scripts/qloo-recheck.mjs) (`node --env-file=.env.local scripts/qloo-recheck.mjs`; writes trimmed responses to `fixtures/qloo/` and a raw report to `scripts/out/recheck/`). Changes from Phase 0: no age signal, `take=25` for media and `take=50` for places, separate places and restaurants calls. 22 calls, none failed.

### 2.1 Results

| Persona | Films / TV in era | Landmarks (allowlist) | Restaurants listing dishes |
|---|---|---|---|
| Rosa | 25/25 · 25/25 | 5: Cloud Gate, Millennium Park, Field Museum, Chicago Sports Museum, Museum of Illusions | 14 (Gino's East, Giordano's: `chicago_style_pizza`, …) |
| Walt | 25/25 · 25/25 | 6: Sun Studio, Lorraine Motel, Stax Museum, Graceland, National Civil Rights Museum, Metal Museum | 13 (The Pig On Beale, Silky O'Sullivan's, …) |
| June | 25/25 · 25/25 | 7: Hollywood Sign, Spadena House, Natural History Museum, Walt Disney's Carolwood Barn, a railroad museum, Upside Down House, Madcap Motel | 13 (In-N-Out Burger, VIVO Italian Kitchen, Krusty Burger, Bubba Gump, …) |

- **June now has landmarks and a dish.** `take=50` and a restaurants-only call (`filter.tags=urn:tag:genre:place:restaurant`) fixed the Phase 0 gap.
- **The restaurant tag still lets in some hotels and live-music venues,** so `get_dish` keeps only places that list `specialty_dishes`.
- **The allowlist lets in modern attractions** (Cloud Gate 2006, Millennium Park 2004, Upside Down House, Madcap Motel) and themed or 1990s restaurants (Krusty Burger at a theme park, Bubba Gump), so an era judgment is still needed (→ D4).
- ***Charly* is no longer returned for Rosa without the age signal;** the demo's safety example uses June's *Terms of Endearment*.

### 2.2 The modern-favorite hop (born 1942, favorite Taylor Swift)
- Music seeded by Taylor Swift directly: Carly Rae Jepsen, Demi Lovato, One Direction, Katy Perry, Bruno Mars… (wrong era)
- Films seeded by Taylor Swift, years 1952–1972: **25/25 in era**, top: *Mary Poppins* (1964)
- Music seeded by *Mary Poppins*: Randy Newman, **Frank Sinatra**, Don McLean, Elton John, Billy Joel, Carole King, **Dean Martin**, Neil Diamond, Harry Nilsson, Simon & Garfunkel

→ **D2:** for a modern favorite, seed music with an in-era film.

### 2.3 The content filter

First design: sensitive phrases matched against `plot_themes_description`, **keyword tags** and keywords. On the re-check data it excluded *The Sound of Music* (tagged "Nazi"), *The Princess Bride*, *Willy Wonka*, *To Kill a Mockingbird*, and **19 of June's 25 TV shows**. Keyword tags record minor plot details ("Suicide attempt" in one scene), not what a title is about.

Final design (D3): rating blocklist + Qloo's **War** genre + phrases in the theme summary **only** + profanity in the title. On every saved response (Phase 0 and re-check, 193 unique titles):

| Result | Titles |
|---|---|
| **Excluded, as intended** (8/8) | *Still Alice* (cognitive decline) · *Charly* (memory decline) · *Holocaust* (War genre) · *Last Tango in Paris* (NC-17) · *Terms of Endearment* (grief) · *Hitler: A Career* (totalitarian) · *A Clockwork Orange* (R) · the explicit Rolling Stones documentary (drug use) |
| **Kept, as intended** | *The Sound of Music*, *The Princess Bride*, *Mary Poppins*, *Kramer vs. Kramer*, *Willy Wonka*, *Grease*, *Singin' in the Rain*, *Roman Holiday*, *Breakfast at Tiffany's*, *Annie* |
| Excluded overall | 43 of 193 (22%), including the unfiltered modern lists |
| Borderline, excluded on purpose | *M\*A\*S\*H* (War genre), *Love Story*, *Julia* and *Eight Is Enough* (grief) |
| Borderline, kept | *Romeo and Juliet* and *The Paper Chase* (no listed phrase in their theme summaries) |

### 2.4 Live tools test (Oct 14)
`LIVE=1 npx vitest run tests/live` runs the agent's tools against the real API in the agent's order.
- **Five parallel calls got HTTP 429.** Qloo rate-limits bursts → the client now keeps at most 2 calls in flight and retries 429s.
- After the fix: June with two seeds (*The Sound of Music* + Julie Andrews), 7 calls in about 5 s, no errors; several seeds in one call work.
- Music seeded by a musical skews to Broadway performers, some from the 1990s (Lea Salonga). Artists carry no years, so Claude must choose the era-right ones.

---

## 3. Wikidata coverage in Qloo data

Checked on the Oct 14 responses: **films 25 of 25** carry `properties.wikidata_id`; **places 0 of 50.** Films already have a release year, so Wikidata adds little there; a place era check would need a Wikidata lookup by name and city (→ optional in [plan.md §12.4](plan.md#124-qloo-tools)).

---

## 4. Measured since, and still open

**Measured:** live kits with Claude (era of the music picks, places and restaurants, question quality, time and cost per kit) have been checked many times since Oct 19; every run is in [`audits/`](../audits/). The latest: the [production audit](../audits/2026-10-27-production-audit.md) (Oct 27) and the [end-to-end check](../audits/2026-10-29-end-to-end-after-merges.md) after the last fixes (Oct 29): 8 live kits and 7 comparisons, all built, at about 0.1–0.15 US cents of Claude tokens and 10–20 seconds a kit.

**Still open:** the tester study (§5) was not run before submission, so we make no claim about what testers think.

---

## 5. Tester study: script and results

> **Status (Oct 29):** not run before submission; the results sheet in §5.6 is empty on purpose.

Plan: [plan.md §12.8](plan.md#128-evidence-plan). No professional caregiver is available, so three groups test what each can honestly judge. Results go in §5.6 and are reported **exactly as they happened**.

### 5.1 Ground rules (read before every session)
- **Who:** adults aged 60+ (group A), people who have looked after an older relative (group B), and one first-time user (group C).
- **Never** a real person living with dementia, and never details about one. Group A builds a kit about *themselves*; groups B and C use fictional personas.
- **Consent, out loud:** "We're testing an app for a hackathon. It takes about 20 minutes. You can skip anything or stop at any time. We'll write down your answers without your name. Is it OK if we quote you anonymously?" Note yes/no.
- **Record only:** tester ID (A1, B1…), group, an age range (60–69, 70–79, 80+), answers and quotes. No names, contact details or health information.
- **Write what they say, not what you think they meant.** Don't defend the app or explain it unless they're stuck.
- If anything upsets a tester, stop, thank them, and note it as a finding.

### 5.2 Before the session
- [ ] Laptop or tablet with the app (live URL, or `npm run dev:agent` locally), charged, sound on.
- [ ] For group A: **two kits per tester, prepared from their details**: the Memory Lane kit, and an **AI-only kit** made from the same details without Qloo (the comparison toggle, or the same request to Claude with no tools). Print or show them as **"List A" and "List B"**; flip a coin for which is which, and note it on the sheet only.
- [ ] Persona cards for groups B and C (fictional; see §5.5).
- [ ] This sheet, a pen, and a timer.

### 5.3 Group A: era accuracy and the blind comparison (adults 60+, about 20 min)

**Setup (2 min).** Ask: birth year (or decade), the town they grew up in, one favorite singer, film or show from their youth, and anything they'd rather not see. Build both kits.

**Part 1: Is this your era? (8 min)** Show List A, one item at a time. For each song, film, place and dish ask:
1. "Do you know this one?" → *Yes / Heard of it / No*
2. If yes: "When was it part of your life? About ages 10 to 30, later, or earlier?" → *Then / Later / Earlier*
3. "Does it bring anything to mind?" Note a short quote if they offer one.

Repeat for List B.

**Part 2: Which list? (5 min)**
4. "Which list feels more like your youth: A or B?" → *A / B / Same*
5. "What made you choose it?" (quote)
6. "Is there anything in either list that feels wrong, or that you wouldn't want brought up?" (quote, and which list)

**Part 3: The questions (5 min)** Show the kit's conversation questions.
7. "Would you be comfortable being asked these?" → *All / Most / Few*
8. "Does any of them feel like a test, or like it assumes something about you?" Note which.

### 5.4 Group B: usefulness in a session (people who've looked after a relative, about 20 min)
Use the **Rosa demo** or a persona card, and walk through the flow: form → kit → **Start session** → mark reactions → **Stop** on one card → session note.
1. Safety check at the top of the form: "Is this question clear? Would you answer it honestly?" (quote)
2. "Watch for" strip: "Are these the signs you'd look for? Anything missing?" (quote)
3. Session mode: "Could you use this with someone next to you, on a tablet?" → *Yes / With changes / No*. What would you change?
4. The note: "Would this note be useful to share with family or a care team?" → 1–5
5. "Would you use Memory Lane?" → *Yes / Maybe / No*, and why
6. "What's missing, or what worries you?" (quote)

### 5.5 Group C: first-time use (about 10 min)
Give the persona card and say only: **"Please make a session kit for this person, then start a session."** Don't help unless they're stuck for 60 seconds; if you help, note where.

> **Persona card:** Frank, born 1948, grew up in Pittsburgh. Loves Johnny Cash. Mostly independent. No sudden changes today. Please avoid anything about hospitals.

Note: time to a kit, whether they found **Start session**, where they hesitated, and their first words after finishing.

### 5.6 Results sheet

**Testers**

| ID | Group | Age range | Quotes OK? | Date |
|---|---|---|---|---|
| A1 | A | | | |
| A2 | A | | | |
| A3 | A | | | |
| B1 | B | | | |
| B2 | B | | | |
| C1 | C | | | |

**Group A: era accuracy** (counts per tester; "known" = Yes or Heard of it)

| ID | Memory Lane list was | Items | Known | Known *and* "then" | AI-only items | Known | Known *and* "then" | Prefers | Questions comfortable | Felt like a test |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | A / B | | | | | | | A / B / Same | All / Most / Few | |
| A2 | | | | | | | | | | |
| A3 | | | | | | | | | | |

**Group B: usefulness**

| ID | Safety question clear | Watch-for complete | Session mode on a tablet | Note useful (1–5) | Would use | Missing or worrying |
|---|---|---|---|---|---|---|
| B1 | | | Yes / With changes / No | | Yes / Maybe / No | |
| B2 | | | | | | |

**Group C: first-time use**

| ID | Time to kit | Found Start session | Got stuck at | First words |
|---|---|---|---|---|
| C1 | | | | |

**Quotes** (anonymous, only with permission)

| ID | Quote | About |
|---|---|---|
| | | |

**Issues found → what we changed**

| Issue | Seen by | Change | Done |
|---|---|---|---|
| | | | |

### 5.7 How results are reported
- Use the numbers as counted, with group sizes. *Format only, these are not results:* "3 adults aged 65+ preferred the Memory Lane list in 3 of 3 blind comparisons; 21 of 24 items were known and placed in their youth, against 9 of 20 for the AI-only list". Never round up, never drop a tester.
- Name the groups honestly: **"adults aged 60+"** and **"people who have looked after an older relative"**, never "caregivers" or "people with dementia".
- Report anything a tester found wrong or upsetting, and what we changed.
