# Smoke-check audit: claude-haiku-5-5 at medium effort, 2026-10-27

Base URL: http://localhost:3021. 6 of 7 personas passed. Claude cost for the run: $0.0084 at list prices, plus $0.0051 for the comparisons.

| Persona | Passed | Source | Sections | Questions | Claude calls | Tokens | Cost (US$) | Seconds | Alerts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rosa | yes | live | 4 | 5 | 1 | in=1962; cache_write=0; cache_read=2623; out=1937 | 0.001191 | 14.5 |  |
| walt | yes | live | 4 | 5 | 1 | in=2679; cache_write=0; cache_read=2623; out=2086 | 0.001337 | 17.3 |  |
| june | yes | live | 4 | 5 | 1 | in=2467; cache_write=0; cache_read=2623; out=2357 | 0.001451 | 17.1 |  |
| swift | no | live | 1 | 0 | 1 | in=1870; cache_write=0; cache_read=2623; out=1984 | 0.001205 | 15.7 |  |
| margaret | yes | safety stop, no Claude call |  |  |  |  |  | 0.0 |  |
| okafor | yes | live | 2 | 3 | 1 | in=1753; cache_write=0; cache_read=2623; out=2985 | 0.001694 | 19.0 |  |
| elena | yes | live | 3 | 2 | 2 | in=2340; cache_write=0; cache_read=2623; out=2596 | 0.001558 | 20.4 |  |

Claude on its own (`--compare`), checked against Qloo and the question rules:

| Persona | Source | Found in Qloo | Films in their years | Left out by filters | Questions kept | Tokens | Cost (US$) | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rosa | live | 6 of 6 | 1 of 1 | 0 | 5 of 5 | in=1480; cache_write=0; cache_read=0; out=1504 | 0.000900 | 8.4 |
| walt | live | 4 of 6 | 1 of 1 | 0 | 5 of 5 | in=1479; cache_write=0; cache_read=0; out=1242 | 0.000769 | 8.4 |
| june | live | 7 of 7 | 2 of 2 | 0 | 5 of 5 | in=1481; cache_write=0; cache_read=0; out=1437 | 0.000867 | 10.0 |
| swift | live | 5 of 6 | 1 of 1 | 0 | 5 of 5 | in=1486; cache_write=0; cache_read=0; out=1566 | 0.000932 | 8.4 |
| okafor | live | 5 of 6 | 1 of 1 | 0 | 3 of 3 | in=1507; cache_write=0; cache_read=0; out=1533 | 0.000917 | 9.0 |
| elena | live | 4 of 5 | 1 of 1 | 0 | 2 of 2 | in=1490; cache_write=0; cache_read=0; out=1197 | 0.000748 | 7.2 |

Read the kits themselves too: questions that invite stories, picks from the right era, nothing on an avoid list.
Approval: _names and date_ (see CLAUDE.md, Model rule).
