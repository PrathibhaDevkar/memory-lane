# Smoke-check audit: claude-haiku-5-5 at low effort, 2026-10-27

Base URL: http://localhost:3020. 6 of 7 personas passed. Claude cost for the run: $0.0073 at list prices, plus $0.0023 for the comparisons.

| Persona | Passed | Source | Sections | Questions | Claude calls | Tokens | Cost (US$) | Seconds | Alerts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rosa | yes | live | 4 | 5 | 1 | in=1962; cache_write=2623; cache_read=0; out=1806 | 0.001427 | 15.2 |  |
| walt | yes | live | 4 | 5 | 1 | in=2679; cache_write=0; cache_read=2623; out=2036 | 0.001312 | 15.2 |  |
| june | yes | live | 4 | 5 | 1 | in=2467; cache_write=0; cache_read=2623; out=1674 | 0.001110 | 14.2 |  |
| swift | yes | live | 4 | 5 | 1 | in=1870; cache_write=0; cache_read=2623; out=1595 | 0.001011 | 12.9 |  |
| margaret | yes | safety stop, no Claude call |  |  |  |  |  | 0.0 |  |
| okafor | no | live | 1 | 3 | 1 | in=1753; cache_write=0; cache_read=2623; out=2043 | 0.001223 | 17.8 |  |
| elena | yes | live | 4 | 2 | 2 | in=2340; cache_write=0; cache_read=2623; out=1973 | 0.001247 | 19.5 |  |

Claude on its own (`--compare`), checked against Qloo and the question rules:

| Persona | Source | Found in Qloo | Films in their years | Left out by filters | Questions kept | Tokens | Cost (US$) | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rosa | live | 5 of 6 | 1 of 1 | 0 | 5 of 5 | in=1480; cache_write=0; cache_read=0; out=415 | 0.000356 | 3.9 |
| walt | live | 7 of 7 | 2 of 2 | 0 | 5 of 5 | in=1479; cache_write=0; cache_read=0; out=526 | 0.000411 | 4.7 |
| june | live | 7 of 7 | 1 of 2 | 1 | 5 of 5 | in=1481; cache_write=0; cache_read=0; out=502 | 0.000399 | 5.6 |
| swift | live | 6 of 7 | 1 of 2 | 0 | 5 of 5 | in=1486; cache_write=0; cache_read=0; out=537 | 0.000417 | 4.0 |
| okafor | live | 5 of 6 | 1 of 1 | 0 | 3 of 3 | in=1507; cache_write=0; cache_read=0; out=483 | 0.000392 | 4.1 |
| elena | live | 3 of 4 | 0 of 0 | 0 | 2 of 2 | in=1490; cache_write=0; cache_read=0; out=325 | 0.000311 | 8.0 |

Read the kits themselves too: questions that invite stories, picks from the right era, nothing on an avoid list.
Approval: _names and date_ (see CLAUDE.md, Model rule).
