# Final judge test, Oct 29

Abil with Claude. `main` at `59877fd` (#32 and #34 merged today). GitHub shows Vercel's production deployment of that commit as successful at 18:53 UTC.

**How it ran, and what it couldn't cover.** Claude's cloud session can't reach the live site: its network policy refuses `memory-lane-two-umber.vercel.app`. So this test ran on a production build of the same commit on the session's machine:
- the saved demo kits (`KIT_SOURCE=fixture`);
- analytics on, with a dummy key, and every analytics request captured in the browser so nothing left the machine;
- a real Chromium at phone, tablet and desktop sizes.

Live kits and the comparison need the API keys, which this session doesn't have, so they weren't re-run here. The latest live evidence is Prathibha's [end-to-end check](2026-10-29-end-to-end-after-merges.md) of the same agent code earlier today: 8 live kits, 7 comparisons and 20 bad inputs, with no blockers. Nothing below stands in for a live result.

**Result: no blockers in what could be tested.** Four small UI issues are fixed in #35. The rest are listed below, by priority.

## What a judge sees, by criterion

| Criterion | What holds up | What's missing or weak |
| --- | --- | --- |
| Stage one: theme, Qloo API | Agentic: lookups in code, then Claude with five Qloo tools and a checked `submit_kit`. Qloo `/search` and `/v2/insights` with year, location and tag filters | – |
| Technological implementation (tie-breaker) | 309 tests (311 with #35), typecheck, lint and the build pass. "How this kit was made" shows each Qloo lookup and what was screened out and why. Bad input is refused fast and plainly | No security headers of the app's own; no link-preview tags |
| Design | One card at a time, large targets, text sizes, light and dark. No accessibility-scan findings apart from the missing `<h1>` (fixed in #35), including the 7:1 contrast rule. The kit and the note print cleanly | No video yet. The README had no pictures (added in this PR) |
| Potential impact | Care rules built in: safety stop first, "Watch for", Stop on every card, a note for the care team, privacy | No tester results (honestly marked as not run). No public source cited for reminiscence being a widely used approach |
| Quality of the idea | One favorite → the person's years through Qloo, shown side by side with Claude on its own | – |

## Checks that passed

| Area | What was checked | Result |
| --- | --- | --- |
| Requirements | Public repo, license in the About section, homepage link, default branch | Public; GitHub detects **MIT**; homepage is the live site; `main` is the default branch and production deploys from it |
| Code | Tests on Node 24, typecheck, lint, build | 309 pass on `main` (311 with #35, also with `CLAUDE_EFFORT=max`); the rest pass |
| Rosa demo | Kit sections, media links, embeds, trace | Songs, films and shows, dish, place, questions, Watch for. 8 media links, all YouTube or Spotify searches opening in a new tab with `noopener`; nothing embedded. The trace lists 4 Qloo lookups and 8 screened out with reasons (*Last Tango in Paris*: rated NC-17; *Charly*: memory decline) |
| Session mode | 15 cards, every reaction, focus, ending | Each reaction moves to the next card (the "1 of 15" counter is a polite live region); focus moves to the card's title; End session, and Stop then "Write the session note", both lead to the note |
| Session note | Copy, WhatsApp, Print, next kit | "Copied ✓" for 4 s and "The note is copied." announced; the WhatsApp link is `wa.me` with the note; Print shows the whole note; Build the next kit asks the safety question again |
| Start over (#32) | From the kit and from the next-kit form | Every field empty, the safety question unanswered, the back link gone, the demos still there, nothing sent |
| Safety stop | Margaret demo; "Yes" on the form; the API | Shown at once on the page; `{"suddenChange":true}` alone, or with a 2 MB name, gets the stop (306 bytes back; the name isn't echoed); the comparison refuses after a sudden change |
| Bad input | Not JSON, `{}`, 2 MB body, `GET` | 400 with plain messages (2 MB refused in 14 ms); `GET` gives 405 |
| Accessibility | axe (WCAG 2.2 A and AA, best practice, and the 7:1 enhanced contrast rule) on the home page, kit with every fold open, session card, note, form errors and safety stop in light mode, and the safety stop in dark mode at Largest | No findings except "page has no `<h1>`" (fixed in #35) |
| Keyboard | Tab through the home page; form errors | Visible focus on every stop; submitting an empty form moves focus to the first question |
| Sizes | 320, 360, 390, 768 and 1280 px; Standard, Large and Largest; light and dark | No sideways scroll except session cards at 320 px Largest; "Not interested" spilled out of its button at some sizes (both fixed in #35). No text below the base size on the home page or the kit (outside the trace); every button in session mode at least 48 px tall |
| Privacy | Cookies, browser storage, analytics payloads along a judge's whole path | No cookies, and nothing in browser storage (the text size is kept there once chosen, by design). 9 events, all from the allowed list (`$pageview`, `text_size_changed`, `demo_opened` ×2, `kit_action: start_session`, `session_started`, `session_ended`, `note_action: build_next`, `form_action: start_over`). No names, places, years, reactions or safety answers; choosing "Yes" sends nothing |
| Print | The kit and a long note, in Chromium | Clean: buttons and the trace hidden, the "food: check diet and swallowing" note kept |

PostHog doesn't count automated browsers, so the analytics check hid the browser's automation flag; real visitors aren't affected.

## Findings

### Fixed in #35 (waiting for review)
1. **No `<h1>` on any page.** The site title is now the page's one `<h1>`, with the same look.
2. **A 320 px screen at Largest text scrolled sideways in session mode**, because card titles with a long word didn't fit. Now a long word breaks only when it can't fit.
3. **"Not interested" spilled out of its button** on a tablet at Large or Largest text, and on small phones. The reactions now wrap at 7rem each, with Stop on its own row.
4. **The footer's analytics link** pointed at an older copy of docs/analytics.md, without `start_over`. It now points at `main`.

### Fixed in this PR (docs only)
5. **The README said the demos send "nothing"**, but opening a demo is counted. It now says "no details are sent", as the page does.
6. **The README had no pictures.** Three screenshots of the Rosa demo are added: the kit, a session card on a phone, and "How this kit was made".
7. **CLAUDE.md**: the branch flow and the work-log intro now say PRs go into `main` since Oct 29; twelve work-log rows that said "This commit" now name their merge commits.
8. **docs/plan.md**: the risk table said the last turn "offers only `submit_kit`". The same tools are offered on every turn, and the last turn asks for `submit_kit` and refuses further lookups.
9. **The test count**: the README said 309 and the plan's testing table 134 (an early count). Both now say 311, the count once #35 is in.

### Before submitting
- **The video.** The checklist leaves it unticked, and judges may score from the description and the video alone. A 2–3 minute walk-through would work: the problem, the Rosa demo, a live kit with its progress, session mode and the note, the comparison, the safety stop.
- **The Devpost text against "Claims we can make".** It lives only on Devpost, so this test couldn't read it.
- **The live site after #35 merges**, as an anonymous visitor: a live kit, a comparison and the safety stop. This session couldn't reach it.

### Worth doing if there's time
- **Link previews.** No Open Graph or Twitter tags and no preview image, so a pasted link shows no title card or picture.
- **Security headers.** The app sets none of its own (`X-Content-Type-Options`, `Referrer-Policy`, framing, `Permissions-Policy`); Vercel adds only HTTPS enforcement.
- **Start over** (from the #32 review). Focus is left on the page itself with nothing announced, and an accidental tap can't be undone. A 4-second "Started over · Undo" would match our other confirmations.
- **Printing a long note in a browser without `field-sizing`** (Firefox; Safari before it shipped). The note box keeps its 8 lines and cuts the rest off on paper: in Chromium with `field-sizing` turned off, an 8-line note needed 365 px in a 299 px box. Chromium prints it all.
- **The printed kit's footer** sits alone on a third page.
- **A public source** for "reminiscence is a widely used, non-drug way to connect", in the README and on Devpost.
- **Repo topics** are empty (for example `qloo`, `hackathon`, `dementia`, `caregiving`, `claude`, `nextjs`).
- **From Prathibha's end-to-end check, still open:**
  - dish names in Qloo's lowercase;
  - a favorite Qloo can't find also skips the place, dish and films;
  - "Not interested" doesn't leave an item out of the next kit (by design; decide);
  - the comparison can't check Japanese artists named in English;
  - the trace lists a screened-out restaurant once per dish.

### After submitting
- Revoke the Vercel protection bypass token (Open items). Keep Vercel, the Qloo key and Claude credits until Nov 16.

## Not tested here
- **The live site itself,** and live kits and comparisons on it: blocked from this session. To test it from here, allow `memory-lane-two-umber.vercel.app` in the environment's network settings.
- **Other devices and browsers:** real phones and tablets, Safari and Firefox (only Chromium is installed here).
- **Read aloud:** the test browser has no on-device voice, so the button correctly doesn't appear.
- **External targets:** WhatsApp and the print dialog opening. Their links and the printed output were checked.
- **Visitor limits on production:** the code is unchanged since the Oct 27 audit, which covers them with tests.
