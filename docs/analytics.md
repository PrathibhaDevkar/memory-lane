# Analytics (PostHog)

Memory Lane sends product analytics to PostHog: how the app is used, when, which screens and buttons, and what each live kit cost in Claude tokens. It does this without breaking Product rule 6 (nothing about a real person is stored or logged). Analytics are off unless `NEXT_PUBLIC_POSTHOG_KEY` is set.

## What is sent

Only the events and properties listed in [`lib/analytics/events.ts`](../lib/analytics/events.ts). `track()` in the browser and the server capture both drop anything else.

**From the browser** (how the app is used):

| Event | Properties | When |
| --- | --- | --- |
| `$pageview`, `$pageleave` | PostHog's standard page and browser details (URL `/`, browser, screen size, time zone) | Opening and leaving the app |
| `demo_opened` | `demo`: the fictional person (`rosa`, `margaret`) | A demo button |
| `example_filled` | none | "Fill in an example (Rosa)" |
| `form_action` | `action`: `add_favorite`, `remove_favorite`, `more_about_opened`, `start_over` | Form controls |
| `kit_shown` | `source` (`live`, `cached`, `fixture`), `seconds` to build | A kit appears |
| `kit_failed` | `reason`: `check_fields`, `limit`, `paused`, `server`, `shape`, `network` | A kit couldn't be built |
| `kit_action` | `action`: `start_session`, `whatsapp`, `print`, `change_details`, `back_to_kit`, `compare`, `start_over` | Buttons on the kit |
| `comparison_shown` | `source` (`live`, `cached`) | The comparison with Claude on its own appears |
| `comparison_failed` | `reason`: `not_live`, `limit`, `paused`, `server`, `shape`, `network` | A comparison couldn't be made |
| `media_opened` | `where` (`kit`, `session`), `service` (`spotify`, `youtube`) | A song or film search is opened (not which one) |
| `how_made_opened` | none | "How this kit was made" is opened |
| `session_started`, `session_ended` | none | Session mode starts and ends |
| `note_action` | `action`: `copy`, `whatsapp`, `print`, `build_next`, `back_to_kit` | Buttons on the session note |
| `text_size_changed` | `size`: `standard`, `large`, `largest` | The Text size control |
| `read_aloud` | none | A session card is read aloud (not which card) |

**From the server** (token use, sent after the response so a kit is never slowed down):

| Event | Properties |
| --- | --- |
| `kit_built` | `source` (`live`, `reused`, `fixture`); for live kits also `model`, `effort`, `claude_calls`, `input_tokens`, `cache_write_tokens`, `cache_read_tokens`, `output_tokens`, `cost_usd`, `audit_passed`, `sections_filled`, `removed`, `alerts`, `alert_kinds`, `build_seconds`, `today_tokens`, `today_usd` |
| `kit_refused` | `reason`: `not_configured`, `visitor_limit`, `daily_limit`, `paused`, `claude_busy`, `claude_error`, `error` |
| `comparison_built` | `source` (`live`, `reused`); for live comparisons also `model`, `input_tokens`, `output_tokens`, `cost_usd`, `build_seconds` |
| `comparison_refused` | `reason`: the same as `kit_refused` |

The comparison events carry no counts of picks or questions: the number of questions would reveal the support level, and what Claude picked is a kit's contents.

## What is never sent

- Anything the caregiver types: names, birth year, hometown, favorites, things to avoid, work, language, traditions.
- The support level, or counts that would reveal it (the number of questions or activity ideas).
- What a kit holds: songs, films, places, dishes, questions.
- Session reactions (Lit up, Calm, Not interested, Not today, Stop) and the session note.
- The safety check. A safety stop sends no event at all, from the browser or the server.
- Page text or clicks in general: autocapture is off. So are screen recording, heatmaps, error capture, surveys and any extra PostHog scripts.

`tests/analytics.test.ts` and `tests/api-kit-analytics.test.ts` check these rules. A browser walk-through with a dummy key (Oct 21) recorded every request bound for PostHog: the 13 events above and PostHog's standard page and browser details, with no name, town, favorite, support level or reaction in any of them.

## Privacy settings

- **Cookieless** (`cookieless_mode: "always"`): nothing is stored on the device (no cookies, no local storage), so no cookie banner is needed. PostHog counts unique visitors per day from a hash of IP address, browser and site, with a salt it deletes every day. The same person on two days counts twice.
- **No person profiles** (`person_profiles: "never"`); server events carry `$process_person_profile: false` and a random ID.
- **Do Not Track and Global Privacy Control are honoured:** PostHog isn't loaded at all for those visitors.
- **Through our own site:** browser events go to `/ingest` on Memory Lane, which forwards them to PostHog (`next.config.ts`), so ad blockers don't drop them.
- **Bots are dropped by PostHog**, including automated browsers (`navigator.webdriver`).
- **Said on screen:** when analytics are on, the footer says "We count which screens and buttons are used, without cookies and without anything you type," with a link to this page (`components/AnalyticsNote.tsx`). The demo text says "no details are sent" rather than "nothing is sent", because opening a demo is counted.

## Setting it up

1. Create a PostHog Cloud project (US or EU; EU keeps the data in the EU).
2. In the project settings:
   - Turn on **Cookieless server hash mode** (Web analytics). This is required: without it PostHog ignores cookieless events.
   - Turn on **Discard client IP data**, so no IP address is stored. This also covers the server events.
   - In PostHog's setup wizard, choose only Product analytics and Web analytics, and turn off autocapture, heatmaps, web vitals and session replay, so the project settings match the code.
3. Set these in Vercel (and in `.env.local` to try it locally), then redeploy. `NEXT_PUBLIC_` values are built into the page, so a change needs a new build.
   - `NEXT_PUBLIC_POSTHOG_KEY`: the project API key (`phc_…`). It is a public, write-only key, but keep it in environment variables like the others. In Vercel it has to be the **Config** type: Vercel won't save a `NEXT_PUBLIC_` variable as Secret.
   - `NEXT_PUBLIC_POSTHOG_REGION`: `us` (default) or `eu`.
4. After deploying, open the app as a visitor and check PostHog's live events. Events can take up to about 10 minutes to show in Activity.

**Checked on Oct 21** (US Cloud project, both privacy settings on): locally, on a Vercel preview and on production. No cookies and no PostHog storage on the device; events arrive through `/ingest` with only their listed properties and no IP address; session reactions send nothing; `kit_built` arrives from the server. Unique visitors work through `/ingest`: the same iPhone in the same browser got one visitor ID on mobile data and a different one on Wi-Fi, so PostHog receives the visitor's real IP. (Two Wi-Fi taps also got two IDs, probably because the phone's IPv6 address changed, so daily visitor counts may run slightly high.) If every visit ever shows as the same visitor, set the region's host directly in `posthogInitOptions()` instead of `/ingest`, and accept that some ad blockers will drop events.

## Token use in PostHog

`kit_built` carries the same numbers as the kit audit (`docs/token-alerts.md`), so PostHog can chart them over time. Useful insights:

- Sum of `cost_usd` per day, and per `model`.
- Average `output_tokens` and `claude_calls` per live kit, to see the effect of a prompt or effort change.
- Count of `kit_built` by `source`, and `kit_refused` by `reason`, to see how often the limits are hit (judges must keep free access until Nov 16).
- Sum of `cost_usd` on `comparison_built`, for what the comparison with Claude on its own costs.
- Count of events by hour of day, for when the app is used.

The response headers, server log and Redis daily totals are unchanged; PostHog is an extra view, not a replacement.
