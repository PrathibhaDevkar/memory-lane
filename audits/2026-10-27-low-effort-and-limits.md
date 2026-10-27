# Low effort by default, and limits judges won't hit (Oct 27)

Prathibha, with Claude. Branch `feat/limits-and-oct-27-audit`, on top of Abil's PR #21 (`low` effort by default). Everything below ran on today's code (PRs #13 to #19 merged), Claude Haiku 5.5, live Qloo and Claude, on a local server, with `low` as the default as in #21.

## What changes

| Setting | Before | Now | Where |
| --- | --- | --- | --- |
| `CLAUDE_EFFORT` default | `medium` | `low` (PR #21, Abil) | `lib/agent/run.ts` |
| `VISITOR_KITS_PER_HOUR` default | 3 | 20 | `lib/ratelimit.ts` (this PR) |
| `DAILY_LIVE_KITS` default | 100 | 1,000 | `lib/ratelimit.ts` (this PR) |

All three can still be set in Vercel without a code change. The comparison with Claude on its own uses the same effort as a kit, and the same limits (a comparison counts as one live kit). The short traditions call was already at `low` with no thinking and is unchanged.

Also in this PR, found while checking edge cases:
- **A mistyped `CLAUDE_EFFORT` broke every kit.** The value went straight to the API, so `lwo` or `medium effort` would have made each live kit fail. It now ignores spaces and capitals (`" Medium "` works), and anything else falls back to `low` with an `effort_not_valid` line in the server log, like the model rule.
- **A test depended on the shell.** The comparison test expected `medium` without setting it, so it passed only because the shell or the default said `medium`; in a Claude cloud session (`CLAUDE_EFFORT=max`) it would fail. Tests now set the effort they expect.

## Checks

- 279 tests pass (7 more than #21), with `CLAUDE_EFFORT` unset, `medium` and `max` in the shell; typecheck, lint and the build pass.
- New tests, effort (the default itself is #21's test): valid values with spaces or capitals; four mistyped values fall back to `low` and are logged; the main call sends `low`; the comparison follows a `CLAUDE_EFFORT` override.
- New tests, limits: defaults 20 and 1,000; the 20th kit in an hour is allowed and the 21st refused with "You've built 20 kits in the last hour", while a second visitor still gets one; after the day's 1,000 every visitor is refused, even one under their own limit; requests with no address share one visitor count, so leaving the address out doesn't skip the limit.
- Not tested live: the 21st kit against real Upstash Redis (it would take 20 live kits from one address and up to 220 Qloo calls). Upstash's window is covered by its own tests; ours cover how we use it.

## Live: `low` (new default, `CLAUDE_EFFORT` unset) against `medium`

30 live kits. Reports: [low](2026-10-27-claude-haiku-5-5-low.md) and [medium](2026-10-27-claude-haiku-5-5-medium.md) (the first full run at each level); the reruns below were run without `--report`.

| | `low` | `medium` |
| --- | --- | --- |
| Kits that passed | 17 of 18 | 11 of 12 |
| The one that failed | Mr. Okafor, 1 section (Lagos data, below) | Rosa (Taylor Swift): one modern artist and no questions (below) |
| Claude cost per kit, full runs | $0.0010–0.0014, about $0.0012 on average | $0.0012–0.0017, about $0.0014 on average |
| Output tokens per kit (mostly thinking), first full run | 1,595–2,043 | 1,937–2,985 |
| Seconds per kit, full runs | 10.0–19.5, about 15 on average | 14.5–20.4, about 17 on average |
| Kit questions dropped by the question check | 0 | 0 |
| Comparison: Claude cost and time | $0.0003–0.0007, 3.4–8.0 s | $0.0007–0.0009, 7.2–10.0 s |

What it means:
- **`low` is about 13% cheaper and 2 seconds faster per kit** today, less than the 24% measured on Oct 21 (not measured why; likely the medium runs thought less today, and the Qloo music lookup, 3–6 s, is a fixed share of each kit's time). Comparisons gain most: about half the cost and twice as fast.
- **Kits read as well at `low`.** Every Memory Lane question in both full runs is open, adult and story-inviting ("Walt, what comes to mind when you hear rock and roll from the late fifties?"), picks are from the right years (apart from the known open item: Femi Kuti, a later artist, once for Mr. Okafor at `low`), and Elena's late-level cards are short comments about the music.
- Both failures are rare and not caused by the effort level (see Findings).

Reruns of the two personas that failed:

| Persona | `low` | `medium` |
| --- | --- | --- |
| Rosa (Taylor Swift) | 6 of 6 passed | 4 of 5 passed (1 empty kit) |
| Mr. Okafor | 3 of 4 passed (2, 3 and 3 sections; once 1) | 3 of 3 passed (2 sections each time) |

## Limits: why 20 and 1,000

- **20 per visitor an hour:** each comparison counts as a kit, so a judge trying five people with a comparison each uses 10, and two judges on one network fit. Prathibha had proposed 30 for more headroom when judges share an address (a hackathon venue, an office network); the team chose Abil's 20, and `VISITOR_KITS_PER_HOUR` in Vercel raises it without a code change if that becomes a problem.
- **1,000 a day for the whole site:** at about $0.0012–0.0014 a kit, every one of them used costs about $1.40 a day, about $28 to Nov 16, under the $40 monthly Console limit. The daily alert (`TOKEN_ALERT_DAILY_USD`, $1) would fire at about 700 kits, as an early warning.
- **To watch:** at 1,000 kits a day Qloo would get up to about 11,000 calls (6–11 per kit, plus up to 8 per comparison). We don't know the hackathon key's daily limit; a Qloo failure becomes a gap, not an error.

## Findings for follow-up (not changed here)

1. **An almost empty kit is accepted.** Once in 30 kits (at `medium`), Claude submitted the Taylor Swift persona's kit with one artist from today (Selena Gomez & the Scene, from the list seeded by the modern favorite) and no film, dish, place or questions, though Qloo had returned plenty. `buildKit` kept it, so a caregiver would see a near-empty kit. Proposal: when a kit has fewer questions than its level asks for, or fewer than 2 sections while Qloo returned results, ask Claude once more (the loop has room: at most 4 calls). Its own PR, with a smoke check.
2. **Lagos has thin Qloo data.** Mr. Okafor gets no landmarks, and Claude judges most restaurants too recent for his years, so his kit sits at the smoke check's 2-section bar, and once at `low` fell to 1. This is about the data, not the effort level: the kit says why in its gaps.
3. **The question check misses two phrasings.** In the comparison, "Rosa, what is your favorite memory of a Chicago neighborhood gathering?" and "what stands out to you about the jollof rice your family used to share" were kept; kits use the same check. Proposal: add "memory" and "memories" to the words that drop a card, and name them in the prompt's list (a prompt change, so a smoke check with it).
