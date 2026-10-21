# Smoke-check audit: claude-haiku-5-5 at medium effort, 2026-10-19

Base URL: http://localhost:3018. 6 of 6 personas passed. Claude cost for the run: $0.0105 at list prices.

| Persona | Passed | Source | Sections | Questions | Claude calls | Tokens | Cost (US$) | Seconds | Alerts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rosa | yes | live | 4 | 5 | 1 | in=2283; cache_write=0; cache_read=2968; out=2093 | 0.001304 | 10.4 |  |
| walt | yes | live | 4 | 5 | 1 | in=2522; cache_write=0; cache_read=2968; out=2108 | 0.001336 | 10.0 |  |
| june | yes | live | 4 | 5 | 1 | in=2467; cache_write=0; cache_read=2968; out=2639 | 0.001596 | 12.5 |  |
| swift | yes | live | 3 | 5 | 2 | in=4720; cache_write=0; cache_read=5936; out=2578 | 0.001820 | 13.6 |  |
| okafor | yes | live | 2 | 3 | 1 | in=2042; cache_write=0; cache_read=2968; out=3361 | 0.001914 | 16.5 |  |
| elena | yes | live | 4 | 2 | 3 | in=10257; cache_write=0; cache_read=8904; out=2828 | 0.002529 | 17.8 | Kit read 19161 input tokens, over the limit of 12000. / Kit took 3 Claude calls, over the limit of 2. |

Read the kits themselves too: questions that invite stories, picks from the right era, nothing on an avoid list.
Approval: _names and date_ (see CLAUDE.md, Model rule).
