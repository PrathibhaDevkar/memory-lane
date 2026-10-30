# Memory Lane: Submission

> The submission checklist, the rules for what we claim, and the testing instructions for judges. The final project text (story, how it's built, challenges, what's next) is on the Memory Lane project page on [Devpost](https://qloo.devpost.com/); this file no longer keeps a copy, so there is one source of truth.
> Deadline: **Oct 30, 2026, 11:45 pm ET**; target Oct 29. Rules: [qloo.devpost.com/rules](https://qloo.devpost.com/rules). Updated Oct 29.

---

## Checklist (from the official rules)

- [x] **Working demo link:** https://memory-lane-two-umber.vercel.app, with live kits on (since Oct 27), deployed from `main` (since Oct 29)
- [x] **Public repo** with an **open-source license visible in the About section** (MIT); the repo contains everything needed to run it ([README](../README.md#run-it-locally))
- [x] **Text description** in English: written on Devpost, with measured facts from dated runs
- [x] **Testing instructions** (below): free and **unrestricted for judges until Nov 16**; demo kits are never rate-limited, and live kits allow 20 per visitor an hour and 1,000 a day
- [x] **Video** (not required, but judges may score from the description and video alone): [2:24 narrated walkthrough on YouTube](https://www.youtube.com/watch?v=HDbtGJg_WOc), recorded on the live site on Oct 30 at 1920×1200, with captions and a computer voice-over
- [x] Explain how Qloo is integrated and why the project is **agentic** (on Devpost, and in the [README](../README.md#how-qloo-drives-it))
- [ ] One team member submits as the **Representative**
- [ ] After submitting: keep Vercel up, the Qloo key valid and Claude credits funded **until Nov 16**
- [ ] Every claim in the Devpost text, the video and the README passes **Claims we can make** (next section)

---

## Claims we can make (read before writing, recording or submitting)

A claim we can't back up costs more than it wins, and the comparison is where it's easiest to overreach. These hold for the Devpost text, the video, the README and anything said to judges:

- **Numbers come from a dated run or count** (a live check, an audit report, the test count on a given day), and we say which.
- **The comparison says what its checks found, and no more.** A pick that isn't in Qloo under that name is *unchecked*: Qloo may not list it, or lists it under another name or year. It never means Claude got it wrong. In the first live comparison (Oct 27) Qloo didn't list Victor Olaiya or Orlando Julius, both real highlife musicians. The page shows such picks in grey as "can't be checked".
- **Only checks that ran count against Claude on its own:** a release year outside the person's years (when Claude's year and Qloo's agree), the content filter or avoid list, and the question rules. Use the numbers from the run on screen: they change from run to run, and Mr. Okafor's did on Oct 27. In the first live comparison they were: "For Mr. Okafor, 2 of Claude's 5 picks could be confirmed in Qloo; the other 3 aren't listed there under those names, so they can't be checked."
- **Memory Lane's picks come from Qloo results and passed the filters.** Whether they're right *for a person* is for testers to say, not for us to claim.
- **Testers** are "adults aged 60+" or "people who have looked after an older relative", reported exactly, with group sizes.
- **No medical claims:** not therapy, no "improves memory", no health advice.
- **Saved stays saved:** demo kits and reused results are labeled as saved runs; only live results are called live.

`tests/claims.test.ts` fails if this file, the README or the plan calls a pick “made up”, “hallucinated” or “fabricated”; words in quotes, like these, are being discussed and are skipped.

---

## Testing instructions (for judges)

1. Open **https://memory-lane-two-umber.vercel.app**. No sign-in.
2. Click **Try a demo → Rosa** for a full kit; open **"How this kit was made"** at the bottom to see the Qloo lookups and what was screened out. Click **Start session**, mark a few reactions, tap **Stop**, and read the session note.
3. Click **Try a demo → Margaret** to see the safety check: no kit, a prompt to contact a nurse or doctor.
4. To build your own kit, fill in the form (or **Fill in an example (Rosa)**) and click **Build the session kit**. You'll see each Qloo lookup and Claude's step as they happen; a live kit takes about 10 to 20 seconds.
5. Under any kit, click **Compare with Claude on its own** to see what Claude suggests without Qloo, and how its picks and questions hold up against Qloo and the question rules. A pick Qloo doesn't list shows as "can't be checked": not a mistake, just something Qloo can't confirm.

All personas are fictional. Please don't enter details about a real person.
