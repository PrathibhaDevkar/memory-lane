# Smoke-check audit: claude-haiku-5-5 at low effort, 2026-10-27

Base URL: http://localhost:3020. 7 of 7 personas passed. Claude cost for the run: $0.0077 at list prices, plus $0.0039 for the comparisons.

| Persona | Passed | Source | Sections | Questions | Claude calls | Tokens | Cost (US$) | Seconds | Alerts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rosa | yes | live | 4 | 5 | 1 | in=1962; cache_write=2648; cache_read=0; out=1755 | 0.001405 | 14.0 |  |
| walt | yes | live | 4 | 5 | 1 | in=2679; cache_write=0; cache_read=2648; out=1883 | 0.001236 | 15.3 |  |
| june | yes | live | 4 | 5 | 1 | in=2467; cache_write=0; cache_read=2648; out=2158 | 0.001352 | 16.2 |  |
| swift | yes | live | 4 | 5 | 1 | in=1870; cache_write=0; cache_read=2648; out=1763 | 0.001095 | 15.9 |  |
| margaret | yes | safety stop, no Claude call |  |  |  |  |  | 0.0 |  |
| okafor | yes | live | 2 | 3 | 1 | in=1753; cache_write=0; cache_read=2648; out=1876 | 0.001140 | 14.5 |  |
| elena | yes | live | 3 | 2 | 2 | in=2340; cache_write=0; cache_read=2648; out=2507 | 0.001514 | 22.2 |  |

Claude on its own (`--compare`), checked against Qloo and the question rules:

| Persona | Source | Found in Qloo | Films in their years | Left out by filters | Questions kept | Tokens | Cost (US$) | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rosa | live | 7 of 7 | 1 of 2 | 0 | 5 of 5 | in=1505; cache_write=0; cache_read=0; out=517 | 0.000409 | 4.3 |
| walt | live | 5 of 6 | 1 of 1 | 0 | 5 of 5 | in=1504; cache_write=0; cache_read=0; out=1074 | 0.000687 | 7.6 |
| june | live | 6 of 6 | 0 of 1 | 0 | 5 of 5 | in=1506; cache_write=0; cache_read=0; out=435 | 0.000368 | 3.4 |
| swift | live | 6 of 6 | 1 of 1 | 0 | 5 of 5 | in=1511; cache_write=0; cache_read=0; out=1577 | 0.000940 | 11.3 |
| okafor | live | 5 of 6 | 1 of 1 | 0 | 3 of 3 | in=1532; cache_write=0; cache_read=0; out=1408 | 0.000857 | 7.7 |
| elena | live | 5 of 5 | 1 of 1 | 0 | 2 of 2 | in=1515; cache_write=0; cache_read=0; out=898 | 0.000601 | 6.3 |

Read the kits themselves too: questions that invite stories, picks from the right era, nothing on an avoid list.
Approval: _names and date_ (see CLAUDE.md, Model rule).
