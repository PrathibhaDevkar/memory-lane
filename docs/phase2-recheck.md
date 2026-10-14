# Phase 2 re-check of Qloo (task 2.0)

Run: 2026-10-14 · script: [`scripts/qloo-recheck.mjs`](../scripts/qloo-recheck.mjs) · trimmed responses: [`fixtures/qloo/`](../fixtures/qloo/)

Same personas as Phase 0, with the call shapes Phase 2 uses: no age signal (D7), `take=25` for media, `take=50` for places, separate places and restaurants calls.

This file is generated and overwritten on each run. Conclusions drawn from it live in [approach.md](approach.md) (D2, D3, D4) and [implementation-plan.md](implementation-plan.md) §5 and §14.

## Rosa: born 1942, Chicago, favorite Frank Sinatra (window 1952–1972)

Seed: **Frank Sinatra** `FC0F8D26-BA80-4D83-8BBF-FC011DC8D241`

| Call | Status | Results | Notes |
|---|---|---|---|
| artists | 200 | 25 | Louis Armstrong, Nat King Cole, Dean Martin, Glenn Miller, Ella Fitzgerald, Tony Bennett, Peggy Lee, Bobby Darin |
| movies (year filter) | 200 | 25 | 25/25 in era |
| tv (year filter) | 200 | 25 | 25/25 in era |
| places, take 50 | 200 | 50 | 5 pass the landmark allowlist: Cloud Gate (sculpture), Millennium Park (park), Field Museum (natural_history_museum), Chicago Sports Museum (museum), Museum of Illusions Chicago (museum) |
| restaurants, take 50 | 200 | 50 | 14 list specialty dishes: Gino's East (meaty_legend_deep_dish_pizza, gino_s_house_salad); Cubs Bar & Grill (chicken_wings); Cindy's Rooftop (oysters_on_half_shell, chilaquiles); Benihana - Chicago (John Hancock) (chicken_fried_rice, steak); Giordano's (chicago_style_pizza, giordano_s_house_salad) |

Movies: Breakfast at Tiffany's (1961, Approved); The Graduate (1967, PG); Roman Holiday (1953, Approved); Moulin Rouge (1952, Approved); Funny Face (1957, Approved); A Clockwork Orange (1971, R); The Sound of Music (1965, G); Singin' in the Rain (1952, G); To Kill a Mockingbird (1962, Approved); 2001: A Space Odyssey (1968, G); Pink Floyd: Live at Pompeii (1972, G); Breathless (1960, Not Rated); Belarmino (1964, no rating); The Godfather (1972, R); Pierrot le fou (1965, PG-13); Trace of Stones (1966, no rating); La Dolce Vita (1960, TV-14); My Fair Lady (1964, G); Sabrina (1954, Approved); Play It Again, Sam (1972, PG); The Good, the Bad and the Ugly (1966, R); Jules and Jim (1962, Not Rated); A Woman Is a Woman (1961, Not Rated); Paris When It Sizzles (1964, Approved); Rebel Without a Cause (1955, PG-13)

## Walt: born 1950, Memphis, favorite Elvis Presley (window 1960–1980)

Seed: **Elvis Presley** `95593E4D-2CBE-44E5-BF82-F1E542B63A96`

| Call | Status | Results | Notes |
|---|---|---|---|
| artists | 200 | 25 | Roy Orbison, The Animals, Jerry Lee Lewis, Chuck Berry, The Mamas & the Papas, Buddy Holly, Creedence Clearwater Revival, The Rolling Stones |
| movies (year filter) | 200 | 25 | 25/25 in era |
| tv (year filter) | 200 | 25 | 25/25 in era |
| places, take 50 | 200 | 50 | 6 pass the landmark allowlist: Sun Studio (museum), Lorraine Motel (heritage_building), Stax Museum of American Soul Music (local_history_museum), Graceland (museum), National Civil Rights Museum (national_museum), Metal Museum (museum) |
| restaurants, take 50 | 200 | 50 | 13 list specialty dishes: The Pig On Beale (bbq_platter, smoked_chicken); Los Cabos Mexican Bar & Grill (arroz_con_pollo, chicken_fajitas); Imagine Vegan Cafe (bbq_beans, chicken_nuggets); Silky O'Sullivan's (one_dozen_oysters_on_half_shell, catfish); King Jerry Lawler's Hall of Fame Bar & Grille (1_2_rack_ribs) |

Movies: Let It Be (1970, G); Hitler: A Career (1977, Not Rated); Sunrise at Campobello (1960, Approved); The Jazz Singer (1980, PG); Imagine (1972, no rating); The Last Waltz (1978, PG); Conrack (1974, PG); Kramer vs. Kramer (1979, PG); Gypsy (1962, Approved); Fame (1980, R); The Paper Chase (1973, PG); The Buddy Holly Story (1978, PG); Belarmino (1964, no rating); Tender Is the Night (1962, Approved); AC/DC: Let There Be Rock (1980, PG); Lady Sings the Blues (1972, R); Save the Tiger (1973, R); Guess Who's Coming to Dinner (1967, Approved); The Agony and the Ecstasy (1965, Approved); A Poem Is a Naked Person (1974, Not Rated); Coal Miner's Daughter (1980, PG); Funny Girl (1968, G); Jesus Christ Superstar (1973, G); Elvis (1979, no rating); The Sound of Music (1965, G)

## June: born 1958, Los Angeles, favorite The Sound of Music (window 1968–1988)

Seed: **The Sound of Music** `5D54CE58-DC3E-4294-A359-581A9C072952`

| Call | Status | Results | Notes |
|---|---|---|---|
| artists | 200 | 25 | Bette Midler, Peter, Paul & Mary, Josh Groban, Barbra Streisand, Carole King, Elton John, Carly Simon, Johnny Mathis |
| movies (year filter) | 200 | 25 | 25/25 in era |
| tv (year filter) | 200 | 25 | 25/25 in era |
| places, take 50 | 200 | 50 | 7 pass the landmark allowlist: Walt Disney’s Carolwood Barn (rail_museum), Spadena House (historical_landmark), Natural History Museum of Los Angeles County (natural_history_museum), Hollywood Sign (historical_landmark), Los Angeles Live Steamers Railroad Museum (rail_museum), Upside Down House (museum), Madcap Motel (museum) |
| restaurants, take 50 | 200 | 50 | 13 list specialty dishes: VIVO Italian Kitchen (chicken_fettuccine_alfredo, lasagna); Krusty Burger (krusty_burger_fries_cheese, mother_nature_burger); In-N-Out Burger (cheeseburger_grilled_onions, hamburger_fries); Bubba Gump Shrimp Co. (chowder, fried_calamari); Buca di Beppo Italian Restaurant (bruschetta, caesar_salad) |

Movies: Annie (1982, PG); Fiddler on the Roof (1971, G); Oliver! (1968, G); Chitty Chitty Bang Bang (1968, G); Willy Wonka & the Chocolate Factory (1971, G); Cabaret (1972, PG); Grease (1978, PG); Funny Girl (1968, G); Hello, Dolly! (1969, G); Bedknobs and Broomsticks (1971, G); Terms of Endearment (1983, PG); Dirty Dancing (1987, PG-13); Out of Africa (1985, PG); Beaches (1988, PG-13); Romeo and Juliet (1968, PG); On Golden Pond (1981, PG); The Princess Bride (1987, PG); Kramer vs. Kramer (1979, PG); Pete's Dragon (1977, G); The Aristocats (1970, G); Darling Lili (1970, G); Victor/Victoria (1982, PG); Flashdance (1983, R); The Turning Point (1977, PG); Where Angels Go Trouble Follows! (1968, G)

## Modern-favorite hop: born 1942, favorite Taylor Swift (window 1952–1972)

Seed: **Taylor Swift**

- Music seeded by Taylor Swift directly: Carly Rae Jepsen, Demi Lovato, One Direction, Selena Gomez & the Scene, Katy Perry, Beyoncé, Bruno Mars, Jonas Brothers, Ariana Grande, P!nk
- Year-filtered films seeded by Taylor Swift: 25/25 in era. Top: Mary Poppins (1964)
- Music seeded by that top film: Randy Newman, Frank Sinatra, Don McLean, Elton John, Billy Joel, Carole King, Dean Martin, Neil Diamond, Harry Nilsson, Simon & Garfunkel

## Answers to task 2.0

1. **June landmark place:** yes, 7: Walt Disney’s Carolwood Barn, Spadena House, Natural History Museum of Los Angeles County, Hollywood Sign, Los Angeles Live Steamers Railroad Museum, Upside Down House, Madcap Motel.
2. **June specialty dish:** yes, from VIVO Italian Kitchen, Krusty Burger, In-N-Out Burger, Bubba Gump Shrimp Co., Buca di Beppo Italian Restaurant. Restaurant tag filter did **not** return only food places (check the table).
3. **Modern-favorite hop:** 25/25 films in era; top film Mary Poppins (1964).
4. **Charly for Rosa without the age signal:** **not returned.** Demo step 6 must use whichever title the trace excludes.

22 Qloo calls, 0 failed.
