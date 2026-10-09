# Phase 0 — Era-matching test results

**Date:** 2026-10-08 · **Verdict: GO.** Memory Lane is viable. No need for the Tenant Matcher fallback.

**Question:** given one remembered favorite, can Qloo return music, film/TV and places from the person's era and region?

**How:** [`scripts/phase0-era-test.mjs`](../scripts/phase0-era-test.mjs). Run with `node --env-file=.env.local scripts/phase0-era-test.mjs`.
For each fictional persona it looks up the favorite with `/search`, then calls `/v2/insights` with the favorite as `signal.interests.entities` and `signal.demographics.age=55_and_older`.
"Formative window" = ages 10–30 (birth year + 10 to + 30).

| Persona | Born | Hometown | Favorite | Window |
|---|---|---|---|---|
| Rosa | 1942 | Chicago | Frank Sinatra (artist) | 1952–1972 |
| Walt | 1950 | Memphis | Elvis Presley (artist) | 1960–1980 |
| June | 1958 | Los Angeles | The Sound of Music (movie) | 1968–1988 |

## Summary

| Persona | Artists | Movies, no year filter | Movies + `filter.release_year` | TV + `filter.release_year` | Places |
|---|---|---|---|---|---|
| Rosa | era-correct (9/10 by eye) | **0% in era** | 100% | 100% | weak (modern businesses) |
| Walt | era-correct (10/10 by eye) | **0% in era** | 100% | 100% | good (Graceland, Sun Studio) |
| June | era-correct (10/10 by eye) | 60% in era | 100% | 100% | weak (hotels, Starbucks) |

21 API calls, no failures except the planned control (see finding 4).

## Findings

1. **Music works from the favorite alone.** Sinatra → Louis Armstrong, Tony Bennett, Ella Fitzgerald, Nat King Cole, Peggy Lee. Elvis → Roy Orbison, Jerry Lee Lewis, Chuck Berry, Little Richard. Only miss: Harry Connick Jr. for Rosa. Important because `filter.release_year` does **not** work for artists. The favorite is our only era lever for music.
2. **Movies/TV need the year filter, every time.** Without it, Qloo returns what 55+ audiences watch *today* (*La La Land*, *Green Book*). With `filter.release_year.min/max` it's 100% in-era for all three.
3. **Results need a content-safety filter.** Unfiltered/filtered lists included explicit titles (a Rolling Stones documentary with an explicit name, *Last Tango in Paris*), a film about Alzheimer's (*Still Alice*) and distressing subjects (*Holocaust* miniseries). Qloo has no concept of "appropriate for a reminiscence session."
4. **A "no favorite" comparison isn't possible.** Qloo returns 400 `at least one valid signal or filter is required`. For the demo comparison use a modern favorite vs. an era favorite instead (e.g. Taylor Swift vs. Sinatra).
5. **Places are current businesses, not nostalgic places.** Rosa got Museum of Illusions and Benihana. June got hotels and Starbucks. Memphis worked because its landmarks are music history.
6. **Qloo's oldest age bucket is `55_and_older`**, so it can't tell a 1942 birth from a 1968 one. Birth year only matters through our year filters. Follow-up A/B test showed the age signal slightly modernizes artist picks, so we drop it (see D7 in approach.md).

## Full result lists

## Rosa — born 1942, Chicago, favorite: Frank Sinatra
Formative window: 1952–1972

Seed: **Frank Sinatra** `FC0F8D26-BA80-4D83-8BBF-FC011DC8D241`

### artists

- Louis Armstrong
- Tony Bennett
- Dean Martin
- Nat King Cole
- Peggy Lee
- Paul Anka
- Glenn Miller
- Harry Connick, Jr.
- Bobby Darin
- Ella Fitzgerald

### artists-NO-SEED
**FAILED 400** `/v2/insights?filter.type=urn%3Aentity%3Aartist&signal.demographics.age=55_and_older&take=10`
```
{"errors":[{"message":"at least one valid signal or filter is required for entity insights"}]}
```

### movies-unfiltered
Era score: 0% (0/10)

- Her (2013)
- Still Alice (2014)
- Youth (2015)
- The Danish Girl (2015)
- Wild (2014)
- La La Land (2016)
- Joy (2015)
- Moonrise Kingdom (2012)
- The Grand Budapest Hotel (2014)
- The Hundred-Foot Journey (2014)

### movies-yearfilter
Era score: 100% (10/10)

- There's No Business Like Show Business (1954)
- Designing Woman (1957)
- Last Tango in Paris (1972)
- All That Heaven Allows (1955)
- Sweet Charity (1969)
- Charly (1968)
- Guess Who's Coming to Dinner (1967)
- Play It Again, Sam (1972)
- Let's Make Love (1960)
- The Best of Everything (1959)

### tv-yearfilter
Era score: 100% (10/10)

- All in the Family (1971)
- Peyton Place (1964)
- Marcus Welby, M.D. (1969)
- Masterpiece (1971)
- It Takes a Thief (1968)
- Kung Fu (1972)
- Dark Shadows (1966)
- Route 66 (1960)
- The Virginian (1962)
- The Big Valley (1965)

### places

- Cloud Gate
- Museum of Illusions Chicago
- Benihana - Chicago (John Hancock)
- Giordano's
- Credit Union 1 Arena
- Maxwell Street Market
- Santa Baby Bar at Stolen Saddle
- National Museum of Mexican Art
- East Bank Club
- Carlucci Rosemont

## Walt — born 1950, Memphis, favorite: Elvis Presley
Formative window: 1960–1980

Seed: **Elvis Presley** `95593E4D-2CBE-44E5-BF82-F1E542B63A96`

### artists

- Roy Orbison
- Jerry Lee Lewis
- Chuck Berry
- The Animals
- Creedence Clearwater Revival
- Little Richard
- Nancy Sinatra
- The Turtles
- Bee Gees
- The Rolling Stones

### artists-NO-SEED
**FAILED 400** `/v2/insights?filter.type=urn%3Aentity%3Aartist&signal.demographics.age=55_and_older&take=10`
```
{"errors":[{"message":"at least one valid signal or filter is required for entity insights"}]}
```

### movies-unfiltered
Era score: 0% (0/10)

- Rocketman (2019)
- What Happened, Miss Simone? (2015)
- Quincy (2018)
- Green Book (2018)
- Pavarotti (2019)
- Lion (2016)
- Florence Foster Jenkins (2016)
- Amy (2015)
- Fences (2016)
- The Irishman (2019)

### movies-yearfilter
Era score: 100% (10/10)

- The Last Waltz (1978)
- Let It Be (1970)
- Kramer vs. Kramer (1979)
- Sunrise at Campobello (1960)
- Guess Who's Coming to Dinner (1967)
- The Buddy Holly Story (1978)
- The Paper Chase (1973)
- Imagine (1972)
- The Rolling Stones: Cocksucker Blues (1972)
- Tender Is the Night (1962)

### tv-yearfilter
Era score: 100% (10/10)

- Fantasy Island (1977)
- Dallas (1978)
- Masterpiece (1971)
- Kung Fu (1972)
- It Takes a Thief (1968)
- The Paper Chase (1978)
- Kojak (1973)
- Daniel Boone (1964)
- The Partridge Family (1970)
- Laverne & Shirley (1976)

### places

- Lorraine Motel
- Sun Studio
- King Jerry Lawler's Hall of Fame Bar & Grille
- Growlers
- Lamplighter Lounge
- The Arcade Restaurant
- Silky O'Sullivan's
- Graceland
- Blues City Cafe
- Rock N Roll Cafe

## June — born 1958, Los Angeles, favorite: The Sound of Music
Formative window: 1968–1988

Seed: **The Sound of Music** `5D54CE58-DC3E-4294-A359-581A9C072952`

### artists

- Bette Midler
- Johnny Mathis
- Carole King
- Peter, Paul & Mary
- Carly Simon
- Barry Manilow
- Barbra Streisand
- Neil Diamond
- Carpenters
- Elton John

### artists-NO-SEED
**FAILED 400** `/v2/insights?filter.type=urn%3Aentity%3Aartist&signal.demographics.age=55_and_older&take=10`
```
{"errors":[{"message":"at least one valid signal or filter is required for entity insights"}]}
```

### movies-unfiltered
Era score: 60% (6/10)

- Oliver! (1968)
- Annie (1982)
- Fiddler on the Roof (1971)
- Beauty and the Beast (1991)
- Out of Africa (1985)
- Driving Miss Daisy (1989)
- Terms of Endearment (1983)
- Guess Who's Coming to Dinner (1967)
- Kramer vs. Kramer (1979)
- State Fair (1962)

### movies-yearfilter
Era score: 100% (10/10)

- Oliver! (1968)
- Annie (1982)
- Fiddler on the Roof (1971)
- Out of Africa (1985)
- Terms of Endearment (1983)
- Kramer vs. Kramer (1979)
- Funny Girl (1968)
- The Goodbye Girl (1977)
- Funny Lady (1975)
- Coal Miner's Daughter (1980)

### tv-yearfilter
Era score: 100% (10/10)

- Masterpiece (1971)
- The Waltons (1972)
- The Paper Chase (1978)
- Shogun (1980)
- Roseanne (1988)
- Holocaust (1978)
- American Masters (1985)
- Rich Man, Poor Man (1976)
- The Brady Bunch (1969)
- A Town Like Alice (1981)

### places

- Revenge of the Mummy - The Ride
- Los Angeles Live Steamers Railroad Museum
- DoubleTree by Hilton Hotel Los Angeles Downtown
- Starbucks Coffee Company
- Hilton Garden Inn Los Angeles/Hollywood
- Angels Flight Railway
- ASU FIDM Museum
- Super Silly Fun Land
- Kendall's Brasserie
- Venice Pride Flag Lifeguard Tower
