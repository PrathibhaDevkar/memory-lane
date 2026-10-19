# Token alerts and kit audits

Every live kit is audited, and the same API call returns its Claude token use, its cost and any token alert. Alerts also go to the server log. The Claude Console's spend limit and spend alerts sit behind them as the last backstop.

## Where alerts show up

| Where | What you see | When |
| --- | --- | --- |
| Response headers of `POST /api/kit` | `X-Claude-Model`, `X-Claude-Calls`, `X-Claude-Tokens`, `X-Claude-Cost-USD`, `X-Kit-Audit` (`pass` or `fail`), and `X-Token-Alert` when a limit is passed | Every live kit |
| Server log (Vercel → Logs) | `claude_turn` per Claude call; `kit_audit` per kit; `token_alert` for a kit with alerts; `token_alert_daily` once, for the kit that crosses a daily limit; `model_not_approved` when Sonnet or Opus is set without approval | Live kits |
| `npm run smoke` | An `audit` line and, if any, an `ALERT` line per persona. `--report` also writes `audits/<date>-<model>-<effort>.md` | Smoke checks |
| Claude Console | Spend alerts at $10 and $25 and a $40 monthly spend limit on the `memory-lane` workspace | Set once in the Console |

The logs and headers carry token counts, cost, model and quality signals only, never profile details. Saved and reused kits make no Claude call, so they carry no audit headers.

## Limits

All limits are environment variables; blank or invalid values fall back to the default.

| Variable | Default | Alert when |
| --- | --- | --- |
| `TOKEN_ALERT_KIT_INPUT` | 12,000 | One kit reads more input tokens than this (plain, cache-write and cache-read together) |
| `TOKEN_ALERT_KIT_OUTPUT` | 4,000 | One kit writes more output tokens than this, thinking included |
| `TOKEN_ALERT_KIT_CALLS` | 2 | One kit takes more Claude calls than this |
| `TOKEN_ALERT_KIT_USD` | 0.05 | One kit costs more than this at list prices |
| `TOKEN_ALERT_DAILY_TOKENS` | 1,000,000 | The day's tokens (UTC, all kits) pass this. Needs Redis |
| `TOKEN_ALERT_DAILY_USD` | 1 | The day's cost passes this. Needs Redis |

Why these numbers: a typical kit takes one Claude call that reads about 5,000 tokens and writes about 1,500, so the kit limits sit at roughly twice that. These are estimates from offline measurement; replace them with the first live smoke check's numbers. On Haiku 5.5 a kit costs about $0.001, so the $0.05 kit limit only fires on a runaway kit or a bigger model. $1 a day is a little under the pace of the $40 monthly Console limit (about $1.33 a day).

Prices used for cost (US$ per million tokens, list prices on Oct 19, 2026, from the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing)); they live in `lib/agent/audit.ts` and `scripts/smoke.mjs`:

| Model | Input | 5-minute cache write | Cache read | Output |
| --- | --- | --- | --- | --- |
| `claude-haiku-5-5` (prompts up to 100K tokens) | 0.10 | 0.125 | 0.01 | 0.50 |
| `claude-sonnet-5-5` | 2 | 2.50 | 0.10 | 10 |
| `claude-opus-5-5` | 4 | 5 | 0.20 | 20 |

## When an alert fires

| Alert | Likely cause | Do this |
| --- | --- | --- |
| Input over the kit limit | Extra Claude calls, or bigger lookup results | Open the kit's trace ("How this kit was made") and see which calls ran |
| Output over the kit limit | Long thinking | Try `CLAUDE_EFFORT=low` in a smoke check and compare the kits side by side |
| Calls over the kit limit | Claude fixing a problem: a modern favorite, a missing tradition, the wrong match | Read the trace; if one cause repeats, handle it in `lookUpFirst` (`lib/agent/run.ts`) |
| Cost over the kit limit | A model other than Haiku, or a runaway kit | Check `X-Claude-Model` and `CLAUDE_MODEL_APPROVAL` |
| Daily tokens or cost over the limit | Heavy use | Check the visitor and daily kit limits (`VISITOR_KITS_PER_HOUR`, `DAILY_LIVE_KITS`). Kill switch: `KIT_SOURCE=fixture` and redeploy |
| `model_not_approved` in the log | `CLAUDE_MODEL` is Sonnet or Opus without an approval naming it; the app used Haiku | Approve it through the steps below, or remove `CLAUDE_MODEL` |

## Changing the model: audit, then approve

Haiku 5.5 is the default. Sonnet 5.5 or Opus 5.5 is used only when both of us approve it after testing; try Sonnet before Opus, since it costs half as much.

1. **Baseline on Haiku.** With the app running (`npm run dev:agent`), run `npm run smoke -- rosa walt june swift okafor elena --report`. It writes `audits/<date>-claude-haiku-5-5-medium.md`.
2. **Trial the candidate.** Restart with `CLAUDE_MODEL=claude-sonnet-5-5` and `CLAUDE_MODEL_APPROVAL="claude-sonnet-5-5 trial"` (the app needs an approval naming the model even for a trial), then run the same command.
3. **Compare.** Read both reports and the kits side by side: personas passed, alerts, cost per kit, and the kits themselves: questions that invite stories, picks from the right era, nothing on an avoid list. A reasonable bar for switching: Haiku fails the quality bar on 2 or more of the 6 live personas, or its kits read clearly weaker, and the candidate fixes that.
4. **Approve and record.** Both of you write your names and the date in the candidate report's "Approval" line and commit it. In Vercel set `CLAUDE_MODEL=claude-sonnet-5-5` and `CLAUDE_MODEL_APPROVAL="claude-sonnet-5-5 approved <date> by Abil and Prathibha, audits/<report>.md"`, then redeploy.
5. **Going back.** Remove `CLAUDE_MODEL` (or set it to `claude-haiku-5-5`) and redeploy.
