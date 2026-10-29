# Sports Simulator

> An international football sim that lives in a small box in your VS Code sidebar. You pick a country and where it starts, and it plays every match, table, cup and season on its own while you code.

**Status legend**

- 🟢 **NOW**: part of version 1. Build this.
- 🔵 **LATER**: agreed for a future version. Don't build yet.
- ⚪ **IDEA**: worth considering, not committed.
- ❓ **TO CONFIRM**: proposed, awaiting a decision.

---

## 1. Vision

Football management with almost nothing to manage. Your only decisions are:

1. **Which country you are, and which league it starts in:** any of FIFA's ~210 nations, in League 1 to 5 (its usual level by default), starting mid-table
2. **How long a match lasts:** 30 seconds, 2 or 5 real minutes
3. **Where to focus each summer:** attack, defence or balanced

Everything else runs by itself: fixtures, matches, commentary, tables, scorers, play-offs, promotion and relegation, the Nations Cup and the World Championship, and the other 99 nations rising and falling. You glance at it between tasks, react at the end of each season, and build a club history worth keeping.

### Design principles

- **Realistic.** League sizes, promotion rules, results and club movement should feel like real football.
- **Glanceable, not demanding.** It should never need attention mid-match.
- **One meaningful decision per season.** Point allocation is the whole game, so it has to matter.
- **History is the reward.** Trophies, records and club history are why people keep it installed.
- **Nothing happens while you're away.** Closing VS Code pauses everything.
- **Near-zero resource use.** It must never slow the editor.
- **Small and finishable.** New ideas go to 🔵 LATER, not into version 1.

---

## 2. Core game loop 🟢 NOW

```
New career
  └─ choose a league (1–5) → you start mid-table: rated band minimum + 10, expected 10th
  └─ choose difficulty (easy / medium / hard)
  └─ choose match duration, optionally lean attacking or defensive
        │
        ▼
Season (runs automatically, 38 matchdays)
  └─ matchday → all 50 matches across 5 leagues play at the same time
  └─ your match shown live: score + commentary feed
  └─ full-time overlay in the sidebar box (fades after 5s) → next matchday
        │
        ▼
Play-offs (if you finished 3rd–6th)
        │
        ▼
End of season
  └─ final table, promotion / relegation
  └─ season report (what went well, what didn't)
  └─ decline applied to every club
  └─ choose a summer focus: attack · balanced · defence
  └─ trophies & records updated
        │
        ▼
Next season … (won league 1? → carry on, or start a new career)
```

---

## 3. Setup 🟢 NOW

| Option | Values | Notes |
|---|---|---|
| League | 1–5 (buttons) | Where you start. Your rating is random within the league, weighted to mid-table: 50% chance of 40–60% of the way up the league's band, 25% of 20–40%, 25% of 60–80% (never the very top or bottom). Not shown; you find out from the table |
| Difficulty | Easy / Medium / Hard | *A helpful boost each season* · *A subtle boost each season* · *No extra season boost*: Easy +10, Medium +5, Hard 0 (§7) |
| Style | Attacking · Balanced · Defensive | Attacking starts attack 5 above the rating and defence 5 below (within the free lean); defensive the reverse |
| Match duration | 30 sec · 2 min · 5 min | Length of one 90-minute match; can be changed any time from the ⏱ button in the box. Default 2 min |
| Country | Search box over every nation: the 16 biggest first, then A–Z | Sets the league picker to its usual level (marked *Usual*); any league can be picked, but only once a country is chosen. Preselected from VS Code's display language when it points to one country (German → Germany; plain English doesn't). See §10 |

### Starting position

The engine still takes a rating from 0 to 99 (balance tool and tests use the full range). The setup screen offers only the five mid-table starts.

---|---|---|
| Bottom quarter | "Relegation battle — League N" | 80–84 |
| Lower-middle | "Lower half — League N" | 85–89 |
| Upper-middle | "Upper half — League N" | 90–94 |
| Top quarter | "Title contender — League N" | 95–99 |

Examples: **85** → *"Lower half — League 1"* · **14** → *"Upper half — League 5"* · **99** → *"Title contender — League 1"* (strongest club in the game at the start).

---

## 4. Team model 🟢 NOW

Each club has two stats, each **0–99**:

| Stat | Effect in matches |
|---|---|
| **Attack** | How often the team creates and scores chances |
| **Defence** | How well it stops the opponent's chances |

**Team rating = average of attack and defence.** This is what places a club within the rating bands (§6). Chemistry was removed in M8: two stats make the season's decision simple (score more, or concede less?) and readable from the season report.

**Leaning is a choice, up to a point.** Attack 60 / defence 40 scores more and concedes more than 50 / 50; that's a style, not a mistake. But each stat can sit up to **5** from the rating for free (a gap of 10). Beyond that the weak side is exploited: every extra point costs 2 effective attack *and* defence. So when the decline drains one side (§7), fixing it is worth much more than spreading points evenly.

AI clubs have a "style", a fixed **shape** around their rating: attacking clubs are +10 attack / −10 defence, defensive clubs the reverse. Both shapes sit 5 beyond the free lean, so AI clubs of the same rating are equally strong but play differently, and they never fix their weak side: that's the edge a player who reads the season report has over them.

Players are generated (names, positions, shirt numbers). They're flavour only: they score goals, get cards and appear in commentary and records. There is no squad management.

🔵 LATER: players age and retire, youth players come through, star transfers.

---

## 5. Match engine 🟢 NOW

All matches on a matchday are simulated minute by minute at the same time. Only your match is shown live; other scores update in the tables.

**Starting model (to be tuned):**

- Each team's **effective** attack and defence:
  `effAttack = attack − weakness`, `effDefence = defence − weakness`,
  where `weakness = 2 × max(0, |attack − defence| / 2 − 5)`
- Each team's expected goals per match:
  `xG = 1.13 × e^(0.25 × (effAttack − opponentEffDefence) / 10)` × home 1.14 / away 0.90 (tuned from 1.35 so the average is 2.7 once added time is included)
- Per-minute scoring chance = `xG / 90`, slightly weighted towards late in the game
- **Form on the day:** each match, each team's goal rate is multiplied by a random 0.8–1.2, so upsets happen.
- **Events:** goals (scorer + minute, weighted towards attackers), yellow cards, occasional red cards (the team plays the rest of the match weakened), stoppage-time goals
- **Play-off final:** extra time and penalties if level
- All randomness comes from a **seeded random number generator**, so results can be reproduced for testing

**Realism targets** (checked by the balance tool, §13):
- Results look like real football: home win ~45%, draw ~25%, away win ~30%
- Scores look like real football: about 2.7 goals per match on average, mostly 0–3 per team, the odd 5–1
- Upsets happen: the weaker team wins a fair share of matches
- Late goals and comebacks happen regularly

---

## 6. Leagues, promotion & relegation 🟢 NOW

- **5 leagues × 20 nations = 100 teams.** "Club" in the code means any team. No club is ever rated 100; ratings run 0–99. 38 matchdays per season (home and away). A season takes about 25 minutes (30s matches), 40 minutes (1 min), 80 minutes (2 min) or 3+ hours (5 min) of coding time.
- Rankings: points (3 win, 1 draw), then goal difference, then goals scored.

**Movement between leagues (same at every boundary):**

| Position | Outcome |
|---|---|
| 1st–2nd | Automatic promotion |
| 3rd–6th | Play-offs: semi-finals 3v6 and 4v5 (two legs), one-off final at a neutral venue. Winner promoted |
| 18th–20th | Relegated |

That's 3 up and 3 down at each boundary. League 1 has no promotion (1st is champion); league 5 has no relegation.

### Rating bands

| League | Rating band | Band average |
|---|---|---|
| League 1 | 80–99 | ~90 |
| League 2 | 60–79 | ~70 |
| League 3 | 40–59 | ~50 |
| League 4 | 20–39 | ~30 |
| League 5 | 0–19 | ~10 |

### Starting world

At the start of every career, **each rating from 0 to 99 is used exactly once**:

1. The player's nation takes a random mid-table rating in the league they picked (§3).
2. The other 99 nations keep the **world order** (§10), strongest first, and take the remaining ratings in that order, **shuffled within starting pots**:

| World order | Pot | Can start in |
|---|---|---|
| 1–8, 9–16 | two pots of 8 | League 1 |
| **17–24** | swing pot | **League 1 or 2** |
| 25–36 | core | League 2 |
| **37–44** | swing pot | **League 2 or 3** |
| 45–56 | core | League 3 |
| **57–64** | swing pot | **League 3 or 4** |
| 65–76 | core | League 4 |
| **77–84** | swing pot | **League 4 or 5** |
| 85–92, 93–100 | two pots of 8 | League 5 |

3. Nations are placed into leagues by rating: the top 20 in League 1, and so on.

So each league starts with exactly one team on each rating in its band, big nations are always near the top, and who starts as favourite changes every career. If the player starts England in League 5, everyone below England moves up a place to fill the gap. A nation from outside the world order takes the place of the 100th.

The overall average starts at **49.5** and stays there every season (§7). After the first season, ratings move freely and are no longer unique.

The bands make movement feel real:
- A league 5 club on 14 needs to get up to about 20 to challenge for promotion.
- A league 4 club slipping below 20 is in a relegation fight.
- A promoted club arrives near the bottom of its new league (the top of L2 ≈ 79 ≈ the bottom of L1), as in real life.

### Cups 🟢 NOW

Cups never change ratings: only league finishes feed the summer (§7). They bring trophies, records and stories. Each has its own place in the **Cups** tab, viewable whether or not you're in it, with the draw, results, groups and past winners.

**Nations Cup, every season.** The top 64 of last season's final standings (season 1: the starting order).
- An open draw every round: anyone can meet anyone, so England could draw France in the round of 64. Whoever comes out first is at home.
- Every round is one match, extra time and penalties if level; the final at a neutral ground. One-off ties give smaller nations a real chance, and two legs added clutter without adding drama.
- A tie settled by extra time or penalties names its winner (*Brazil win 3–1 on penalties*).
- Six cup matchdays sit between league rounds (after matchdays 6, 12, 18, 24, 30 and 36), so the final comes before the last two league rounds.

**World Championship, every fourth summer** (seasons 4, 8, 12…), after the play-offs and before the summer decision.
- Leagues 1 and 2 of the season just finished (40 nations), seeded by final position into five pots of 8. Each of 8 groups of 5 takes one nation from each pot, so the top 8 are always apart.
- Groups play once each (5 matchdays, one team resting each time) at neutral venues; points, goal difference, goals scored.
- The top two in each group go through. Round of 16: A1 v B2, C1 v D2, E1 v F2, G1 v H2, then B1 v A2, D1 v C2, F1 v E2, H1 v G2, so teams from the same group can only meet again in the final. One-off neutral matches to the final.
- The last edition stays in the Cups tab until the next.

---

## 7. Progression, decline & balance 🟢 NOW

### Every club, every season

1. **Decline:** every club, including yours, loses **10** rating (ageing, players leaving), which is **20 stat points**, at the end of the season. For your club it lands **unevenly and randomly** between attack and defence (a key striker leaves, the defence ages): typically something like attack −14 / defence −6, sometimes more lopsided. **You're never told the split.** You see only the overall drop, and your attack and defence numbers are hidden once the career starts. You work it out from results: if you put 5 into each for several seasons while the drain keeps hitting attack, your team scores less and less, and the goals column tells you.
2. **Gains:** clubs regain rating based on **how they finished compared with what was expected**. The average gain is **+10**.
3. **Ratings carry forward** into the next season for every club, so clubs rise and fall over the years like real life.

### Expected position

At the start of each season, every league's 20 clubs are ranked by rating. That rank is each club's **expected position**: the highest-rated club is expected to finish 1st, the lowest 20th. Ranks are recalculated each season, so a newly promoted club is usually expected near the bottom of its new league, and a relegated club near the top of its new one.

### Performance gain (all clubs, including yours)

```
performance = expectedPosition − actualPosition     (positive = did better than expected)

gain = 10
     + 1.0 × performance     same multiplier up and down, for every club
     ± top/bottom bonus      1st +6 · 2nd +4 · 3rd +2   ·   18th −2 · 19th −4 · 20th −6
                              (none for League 1's top 3 or League 5's bottom 3)
     + noise                  AI clubs only: small random variation
     × plateau                gains shrink as rating approaches 99
```

Because clubs in a league are spread about one rating point per table position, the rule reads simply:

> **Every place you finish above expectation = +1 rating. Every place below = −1.**

The multiplier is **the same up and down**, so luck cancels out over several seasons: lucky and unlucky years even out, and only real over-performance builds up.

Examples (at the start of a career, when each rating is used exactly once):

| Club | Expected | Finished | Performance | Net change |
|---|---|---|---|---|
| Rating 99 (League 1) | 1st | 10th | −9 | **−9** |
| Rating 90 (League 1) | 10th | 12th | −2 | **−2** |
| Rating 9 (League 5) | 11th | 8th | +3 | **+3** |
| Rating 0 (League 5) | 20th | 10th | +10 | **+10** |
| Rating 99 (League 1) | 1st | 1st | 0 | **0** |

**Why this works well:**
- **It balances itself.** In any league, the expected and actual positions are both 1–20, so the performance scores always add up to zero.
- **It's a natural rubber band.** An over-achiever rises, then is expected to do better next season, so it has to keep over-achieving to keep rising. No club runs away.
- **The top is hard to hold.** A club expected to win can't over-achieve, so winning only maintains its rating, and any slip costs it.
- **Finishing where expected means standing still.** Progress comes from beating expectations.

### Where the player's skill comes in

Your one decision is **how to split your gain** between attack and defence (AI clubs keep their style's shape). The split matters because the decline drains one side more than the other, and a side that falls too far behind gets exploited (§4): if you conceded lots, defence points help far more than an even spread.

Worked example: a club starting at 0 whose good allocation is worth about 5 places a season.

| Season | League | Expected | Finish | Change | Rating |
|---|---|---|---|---|---|
| 1 | L5 | 20th | 15th | +5 | 5 |
| 2 | L5 | ~16th | ~11th | +5 | 10 |
| 3 | L5 | ~11th | ~6th | +5 | 15 |
| 4 | L5 | ~5th | 2nd ✅ promoted | +3 +4 bonus | 22 |
| 5 | L4 | 20th | 15th | +5 | 27 |

About **3–4 seasons per league** before the difficulty boost below; see the estimates table for each difficulty.

### Difficulty: a hidden boost 🟢 NOW

Each season your club gets an extra boost, **paid for by every AI club losing a tiny hidden amount**, so the total rating in the game never changes:

| Difficulty | Your boost per season | Each of the 99 AI clubs loses |
|---|---|---|
| Easy | +10 | ~0.10 |
| Medium | +5 | ~0.05 |
| Hard | 0 | 0 |

- Ratings are stored with decimals but **shown as whole numbers**, so the AI drain is invisible.
- If your club is capped at 99, the unused boost is not taken from the AI clubs.

### Top / bottom bonus

Based on **finishing position**, not on promotion itself (so a play-off winner who finished 5th gets no bonus):

| Position | Bonus |
|---|---|
| 1st | +6 |
| 2nd | +4 |
| 3rd | +2 |
| 18th | −2 |
| 19th | −4 |
| 20th | −6 |

League 1's top 3 get nothing (there's nowhere higher to go), and League 5's bottom 3 lose nothing. That still balances: League 1 gives out −12 at the bottom, League 5 gives out +12 at the top, and Leagues 2–4 cancel internally, so the total across the game is always zero.

### Rough time from 0 to 99

Estimates, to be confirmed by the balance tool. "Smart" = good allocation worth about 5 places a season; "average" = even split, no real edge. The last few points to 99 are the slowest, because once you're the highest-rated club you're expected to win and can't beat expectations.

**Measured by the balance tool (M8, two-stat model)**, 4 careers each, from rating 0:

| Difficulty | Smart (fixes the drained side) | Even split | Careless |
|---|---|---|---|
| Easy (+10) | 6–7 seasons | 6–8 seasons | — |
| Medium (+5) | 7–10 seasons | 9–35 seasons | — |
| Hard (no boost) | mostly never (one of four careers: 62 seasons) | never | never |

Reading the season report is worth about **+3 places a season** from low starts, tapering to ~0 near the top (you can't beat "expected 1st"); about +1.4 on average. Even split roughly holds (+0.1); careless sinks (−4). 25 of 26 balance targets met; the miss is the original "+4–6 places" guess for smart play, which match luck caps.

At 1-minute matches (a season ≈ 40 minutes), a smart medium climb is about **5–6 hours**.

Note: on **easy**, a smart player is often promoted every season, and even an average player climbs steadily. Easy is for people who want to reach the top quickly; medium and hard keep the "sit in a league for a few seasons" feel.

### Keeping the total constant

Total rating across all 100 clubs is **fixed**: the overall average stays **exactly 49.5** every season.

- Performance scores already sum to zero within each league.
- Top/bottom bonuses always add up to zero across the game (§7, top / bottom bonus).
- **Everything else** (plateau, caps at 0 and 99, AI noise, band pull, the difficulty boost) is balanced by a final **normalisation step**: the leftover amount is spread across the AI clubs as a tiny adjustment.
- The player's club is never normalised, so its rating depends only on results and difficulty.

### Extra AI-only adjustments

- **Band pull:** if an AI club drifts outside its current league's band, 80% of the gap is closed each season. This stops bottlenecks, e.g. league 2 filling with 80+ clubs while league 1 has clubs below 80.
- **Ceiling:** an AI club above 93 loses 70% of the excess each season (its stars get poached), so the top never fills with super-clubs. Without it, rank-based expectation can't touch a club far ahead of the rest.
- **Style shape:** after its gain, an AI club's stats are rebuilt in its style's shape (§4).
- **Promotion investment:** an AI club gains **+4** rating when promoted, so promoted sides can compete. Tuned so about 80% of promoted clubs finish in the bottom half of their new league (Premier League, last decade: about 78%).
- **Small random variation** each season, so AI clubs don't move mechanically.

Your gain becomes points (2 points = +1 rating, 1 point = +1 to a stat), spent by your summer focus: 70/30 towards attack or defence, or 50/50. Nothing goes above 99. 70/30 rather than 75/25 because one season of goals is a noisy read: at 75/25 a misread swung the balance so far that reading results stopped paying (balance tool, M8).

All numbers here (multiplier 1.0, bonuses, boosts) are starting values, tuned with the balance tool.

### Tuning targets (checked by the balance tool)

- The overall average stays at 49.5 after 100+ simulated seasons
- No league's average drifts more than ±3 from its band average
- Fewer than 2 clubs above 95 at any time; none at 99 for long
- Promoted clubs finish in the bottom half of their new league about 70% of the time
- The total rating across all clubs is identical (to 2 decimal places) before and after every season
- A **smart** simulated player (fixes weaknesses) gains about 4–6 places a season over expectation; an **even-split** player roughly holds position; a **careless** player sinks
- 0→99 timings roughly match the estimates table for each difficulty; a careless player on hard can never climb from 0 to 99
- A player club starting at 99 wins league 1 most seasons, but not every season

---

## 8. Interface 🟢 NOW

### Sidebar box (Explorer view, bottom-left by default)

- **Header:** club name, league, position, form (last 5 results as W/D/L dots), ▶/⏸ button
- **Team tab:** rating, this season's goals scored and conceded against the league average (the only clue to the drain), rival, trophies, records, history
- **Live match:** scoreboard (crests, score, clock) and a match report like a real game summary: goals prominent, cards small and greyed, half-time and full-time markers, newest first. No running commentary
- **Tabs:** Match · Table · Fixtures · Cups · Team (stats, trophies, history)
- **Cups tab:** a two-line status naming your next tie and when it's played (*Still in · Round of 32 v Brazil (away)* / *After matchday 12*), your run once it's more than one tie, the latest round in full, earlier rounds and finished groups folded away, past winners
- **Fixtures:** one short label per matchday (*MD 7*, *C32*, *WCQF*, *PO SF1*), full name on hover; cup rows marked with an accent edge and listed as soon as they're drawn
- **History:** one row a season, with the cup runs on one short line (*Cup: R64 · WC: Groups*)
- **Table:** promotion, play-off and relegation places highlighted
- **Rival:** your nation's real rival for the whole career (§10), shown on the Team tab with where it is now and your all-time record against it (*England · League 1, 5th · Played 6 · W3 D1 L2*), and marked ⚔ in the table

### Status bar

`⚽ ASH 2–1 HOL 67'`, which you can click to open the sidebar box.

### Full-time overlay

For your club's matches only. A result card **slides over the sidebar box itself** (not a VS Code notification), stays for **5 seconds** (3 seconds at 30s matches), then fades and the next matchday starts. No click needed.

> **FT: Ashminster City 2–1 AFC Holtbury**
> Okafor 23', Lind 67' · Marsh 81'

- Nothing appears over your code or in VS Code's notification list, so it never interrupts work.
- If the sidebar box is hidden or collapsed, the result shows in the **status bar** instead (`⚽ FT ASH 2–1 HOL`) until the next match kicks off.

### Pause / play

- ▶/⏸ button in the sidebar box (plus a command)
- **Closing VS Code pauses automatically.** On reopen, the game continues from the exact minute it stopped. Nothing is simulated while closed.

### End-of-season screen

This is the **only thing in Sports Simulator that asks for your attention**, because it needs a decision.

- When the season ends (after the play-offs), **the game waits**. Nothing continues until you've allocated your points.
- The end-of-season screen opens **inside the Sports Simulator box**.
- If the box is hidden or collapsed, **one VS Code notification** appears with the result and the clue, e.g. *"Season 4 over: 3rd in League 4. Scored 52, conceded 61 (league average 48). Where to focus this summer?"*, and buttons **Focus attack · Balanced · Focus defence · Open**. This is the only VS Code notification Sports Simulator ever shows.
- The status bar shows `⚽ Season over — allocate points` until you do.

Screen contents:

1. Final table with promotion, play-offs and relegation
2. **Season report:** goals scored and conceded against the league average, goals a game in your matches against the league's, best and worst runs, top scorer. No verdict: reading it is the player's job (lots of goals at both ends = leaning attacking).
3. Decline: the overall rating drop only (e.g. 55 → 45), never the attack/defence split
4. Summer focus: three buttons (**Focus attack · Balanced · Focus defence**). Focus puts 70% of the points into that side and 30% into the other; Balanced splits 50/50. Picking one highlights it; a separate **Start next season** button below confirms it

### Copy summary button

`Season 7 · Champions, League 3 · 26W 7D 5L · Promoted 🏆`

---

## 9. History & records 🟢 NOW

**This is key for long-term retention.**

- **Trophy cabinet:** league titles, promotions, play-off wins
- **Club history:** every season's league, position, points, goals, top scorer
- **Records:** biggest win, heaviest defeat, longest unbeaten run, longest winning run, most goals in a season, all-time top scorer
- **Manager career:** seasons played, matches, win %, titles

### After winning league 1

- **Carry on.** Defend the title, chase an unbeaten season, build a dynasty.
- **New career.** Start again with any starting rating. The previous career is archived.

---

## 10. Nations 🟢 NOW

The game uses real nations, not clubs: country names, flags and colours are free to use, and everyone can follow how teams they know are doing. In the game: no federation crests, nicknames or competition names (no "World Cup" or "FIFA"), and no real players.

- **Playable nations:** FIFA's members (~210), leaving out any currently banned from international football (Russia). Following FIFA's list keeps the choice neutral: Kosovo, Palestine and Chinese Taipei are in because FIFA has them; England, Scotland, Wales and Northern Ireland are separate.
- **World order:** the 100 nations in the world, ordered by hand on football standing: titles and history, consistency over the last decade, and current form. It is checked against the world ranking but not copied from it, so Italy and Germany stay high through a bad spell and a short hot streak doesn't lift a minnow. Reviewed against the ranking of 7 October 2026. The list is `WORLD_ORDER` in `src/sports/football/data/nations.ts`.
- **Badges:** two or three flag colours in diagonal bands (France, Italy, Germany… get three). The first colour tints the header, so it is never black or white.
- **Rivals:** every nation has one real rival (`RIVALS` in `nations.ts`): Argentina–Brazil, Greece–Turkey, Honduras–El Salvador. Rivalries can be one-way: Scotland, Wales and Ireland all have England; England has Germany. If the rival isn't among the 100 in the world, the nearest nation that is (by capital, on the same continent where possible) stands in: Fiji gets New Zealand, Ethiopia gets Egypt.
- **Codes and short names:** three-letter codes (BRA, ENG, JPN); long names have a short form for narrow spaces (*Bosnia*, *N. Ireland*, *USA*).
- **Players:** generated everyday names from the nation's region, about 40 pools (English, Scottish, Latin American, West African, Japanese, Arabic…). Some nations mix in a second pool for about a quarter of the squad (France, England, Netherlands…). Surnames don't repeat in a squad until a pool runs out, as with Kims and Nguyens. Name combinations that would produce famous real players are left out of the pools.

---

## 11. Settings 🟢 NOW

- Match duration (30 seconds / 2 / 5 minutes), also switchable from the ⏱ button in the box
- Full-time overlay on/off
- Status bar score on/off
- Reset career (with confirmation)

---

## 12. Technical design 🟢 NOW

| Area | Choice |
|---|---|
| Language | TypeScript |
| Build | esbuild (one bundle for the extension, one for the webview) |
| Tests | Vitest |
| Engine | **Pure, deterministic module** with no VS Code imports: `state + seed → next state`. Unit-testable and runnable headless |
| Multi-sport ready | Engine split into a **shared league core** (leagues, fixtures, tables, ratings, promotion, career) and a **sport module** (match simulation, commentary, scoring rules). Version 1 ships football only |
| Where it runs | **Extension host** runs the game clock and engine (so the game and status bar keep running even when the sidebar is collapsed). The webview only *displays* state it receives |
| UI | `WebviewViewProvider` registered in the Explorer; plain HTML/CSS with a small amount of TypeScript; uses VS Code theme colours for light and dark themes |
| Saving | `context.globalState` (the career follows you across all projects); saved at every goal, full-time and season end, and when VS Code closes |
| Performance | One tick per match-minute for all 50 matches (at most a few per second), no animation loop, idle when paused |

### Proposed structure

```
src/
  core/            shared, sport-agnostic, no VS Code imports
    rng.ts         seeded random numbers
    league.ts      fixtures, tables, play-offs, promotion/relegation
    ratings.ts     decline, expected position, performance gains, band pull, normalisation
    career.ts      player club, starting rating, points
    records.ts     trophies, history, records
  sports/
    football/
      match.ts     minute-by-minute match simulation
      commentary.ts
      names.ts     club/town/player names + blocklist
  extension/       VS Code wiring
    extension.ts   activation, commands, game clock
    sidebar.ts     webview view provider
    statusBar.ts
    storage.ts
  webview/         UI shown in the sidebar
tools/
  balance.ts       headless: simulates hundreds of seasons, reports against §5 and §7 targets
test/
```

---

## 13. Build plan 🟢 NOW

Each milestone finishes in a working state.

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold | Extension loads in VS Code; empty box appears in the Explorer |
| **M1** | Match engine | One match simulates with goals, cards and scorers; unit tests pass |
| **M2** | League & ratings | Full seasons for 100 clubs with tables, play-offs, promotion/relegation, decline and gains; all headless |
| **M3** | Balance tool | `tools/balance.ts` meets the realism targets (§5) and rating targets (§7) over 100+ seasons, for player clubs starting at a range of ratings |
| **M4** | Club names | 100 curated fictional clubs, checked against real club lists; generator + blocklist |
| **M5** | Live sidebar | Setup screen (rating slider + live label), live match + commentary, tables, fixtures, pause/play, status bar, saving |
| **M6** | Season loop UI | Play-offs, end-of-season screen, season report, decline, point allocation |
| **M7** | Polish | Full-time overlay, form dots, rival/derby, trophy cabinet, history, records, copy summary, settings |
| **M8** | Personal trial | Use it daily for two weeks; fix what's boring, annoying or unrealistic |
| **M8b** | Nations and cups | Real nations replace fictional clubs; Nations Cup and World Championship (§6, §10) |

**M8 progress (29 Oct 2026):** trial under way and going well. Done so far: two-stat model and summer focus, league picker, no rating numbers, badge colour picker, responsive box (header-only at its narrowest), Start next season button, games played in the header, and a visual pass (live table arrows, goal flash, sticky header, fixtures scroll, form tooltips). Marketplace groundwork: icon, README with screenshots and how to play, `vsce package` works (61 KB). MIT licence chosen and added.

**M8b (29 Oct 2026):** decided during the trial, before publishing: clubs became nations (relatable everywhere, and players can follow teams they know) and both cups were added.

**Before publishing (M9):** done: GitHub repo renamed to `sports-simulator`; Marketplace publisher **bigdevgreg** created and set in package.json; cleaned history force-pushed and the backup branch deleted. Still to do: try the nations and cups build (fn+F5); make the GitHub repo public (README screenshots load from it); bump the version; `npx @vscode/vsce package` and upload the `.vsix` by hand at marketplace.visualstudio.com/manage (no Azure DevOps token needed). Updates: bump the version, package, upload with **Update**.

---

## 14. Later 🔵

In rough priority order:

1. **Continental championships:** in the years between World Championships, by confederation
2. **Player lifecycle:** ageing, retirement, youth players (still automatic)
3. **Other sports in the same extension** (after football is finished): sport choice at setup, separate career per sport, keywords for each sport so it shows up in search
   - **Rugby union:** bonus points, tries/conversions/penalties commentary
   - **Cricket:** most different (formats, overs, innings, draws in multi-day games); highest effort
4. **Hall of Fame:** archive of past careers

## 15. Ideas ⚪

- Weather and pitch conditions affecting matches
- Mid-season transfer window with a small point top-up
- Manager reputation / sacking (optional "hardcore" toggle)
- Season-end awards (player of the season, golden boot)
- Multiple careers in parallel (per project)

## 16. Decisions log

| Decision | Reason |
|---|---|
| Only three stats, no squad management | Keeps it glanceable; the point allocation *is* the game |
| 5 leagues × 20 clubs | Realistic league sizes |
| Top 2 up, play-offs 3rd–6th, bottom 3 down | Mirrors real English football |
| Rating bands of 20 per league, global average fixed at 49.5 | Simple, predictable balance; promoted clubs naturally land near the bottom |
| Gains normalised to equal decline | Average guaranteed to stay at 49.5; no inflation |
| Starting ratings 0–99 each used once, AI ratings shuffled | Even spread in every league, no club on 100, and a different world every career |
| Band pull for AI clubs | Prevents league bottlenecks |
| Gains based on finish compared with expected position (rating rank in league) | Over-achievers rewarded, under-achievers punished; self-balancing; the top is hard to hold |
| No band pull for the player's club | Climbing has to be earned; several seasons per league |
| ~~Starting rating 0–99 replaces league choice~~ (reversed in M8: league picker) | One simple choice; players pick their own challenge, from "win every week" to "rise from nothing" |
| Same decline (−10) for the player as for AI clubs | Everyone plays by the same rules |
| Performance multiplier 1.0, equal up and down | Each place above/below expectation = ±1 rating; luck cancels out over time |
| Difficulty = hidden player boost (Easy +10 / Medium +5 / Hard +2) paid for by tiny AI drain | A full 0→99 climb can be quick or a grind; total rating unchanged |
| Staggered top/bottom bonus: +6/+4/+2 and −2/−4/−6, none for L1 top 3 or L5 bottom 3 | Rewards finishing higher; always sums to zero |
| Total rating fixed; normalisation across AI clubs | Average stays 49.5 forever; no inflation |
| Renamed from Sideline to Sports Simulator | *Sideline - Live Sports Scores* already exists on the Marketplace; the plain name says what it is |
| Football first; other sports only after it's finished | Keeps version 1 small |
| Unbeaten-run tracker in status bar: **rejected** | Unnecessary; records page covers it |
| League picker with a random, mid-weighted start instead of a 0–99 rating | Simpler: choose where to start, not a number; a little uncertainty about how good you are |
| No rating numbers shown to players (M8) | Players have no context for a 0–99 rating. The game shows expected finish, results and plain-English summaries; ratings, points and boosts stay internal |
| Hard has no boost | Matches its description; reaching 99 from the bottom becomes a near-impossible grind, and that's the point of Hard |
| Match lengths 30s · 2 min · 5 min | Three clearly different paces; 1 minute dropped |
| Pause when VS Code closes | You never miss matches; no catch-up simulation |
| Fictional club names only, checked against real club lists | Avoid trademark issues; renaming handled locally later |
| Engine runs in extension host | Game and status bar keep running without the sidebar open |
| End of season is the only VS Code notification; the game waits for your allocation | It's the one moment that needs a decision; everything else stays in the box |
| Full-time result as an overlay inside the sidebar box, not a VS Code notification | Never covers code or clutters notifications; status bar covers the hidden case |
| Sport-agnostic core + sport modules | Rugby/cricket can be added later without a rewrite |
| One extension for all sports (later) | One codebase; keywords handle discovery |
| Two stats (attack, defence); chemistry removed (M8) | A simple, readable decision: score more or concede less, judged from the season report. M3 had shown chemistry either did nothing or needed a complicated model to matter |
| Free lean of ±5, then the weak side is exploited | Leaning is a real style choice, but a side drained too far needs fixing; without it attack and defence are interchangeable and the split doesn't matter |
| Uneven, random decline between attack and defence | Creates something to read and fix each season; tuned so ignoring it (even split) roughly holds and fixing it climbs |
| Summer focus (attack · balanced · defence, 70/30) instead of assigning points | One simple decision that matches what a player can know with hidden stats; exact points were false precision |
| The drain's split and the attack/defence numbers are hidden | The decision should come from reading results (goals for and against), not from a number telling you what to fix |
| AI clubs keep a fixed style shape, 5 beyond the free lean | AI stats otherwise drifted apart every season, widening gaps within leagues (too many thrashings); a fixed shape keeps AI equally strong for their rating |
| AI ceiling above 93 | Rank-based expectation can't pull back a club far ahead of the rest; without it 4–6 AI clubs sat above 95 |
| AI promotion investment (+4) | Promoted clubs finished in the bottom half 91% of the time against ~78% in the real Premier League |
| M8 visuals: match report newest-first, compact scoreboard, own league marked on table chips, legend shows only that table's zones (Champions in L1) | Latest event always in view; the box often lives in a small corner of the screen; clear which league is yours |
| Badge colours picked at setup: 6 main × 6 second; the second row only shows colours that go with the main (from a pool of 9), so nothing is ever greyed out | Players own their club's look; a fixed palette keeps every badge readable, and the main colour (used for the header tint) excludes black and white so it shows on any theme |
| Responsive box (CSS only): ≤250px wide drops table W/D/L, towns and running scores, speed button shows just ⏱; ≤200px wide shows only the header (club, badge, league, position, form, ⏱ and pause), except while a summer choice waits; short (≤420px / ≤260px) tightens spacing and puts the scoreboard on one line | Many players keep it in a small corner; at its narrowest it's a status card, widen it to manage |
| Summer focus is picked, then confirmed with a separate "Start next season" button | Picking straight into the next season felt abrupt; players can change their mind and read the report first |
| Live table shows ▲▼ for places moved since kick-off instead of a dot on every playing club | Every club plays at once, so dots said nothing; movement is what makes a live table interesting |
| Derby markers removed (rival still on the Club tab) | Hardly noticed in play; one less thing on screen |
| Goal flash: scoreboard and header flash green when you score, red when you concede | Catches the eye when the box sits in a corner |
| Sticky header; fixtures open at the current match; played fixtures faded; form dots show the result on hover | Smoother to use as the season gets long |
| Summer explanation behind "How does summer work?"; Club tab hides records that don't exist yet | Keeps the choice and its button in view; no columns of dashes |
| MIT licence | Permissive and the norm for VS Code extensions; anyone can learn from or fork it |
| Publisher `bigdevgreg`; publish by uploading the `.vsix` by hand | "BigMoneyGreg" was rejected as suspicious by the Marketplace; a token needs an Azure DevOps organisation, which asked for an Azure subscription |
| Very large strength gaps count only partly (beyond 32 points, 30% counts) | The open cup draw pairs teams 60 apart; full gaps gave 6+ goal margins in 6% of cup games and scores like 3–10. Now about 3%, with league scoring unchanged |
| Real nations replace fictional clubs | Relatable worldwide, and players can follow how teams they know are doing; clubs' names are trademarks, countries' aren't |
| World order by football standing, shuffled within pots of 8 (swing pots across each league line) | A single ranking table over-rates hot streaks; pots keep big nations near the top while every career starts differently |
| Any nation, any starting league (defaulting to its usual one) | People want to play as their own country, and some want a long climb |
| Nations Cup (top 64, open draw, one-off ties, every season) and World Championship (Leagues 1–2, every 4th summer); no effect on ratings | Real-feeling moments beyond the league, without touching the balance tuning |

## 17. Name ✅

**Sports Simulator**

- **Name:** Sports Simulator. It says what it is, which helps people find it in search, and it covers rugby and cricket later
- **Marketplace display name:** `Sports Simulator`
- **IDs:** extension `sports-simulator`; commands, settings and storage under `sportsSimulator.*`
- **Keywords:** `football, soccer, sport, sports, manager, league, game, idle, simulation` (add `rugby`, `cricket` when those sports arrive)
- **Avoid** the phrase "Football Manager" anywhere (SEGA trademark)

Checked (Oct 2026): no VS Code Marketplace extension named "Sports Simulator" or "Sport Simulator".

Previously **Sideline — Sport Simulator for Your Sidebar**, renamed during M8 because the Marketplace already has *Sideline - Live Sports Scores*. Also free at the time: Dugout, Touchline, Pitchside, Final Whistle.

Rejected: **Matchday Manager** (an existing PC football management game by Lucky Conker Games; "Matchday" is crowded on mobile) and **Sideline** (taken on the Marketplace, see above).
