# Sports Simulator

> An international football sim that lives in a small box in your VS Code sidebar. You pick a country and where it starts, and it plays every match, table, cup and season on its own while you code.

**Status legend**

- 🟢 **NOW**: part of version 1. Build this.
- 🔵 **LATER**: agreed for a future version. Don't build yet.
- ⚪ **IDEA**: worth considering, not committed.
- ❓ **TO CONFIRM**: proposed, awaiting a decision.

---

## 1. Vision

Sports management with almost nothing to manage: football first, with rugby and cricket alongside (§13b). This section describes football. Your only decisions are:

1. **Which country you are, and which league it starts in:** any of FIFA's ~210 nations, in League 1 to 5 (its usual level by default), starting mid-table
2. **How long a match lasts:** 30 seconds, 2 or 5 real minutes
3. **One summer question:** asked in different ways (call-ups, a new assistant coach, a formation, the training camp), but one answer always rebuilds the attack and the other the defence

Everything else runs by itself: fixtures, matches, commentary, tables, scorers, play-offs, promotion and relegation, the Nations Cup and the World Championship, and the other 99 nations rising and falling. You glance at it between tasks, react at the end of each season, and build a club history worth keeping.

### Design principles

- **Realistic.** League sizes, promotion rules, results and club movement should feel like real football.
- **Glanceable, not demanding.** It should never need attention mid-match.
- **One meaningful decision per season.** The summer question is the whole game, so it has to matter.
- **History is the reward.** Trophies, records and club history are why people keep it installed.
- **Nothing happens while you're away.** Closing VS Code pauses everything.
- **Near-zero resource use.** It must never slow the editor.
- **Small and finishable.** New ideas go to 🔵 LATER, not into version 1.

---

## 2. Core game loop 🟢 NOW

```
New career
  └─ choose a country, and the league it starts in (1–5) → somewhere around mid-table
  └─ choose match duration; every team starts balanced
        │
        ▼
Season (runs automatically, 38 matchdays)
  └─ matchday → all 50 matches across 5 leagues play at the same time
  └─ your match shown live: scoreboard + match report
  └─ full-time overlay in the sidebar box (fades after 5s) → next matchday
        │
        ▼
Play-offs (if you finished 3rd–6th); Nations Cup ties during the season, World Championship every 4th summer
        │
        ▼
End of season
  └─ final table, promotion / relegation
  └─ season report (what went well, what didn't)
  └─ decline applied to every club
  └─ answer the summer question (one answer rebuilds attack, the other defence)
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
| Match duration | 30 sec · 2 min · 5 min | Length of one 90-minute match; can be changed any time from the ⏱ button in the box. Default 2 min |
| Country | Type to search; matches appear as you type | Sets the league picker to its usual level (marked *Usual*); any league can be picked, but only once a country is chosen. Preselected from VS Code's display language when it points to one country (German → Germany; plain English doesn't). See §10 |

### Starting position

The engine still takes a rating from 0 to 99 (the balance tool and tests use the full range). Players only pick a league; their rating is drawn from it as above and never shown.

---

## 4. Team model 🟢 NOW

Each club has two stats. Every starting rating is 0–99; after that they can drift below 0 or, for the player, climb past 99 (§7):

| Stat | Effect in matches |
|---|---|
| **Attack** | How often the team creates and scores chances |
| **Defence** | How well it stops the opponent's chances |

**Team rating = average of attack and defence.** This is what places a club within the rating bands (§6). Chemistry was removed in M8: two stats make the season's decision simple (score more, or concede less?) and readable from the season report.

**Leaning costs, gradually.** A gap of up to 4 between attack and defence is free. Beyond that the weak side is exploited and it costs more the wider it gets: every extra point of lean costs **1.2** effective attack *and* defence, so a strong attack never makes up for a weak defence. **Above 99 it gets steeper**, by 0.12 per rating point, so a side at 150 needs near-perfect balance (figures for a team that has settled into that gap; see below):

| Gap | Rating 50 (League 3) | Rating 120 (League 1) | Rating 150 (League 1) |
|---|---|---|---|
| 0 | ~6th | 99 pts, champions | 107 pts, champions |
| 10 | ~7th | 90 pts, champions | 102 pts, champions |
| 20 | ~12th | 65 pts, ~4th | 68 pts, ~4th |
| 30 | ~17th | 34 pts, ~18th | 15 pts, bottom |

**It builds up, and heals, over a few seasons.** The penalty follows the shape your team has *settled* into, not its shape on paper. Each summer the settled shape closes **half** the distance to the real one (`leanSettling` 0.5). So a wrong summer barely shows the next season and bites the one after, unless you fix it, and a fix takes a season or two to settle. Goals scored and conceded react straight away, so the clue stays readable; only the punishment phases in. Computer-run clubs keep their fixed shape. Measured (8 careers of 60 seasons, good reader): collapses at the top (99+, dropping 10+ places in two seasons) fell from 16 to 6 per ~370 top seasons, recovery about 2 seasons, while a guesser averages about 77th in the world.

AI clubs have a "style", a fixed **shape** around their rating: attacking clubs are +7 attack / −7 defence, defensive clubs the reverse. So AI clubs of the same rating are equally strong but play differently, and they never fix their weak side. Their gap of 14 is about what a player who reads the season carries, so reading holds you level with expectation, and guessing sinks you.

Players are generated (names, positions, shirt numbers). They're flavour only: they score goals, get cards and appear in commentary and records. There is no squad management, and none of this changes a team's strength.

- **Squads turn over:** each summer 2–4 players leave every club, long servants likeliest, and new names from the country's pool take their positions and shirts. Your leavers come mostly from the end of the pitch that lost most this summer (§7), so they're a clue. The summer screen lists them with what they play: long servants (5+ seasons) retire, the rest are dropped (*Finlay Ross · striker · retires after 9 seasons, 142 goals*, *Callum Reid · centre-back · dropped*), and who's joining. Leavers keep their goals in the all-time records.
- **Suspensions:** a player sent off misses his club's next match, in any competition; the next man in that position starts. The scoreboard notes it for your matches (*Suspended: Ross*). Bans don't carry over the summer.
- **AI managers change:** each summer about 1 AI club in 10 switches style (attacking ↔ defensive), so a club's character shifts over a long career.

🔵 LATER: player ages, youth players coming through, star transfers.

---

## 5. Match engine 🟢 NOW

All matches on a matchday are simulated minute by minute at the same time. Only your match is shown live; other scores update in the tables.

**Model** (values in `TUNING`, `src/sports/football/match.ts`):

- Each team's **effective** attack and defence:
  `effAttack = attack − weakness`, `effDefence = defence − weakness`,
  where `weakness = perPoint × max(0, |attack − defence| / 2 − 2)` and `perPoint = 1.2 + 0.12 × max(0, rating − 99)` (§4)
- Gaps between attack and the opponent's defence beyond 32 count only 30% (§16)
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

1. **Decline:** every club, including yours, loses **10** rating (ageing, players leaving), which is **20 stat points**, at the end of the season, however strong it is. For your club it's **split at random** between attack and defence, each side taking a tenth to nine tenths of it, and your leavers mostly come from the side that took more (two strikers retire, the defence ages). **You're never told the split**, and your attack and defence numbers are hidden once the career starts.
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

Your one decision each summer is **the summer question**. It's asked in one of four styles, but one answer always rebuilds the attack and the other the defence. There's no balanced option, because a safe middle made the choice meaningless (measured: always-balanced did as well as perfect knowledge, so nobody had a reason to look). **65%** of the summer's points go to the side you rebuild, **35%** to the other.

| Style | Prompt | Attack answer | Defence answer |
|---|---|---|---|
| Call-ups (drawn twice as often) | *Retirements leave gaps. Who gets the call?* | **Call up [name]** · striker, winger or attacking midfielder | **Call up [name]** · centre-back, full-back, defensive midfielder or goalkeeper |
| Assistant coach | *Your assistant has moved on. Who do you bring in?* | **Appoint [name]** · former striker (etc.) | **Appoint [name]** · former centre-back (etc.) |
| Formation | *Time for a new shape?* | **Three up front** | **A back five** |
| Training camp | *What does the summer camp work on?* | **Finishing** | **Defending** |

The same style is never asked two summers running. A call-up joins the squad in his position, taking the place of a newcomer at his end of the pitch (or of its longest servant); the other candidate doesn't. Names come from the nation's own pool.

- **Two clues:** where you ranked in your league for **goals scored** and **goals conceded** (where you were already short), and **who's leaving** (where this summer's loss mostly fell, §4). It's plain football information; no ratings are shown.
- **Why both:** at the top the ranks are often level (1st for both), and then only the leavers tell you anything. Measured with the loss split 10–90%: reading the ranks, then the leavers when the ranks are level, is right about 82% of the time below 99 and 76% above it (ranks alone: 66% at the top). A 0–100% split was too harsh: even a perfect reader sank.
- **Why it matters:** a side that falls behind gets exploited (§4), gradually at first and steeply above 99.
- **Measured** (12 seasons from five starting ratings, medium), places above expectation per season:

| Player | Places a season |
|---|---|
| Reads the ranks, then the leavers | **−0.2** |
| Guesses (coin flip) | **−4.7** |
| Always rebuilds attack | −10.4 |

So reading the summer keeps you level with expectation, while guessing costs nearly 5 places a season and ignoring it sinks you. The wider split made the climb slower (0→99 took 12–39 seasons), so the season boost went from 5 to 7; with the team settling over a few seasons (§4), 0→99 is now 8–14 seasons for a reader and the reader's peak beyond 99 averages 176, against 117 for a guesser.

### Season boost (one standard game) 🟢 NOW

Each season your club gets a hidden boost of **+7** (**+2** while reigning League 1 champion). It's **new rating, not taken from the AI** (see *Two economies* below). There's no difficulty choice: every career plays the same game, tuned and measured as the balance tool's *medium*. The engine still accepts *easy* (+10 / +4) and *hard* (0 / 0) so the balance tool can measure them, and careers started before the choice was removed keep theirs.

The smaller boost applies for the season after you win League 1; lose the title and it's back to the full one. Winning when you're expected to scores 0, so at the top the champion's boost is the only way up.

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

### Rough time from 0 to 99, and beyond

**Measured by the balance tool**, 4 careers each, from rating 0 (the standard game is *medium*; *easy* and *hard* are only measured, not offered):

| Engine setting | Reads the summer | Guesses |
|---|---|---|
| Easy (+10) | 6–8 seasons | far slower, or never |
| **Medium (+7), the game** | **8–14 seasons** | far slower, or never |
| Hard (no boost) | 63 seasons, or never | never |

**Beyond 99** there's no ceiling (a technical bound of 250, where every season is already perfect). Measured over 40 seasons from 95, 8 careers each: a reader peaks at **~176** (161–190), a guesser at ~117 (108–130), and 54 of 320 seasons were unbeaten.

What a rating means over a League 1 season (balanced): at **150** about half of seasons are unbeaten and 1 in 50 wins all 38; at **200**, 84% are unbeaten and about half win all 38; past 225 nearly every season is perfect.

### Two economies

**The AI world's total is fixed among the 99 AI clubs**, so its average never changes, however long the career. **The player sits outside it:** your gains and losses come only from results, the summer decision and the difficulty boost, with no matching loss for the AI. A great player climbs without draining the world; a poor one sinks without inflating it.

- Performance scores already sum to zero within each league, and top/bottom bonuses across the game.
- **Everything else** (plateau, AI noise, band pull, the ceiling) is balanced by a final **normalisation step** across the AI clubs only.
- **Stat bounds:** −50 to 250. Starting ratings run 0–99; a club bottom of League 5 can dip below 0 and climb back. The AI stays near its bands through the adjustments below; the player has no practical ceiling.

### Extra AI-only adjustments

- **Band pull:** if an AI club drifts outside its current league's band, 80% of the gap is closed each season. This stops bottlenecks, e.g. league 2 filling with 80+ clubs while league 1 has clubs below 80.
- **Ceiling:** an AI club above 93 loses 30% of the excess each season (its stars get poached); the points go back to the other AI clubs, so the average never moves. A 99 champion slips to about 97 then 96: dynasties happen (one club winning about a third of titles over a long career) but end. Without it, rank-based expectation can't touch a club far ahead: one club won 30–47 of 60 titles. At 70% League 1 had no lasting giants at all.
- **Style shape:** after its gain, an AI club's stats are rebuilt in its style's shape (§4).
- **Promotion investment:** an AI club gains **+4** rating when promoted, so promoted sides can compete. Tuned so about 80% of promoted clubs finish in the bottom half of their new league (Premier League, last decade: about 78%).
- **Small random variation** each season, so AI clubs don't move mechanically.

Your gain becomes points (2 points = +1 rating, 1 point = +1 to a stat), spent 65/35 on the side you rebuild. 65/35 because a stronger rebuild overcorrected: at 80/20 even a good reader swung past balance and lost places.

All numbers here (multiplier 1.0, bonuses, boosts) are starting values, tuned with the balance tool.

### Tuning targets (checked by the balance tool)

- AI-only match realism (§5): home/draw/away shares, goals, scorelines, upsets, late goals, comebacks
- The AI total and average never move, whatever the player does
- No league's average drifts more than ±4 from its band average (a strong player holding a League 1 place pushes one AI club down; 3.65 measured once the team settles over a few seasons)
- No more than 4 AI clubs above 95 at any time; none at 99 for long
- Promoted AI clubs finish in the bottom half of their new league about 78% of the time
- **Reading the ranks beats guessing by 2+ places a season**; a guesser drifts below expectation; a careless player sinks furthest
- A reader reaches 99 in roughly the measured seasons for each difficulty; a guesser takes at least twice as long or never; a careless player on hard never climbs from 0 to 99
- A player club starting at 99 wins League 1 most seasons, but not every season
- A good reader climbs well past 99 (peak 130+); a guesser peaks 20+ lower; nobody runs away (no peak above 220 in 40 seasons on medium); unbeaten seasons happen but not routinely

---

## 8. Interface 🟢 NOW

### Sidebar box (Explorer view, bottom-left by default)

- **Header:** club name, league, position, form (last 5 results as W/D/L dots), ▶/⏸ button
- **Team tab:** rating, this season's goals scored and conceded against the league average (the only clue to the drain), rival, trophies, records, history
- **Live match:** scoreboard (crests, score, clock) and a match report like a real game summary: the home side's events on the left and the away side's on the right, under their team codes and mirroring the scoreboard, with the time and running score in the middle; half-time and full-time markers, newest first. No running commentary. Cricket shows a scorecard instead
- **Tabs:** Match · Table · Fixtures · Cups · Team (stats, trophies, history)
- **Cups tab:** a two-line status naming your next tie and when it's played (*Still in · Round of 32 v Brazil (away)* / *After matchday 12*), your run once it's more than one tie, the latest round in full, earlier rounds and finished groups folded away, past winners
- **Fixtures:** one short label per matchday (*MD 7*, *Cup 32*, *WC QF*, *PO SF1*), full name on hover; cup rows marked with an accent edge and listed as soon as they're drawn
- **History:** one row a season, with the cup runs on one short line (*Cup: R64 · WC: Groups*)
- **Table:** promotion, play-off and relegation places highlighted
- **Rival:** your nation's real rival for the whole career (§10), shown on the Team tab with where it is now and your all-time record against it (*England · League 1, 5th · Played 6 · W3 D1 L2*), and marked ⚔ in the table

### The list of sports

Each sport has its own colour (football teal, rugby orange, cricket purple, Honours yellow; not green or red, which mean good and bad news), in a border round its row and its open page.

The box lists every sport, one row each. Only one opens fully at a time, beneath its row; clicking it again minimises it, and all can be minimised. A minimised row shows the least worth knowing: country, position, league week and score (*Rugby · Wales / 8th Wk 4/14 · SAM 14–18 WAL 54'*; cricket drops the *Ov*: *1st Wk 4/10 · SRI 144/3–51/2 USA 17.2*), *Not started*, or *Season over: decision waiting*, when the whole row also fills with a light version of its colour. A thin line along the bottom of a row shows how far through the league season it is, which still reads when a narrow box cuts the text off. The text shrinks to fit, down to 9 pixels, because a cricket line needs more room than a football one.

- **Start:** a row with no career has a Start button, which opens the setup form.
- **End or reset:** the open row has one button, *End…*, which asks in the box what should happen. *End career* stops it and keeps it in Past careers, where it still counts for greatest teams and records. *Reset career* deletes it as if it was never played, and asks again in red. There's one button so the difference is explained at the moment it matters. Other sports aren't touched, and honours already earned stay.
- **Pause:** a minimised row has its own ⏸/▶; the open sport's is in its header.
- **Everything runs:** opening a sport only changes what you're looking at. Each sport's summer waits for its own answer while the others play on.

With several careers the status bar shows each in turn for 5 seconds, paused ones included, as its sport, week and place (*Rugby: Wk 7/14 · 2nd in League 3*), with no live score or goal call-out; a bell appears if another sport is waiting on you. With one career it shows the live score as below. The collapsed box follows the sport last opened, or if that has no career, the first that does. The hover lists every career, and the badge counts decisions waiting. When a season ends a short message says so and goes by itself after 10 seconds (*Rugby season 3 finished: 2nd in League 3, promoted. Decision waiting.*), unless that sport is open in view. The decision is only ever made in the box; the badge, bell and pinned line stay until it is.

While something is open, a sport waiting on you is also pinned to the top of the box (*Cricket: season over, decision waiting*), because a long page can push its row out of sight. Clicking it opens that sport.

### Honours

A row under the sports, appearing once there's something to show. Only what exists is listed, so nothing is greyed out and nothing gives away what can be earned.

- **Honours:** League 1 champions in two sports at once, then all three; world champions in two sports, then all three. A League 1 title is held until that sport's next season ends, and only running careers count for "at once"; a world title stands for good, whichever career won it. Earning one gets its own notification, and it's kept even after the careers end, until the player resets honours.
- **Greatest teams:** the top five careers, running or ended, once there are two to compare. World titles, then League 1 titles, Nations Cups, best finish and length. No invented score.
- **Records:** the best across all careers, sport by sport, since scores can't be compared between sports.
- **Past careers:** ended careers, latest first.
- **Reset honours:** at the bottom of the page, in red, with two steps in red. Deletes honours and past careers. Running careers carry on and still show in greatest teams and records, but earn honours only from seasons still to come, even after they end; otherwise a world title already won would award the honour straight back.

### Rivals

A match against your rival is marked ⚔ in the status bar, and *Rival match* on the scoreboard, in the hover and on the full-time card. The season report shows the record against them if you met. It adds drama without adding a decision.

### Status bar

`⚽ SCO 2–1 RSA 67'`, which you can click to open the sidebar box.

- For about 4 seconds after a goal in your match: `⚽ GOAL! SCO 2–1 RSA 67'`.
- Hovering shows the essentials without opening the box: club, league and position, games played, expected finish, and the match in progress.
- Before a career starts: `⚽ Start a career` (shown even with the score turned off, like the summer choice).

### When the box is collapsed

- Its title bar shows the position, week and score: *SPORTS SIMULATOR 3rd Wk 7/38 · SCO 1–1 RSA 59'* (VS Code only does this once the box has been opened in that window).
- While the summer choice waits, a **1** badge sits on the Explorer icon.
- On first install the box opens once, so it's clear where the game lives.

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
- Unless that sport is open in view, **one short VS Code message** says so and goes by itself after 10 seconds (§8, The list of sports). The decision is only made in the box.
- The status bar shows `🔔 Season over: one decision waiting` until you do.

Screen contents:

The question comes first, under the headline, so it's in view without scrolling; the season report and final table follow.

1. Final table with promotion, play-offs and relegation
2. **Season report:** goals scored and conceded against the league average, goals a game in your matches against the league's, best and worst runs, top scorer. No verdict: reading it is the player's job (lots of goals at both ends = leaning attacking).
3. Decline: the overall rating drop only (e.g. 55 → 45), never the attack/defence split
4. The Summer card holds both clues and the question: leaving the squad (who, what they play, retired or dropped), then the clue (*Attack 10th for goals scored · Defence 4th for goals conceded*), then the summer question with two answers (§7). Picking one highlights it; a separate **Start next season** button below confirms it

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
- **Players:** generated from the most common names in each country (`data/commonNames.ts`), for every nation in any sport's world. Surnames follow Wikipedia's lists of most common surnames by country where one exists; Africa has no such list, and a few lists don't describe the national side (Fiji's is mostly Indo-Fijian, Iceland's skips patronymics), so those are judged by hand. First names are also judged by hand. A nation outside every world uses its region's list. About 15% of surnames come from a nation's neighbours (England from Wales, Scotland and Ireland: `BORROWS_FROM`), which replaced the old 25% mixed pools that let distinctive names such as Eze into England's squad. Surnames don't repeat in a squad until the list runs out, as with Kims and Nguyens. Common names can still make a real star (James Rodriguez, Thomas Muller), so those are blocked in every sport (`src/sports/famous.ts`).

---

## 11. Settings 🟢 NOW

- Match duration (30 seconds / 2 / 5 minutes): the length a new career starts from. Each career keeps its own, changed from the ⏱ button in the box
- Full-time overlay on/off
- Status bar score on/off
- Which sports show (a tick for each; none ticked counts as all)
- Honours row and its notifications on/off (honours still count)

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
| Saving | A file in the extension's global storage folder (the career follows you across all projects); saved at every goal, full-time and season end, when VS Code closes, and when another window takes over. Older saves in `globalState` carry over once |
| Save versions | Every save carries a version. Changing the save's shape means raising `SAVE_VERSION` in `game.ts` **and** adding an upgrade to `MIGRATIONS`, so careers carry over. A save that still can't be read (a gap in the upgrades, or from a newer version) is never just dropped: it's kept whole as `career.v<N>.json`, its history archived, and the player told once |
| Several windows | Every window shares one save, so only one runs the clock: the one you last focused. It takes over within a second or two: the old window saves and stops, then the new one loads that save and carries on. Other windows follow it: their status bar shows the running window's text (shared through a small `live.json`, rewritten only when it changes) and their box reloads the save whenever it changes, so goals and full time show everywhere. A lone window keeps running when unfocused |
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

**M8b (29 Oct 2026):** decided during the trial, before publishing, and all built: clubs became nations (relatable everywhere, and players can follow teams they know), both cups, real rivals, a design-review polish of every screen, a summer decision that rewards reading results (rebuild attack or defence, ranks as the clue), no rating ceiling for the player (flat decline, smaller boost while champion, imbalance steeper above 99), a softer AI ceiling, squad turnover, red-card bans and AI style changes, and a simpler setup (no style, countries appear as you type). 98 tests and all 30 balance targets pass.

**Review fixes (30 Oct 2026):** after a full review aimed at keeping people using it in the background: one window runs the game at a time (saves moved to a file), old saves are upgraded or backed up instead of dropped, and the game is noticeable with the box closed (GOAL! in the status bar, rich hover, score beside the collapsed box, summer badge, box opens on first install). 115 tests pass.

**Summer question (30 Oct 2026):** one question a summer in four styles (call-ups, assistant coach, formation, training camp), always attack or defence underneath; leavers matched to a 10–90% loss split as a second clue; Medium boost 5 → 7. 122 tests and all 30 balance targets pass.

**Final review fixes (31 Oct 2026):** season length shown beside each match length; packaging always builds fresh; other windows follow the running one; both summer clues sit with the question, first when the box is narrow; darker answers in light themes; one standard game (no difficulty choice); a lopsided team declines and recovers over a few seasons (`leanSettling` 0.5). 124 tests and all 30 balance targets pass (two targets loosened with reasons: drift ±4, peak 220).

**Rugby and cricket (31 Oct 2026):** built on the branch `rugby-and-cricket` (§13b): both sports, a career per sport, common names per country in every sport, closer leagues, no first-season walkover, ball-by-ball cricket, a tidier match report, line icons. 200 tests; football 30/30 and rugby and cricket 20/20 balance targets. Still to do: try every sport with fn+F5, including switching sport mid-match; decide when to merge into `main`; retake the README screenshots, which only show football.

**Before publishing (M9):** done: GitHub repo renamed to `sports-simulator`; Marketplace publisher **bigdevgreg** created and set in package.json; cleaned history force-pushed and the backup branch deleted. Still to do: try the build (fn+F5, ideally with two windows open; the current save carries over); make the GitHub repo public (README screenshots load from it); `npx @vscode/vsce package` (0.1.0 has never been published, so no bump for the first upload) and upload the `.vsix` by hand at marketplace.visualstudio.com/manage (no Azure DevOps token needed). Updates: bump the version, package, upload with **Update**.

---

## 13b. Rugby and cricket

Football's numbers and behaviour are unchanged: whole careers on fixed seeds hash the same as before the change. Everything that differs is in `SportFormat` (`src/core/format.ts`) and each sport's module (`src/sports/rugby`, `src/sports/cricket`: engine, squad, world order, words).

| | Football | Rugby | Cricket (T20) |
|---|---|---|---|
| World | 5 × 20 | 6 × 8 | 5 × 6 |
| Movement | 2 up + play-off, 3 down | 2 up, 2 down | 1 up, 1 down |
| League matches | 38 | 14 | 10 |
| Rating per place | 1 | 2.5 | 4.5 |
| Top/bottom bonus | 6, 4, 2 / 2, 4, 6 | 6, 3, 0 / 0, 3, 6 | 6, 3, 0 / 0, 3, 6 |
| Favourite wins (of decided games) | about 64% | about 71% | about 66% |
| Champions' losses a season | about 7.5 of 38 | about 2.6 of 14 | about 2.2 of 10 |
| Match lengths | 30s, 2m, 5m | 1m, 2m, 5m | 2m, 5m |
| Season, shortest length | 23 min | 18 min | 27 min |
| Nations Cup | top 64 | top 32 | top 16 |
| World Championship | 40: 8 groups of 5 | 16: 4 groups of 4 | 12: 4 groups of 3 |

**Why these values.** Fewer places mean each is worth more, or reading a season stops paying: rugby at football's value of 1 gave reader v guesser 154 v 139. The rugby and cricket movement rules came from measuring: 1 up in rugby made promoted sides too strong, 2 up in cricket made them yo-yo. Ratings are spaced evenly across 0–99 in every sport, so decline, boost and the AI ceiling carry over.

**No first-season walkover.** AI sides lose strength to their fixed shape (§4), so a new side that started balanced played far above its rating: in League 1 of rugby it won the title in its first season 42% of the time and went unbeaten 6.5%. New rugby and cricket careers start with the same penalty, which settles over a few summers as in §4, and finish about where predicted. Football keeps its head start (mean 4.65 places above expected in a first League 1 season, 12% titles).

**Rugby's engine.** Overall strength sets the margin and levels off for huge gaps; team shape only moves how open the game is. Letting attack v defence do both meant two attacking sides traded tries and the better one barely showed (favourites stalled at 74%, with thrashings).

**Batting order (31 Oct 2026).** Every place in the order now differs, replacing one step down at number 8. Measured over 6,000 matches between level sides: runs per dismissal fall from about 36 for the openers to 24 at number 5, 9 at number 8 and 2.6 at number 11; the chance of getting out on a ball rises from 4% to 27%. A typical total stays about 156 (was 155), and favourites still win 66%.

**Cricket's scorecard.** A real scorecard replaces the match report in cricket: how each batter got out, runs and balls, who's yet to bat and the bowling figures, with the finished innings folded away.

**Cricket's engine.** The ball-by-ball simulation: a chasing side takes risks when behind the rate and plays safe when ahead. The summer clue ranks run rates, not totals, because a side stops batting once it has won: measured over 720 seasons, ranks pointed the right way 89% of the time when not level, against 78% for totals (they are level more often, 58% v 32%, and then the leavers decide). A side bowled out counts its full 20 overs, the real rule. Every ball is its own tick, so it can be followed live: 0.5 sec a ball at 2-minute matches. Favourites at about 66% match the one, unverified, figure found for real T20.

**AI titles, re-measured (31 Oct 2026).** Most titles for one AI side in 40 seasons: rugby median 7, worst 13; cricket median 8, worst 16 (40 of 40 balance targets met). With 8 or 6 sides in a league, an even share of 40 titles is already 5 or nearly 7, so a typical top side is close to what chance alone gives, and the worst cases are rare. No change made.

**Where it stands (31 Oct 2026).** Rugby, cricket, several sports at once, Honours, rival call-outs, the End… question and the visual polish are all on `main`. 223 tests pass and VS Code starts with it loaded; the box has been clicked through in headless Chrome with sample games. Before publishing: try a real End, Reset career and Reset honours, see the season-end message in real VS Code, and retake the README screenshots.

**Worlds** come from the rankings: men's rugby, July 2026 (an unofficial copy of the World Rugby table); men's T20I, October 2026. Lower down rugby's list some nations rarely play. Only nations in a sport's world can be chosen there, unlike football's 210. Players' names work as in every sport (§10).

**Saves.** One file per sport, football's still `career.json`, each written by its own game; `sport.json` holds the sport the corner follows. Every career with no pause on it runs; the window that owns the game runs all their clocks. Careers left waiting from before this were paused once on upgrade, so none started up on its own. A save's match length is an optional field, so the save version stayed at 8 and older saves still load. Refreshing for all three clocks at their fastest costs about 0.1% of one core (measured).

---

## 14. Later 🔵

In rough priority order:

1. **Continental championships:** in the years between World Championships, by confederation
2. **Player lifecycle:** ages and youth players (squads already turn over each summer)
3. **Hall of Fame:** archive of past careers

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
| Rugby 6 × 8, 2 up 2 down, no play-offs; cricket T20 only, 5 × 6, 1 up 1 down; cups fitted to the team count | The user's choices after measuring (§13b). Favourites win more than in football because seasons are short |
| Several sports at once, as a list with one open at a time | The user's design. Careers no longer stop on switching; minimised rows keep it glanceable |
| The status bar takes each career in turn, 5 seconds each | The user's choice over showing the latest action or all the scores together, with 5 seconds after 3 felt too quick, and standings rather than scores, which mean little in passing: it keeps one short score at a time and never leaves a sport out for long |
| Hiding a sport holds its clock, without touching the career or its own pause | If it played on hidden, a season could end with a decision waiting on a sport the player can't see. A hold isn't saved, so the setting alone decides it and un-hiding can't undo a pause the player chose |
| Reset honours leaves running careers alone | Honours are a side record: wiping them shouldn't cost seasons of play, and End and Reset already deal with careers one at a time |
| One End… button instead of separate End and Reset; the Reset command removed | Two ways to stop a career needed explaining; asking at the moment makes the difference clear. VS Code's pop-ups can't be red, so these questions live in the box |
| Season-end message is one short line that goes by itself; no answering from it | A big pop-up with the decision in it was too much. See it, then go and act in the box |
| Times shown with ~ (*~2 min*, *Season ~25 min*) | A season's length is an estimate, and a chase or a knockout changes a match's |
| Honours list only what's been earned | Players work things out; no greyed-out goals or checklist |
| No format choice in cricket | T20 fits a 2-minute match, has no draws and is the only format with 30 real nations; a choice would be options for the sake of it |
| Unbeaten-run tracker in status bar: **rejected** | Unnecessary; records page covers it |
| League picker with a random, mid-weighted start instead of a 0–99 rating | Simpler: choose where to start, not a number; a little uncertainty about how good you are |
| No rating numbers shown to players (M8) | Players have no context for a 0–99 rating. The game shows expected finish, results and plain-English summaries; ratings, points and boosts stay internal |
| Hard has no boost | Matches its description; reaching 99 from the bottom becomes a near-impossible grind, and that's the point of Hard |
| Match lengths 30s · 2 min · 5 min | Three clearly different paces; 1 minute dropped |
| Pause when VS Code closes | You never miss matches; no catch-up simulation |
| Status bar goal call-out, rich hover, collapsed-box score and a badge for the summer choice | Most of the time the box is closed: these keep the game noticeable at a glance without a single extra notification |
| One summer question in four styles (call-ups, assistant coach, formation, training camp), always attack v defence underneath; leavers matched to the loss; loss split 10–90%; Medium boost 7 | Named people give a sense of power without more decisions. More levers (fitness, mentality, home/away…) were rejected: their clues come from half-seasons and would mostly be luck. Leavers alone were no clue at the old 25–75% split; at 10–90% they make the top readable (66% → 76% right). Medium needed +2 to keep its climb on target |
| No difficulty choice: one standard game (the old Medium) | Extra options for the sake of it. Medium's tuning is the one measured hardest, and Easy's bigger boost pushed teams so high that the steep penalty above 99 made careers collapse |
| The lopsidedness penalty follows a settled shape that moves half way each summer | One wrong summer at the top could take a 154 side to playing like a 68: champions to relegated in a season. Real teams decline and recover over a few seasons; now the slip shows, there's time to correct it, and collapses fell from 16 to 6 per ~370 top seasons. Slower settling (35%) made problems linger; a cap or a softer scale made guessing too safe |
| Saves are upgraded, never silently dropped | History is the reward: once the game is public, one update that wiped careers would lose players for good |
| One window runs the game; focusing another hands it over | Each window used to run its own clock on the shared save, so two windows played different matches and overwrote each other (a summer choice could be lost). Many people keep several windows open all day |
| Fictional club names only, checked against real club lists | Avoid trademark issues; renaming handled locally later |
| Engine runs in extension host | Game and status bar keep running without the sidebar open |
| End of season is the only routine VS Code message; the game waits for your answer in the box | It's the one moment that needs a decision; everything else stays in the box |
| Full-time result as an overlay inside the sidebar box, not a VS Code notification | Never covers code or clutters notifications; status bar covers the hidden case |
| Sport-agnostic core + sport modules | Rugby/cricket can be added later without a rewrite |
| One extension for all sports (later) | One codebase; keywords handle discovery |
| Two stats (attack, defence); chemistry removed (M8) | A simple, readable decision: score more or concede less, judged from the season report. M3 had shown chemistry either did nothing or needed a complicated model to matter |
| Free lean of ±5 (now ±2, then 1.2 a point; §4), then the weak side is exploited | Leaning is a real style choice, but a side drained too far needs fixing; without it attack and defence are interchangeable and the split doesn't matter |
| Uneven, random decline between attack and defence | Creates something to read and fix each season; tuned so ignoring it (even split) roughly holds and fixing it climbs |
| Summer focus (attack · balanced · defence, 70/30) instead of assigning points | One simple decision that matches what a player can know with hidden stats; exact points were false precision |
| The drain's split and the attack/defence numbers are hidden | The decision should come from reading results (goals for and against), not from a number telling you what to fix |
| AI clubs keep a fixed style shape, 5 beyond the free lean | AI stats otherwise drifted apart every season, widening gaps within leagues (too many thrashings); a fixed shape keeps AI equally strong for their rating |
| AI ceiling above 93 | Rank-based expectation can't pull back a club far ahead of the rest; without it 4–6 AI clubs sat above 95 |
| AI promotion investment (+4) | Promoted clubs finished in the bottom half 91% of the time against ~78% in the real Premier League |
| M8 visuals: match report newest-first, compact scoreboard, own league marked on table chips, legend shows only that table's zones (Champions in L1) | Latest event always in view; the box often lives in a small corner of the screen; clear which league is yours |
| Badge colours picked at setup: 6 main × 6 second; the second row only shows colours that go with the main (from a pool of 9), so nothing is ever greyed out | Players own their club's look; a fixed palette keeps every badge readable, and the main colour (used for the header tint) excludes black and white so it shows on any theme |
| Responsive box (CSS only): ≤250px wide drops table W/D/L, towns and running scores, speed button shows just ⏱; ≤200px wide shows only the header (club, badge, league, position, form, ⏱ and pause), except while a summer choice waits; short (≤420px / ≤260px) tightens spacing and puts the scoreboard on one line | Many players keep it in a small corner; at its narrowest it's a status card, widen it to manage |
| Summer card first when the box is narrow (≤250px), with both clues inside it; light themes get darker answer colours | In a small corner the decision was several screens down, below the season report; the chart orange was hard to read on white |
| Summer focus is picked, then confirmed with a separate "Start next season" button | Picking straight into the next season felt abrupt; players can change their mind and read the report first |
| Live table shows ▲▼ for places moved since kick-off instead of a dot on every playing club | Every club plays at once, so dots said nothing; movement is what makes a live table interesting |
| Derby markers removed (rival still on the Club tab) | Hardly noticed in play; one less thing on screen |
| Goal flash: scoreboard and header flash green when you score, red when you concede | Catches the eye when the box sits in a corner |
| Sticky header; fixtures open at the current match; played fixtures faded; form dots show the result on hover | Smoother to use as the season gets long |
| Summer explanation behind "How does summer work?"; Club tab hides records that don't exist yet | Keeps the choice and its button in view; no columns of dashes |
| MIT licence | Permissive and the norm for VS Code extensions; anyone can learn from or fork it |
| Publisher `bigdevgreg`; publish by uploading the `.vsix` by hand | "BigMoneyGreg" was rejected as suspicious by the Marketplace; a token needs an Azure DevOps organisation, which asked for an Azure subscription |
| No style choice at setup: every team starts balanced | Its character comes from the summer choices over time; one less decision before the first match |
| Summer: rebuild attack or defence, no balanced option; ranks for goals scored and conceded as the clue | Measured: with a balanced option, guessing and perfect knowledge ended level, so the choice didn't matter. Now reading the ranks beats guessing by over 4 places a season |
| Squads turn over (2–4 a summer), red cards bring a one-match ban, AI clubs change style (1 in 10 a summer) | A long career should feel lived-in: new names, old servants leaving, rivals changing character. None of it changes strength, so balance is untouched |
| AI ceiling pull 30% (was 70%) | A 99 champion keeps most of its strength for a few seasons: real-feeling dynasties and a strong rival at the top, without a permanent super-club |
| Player outside a fixed AI economy; no practical ceiling; flat decline of 10; smaller boost while reigning champion; imbalance costs gradually, steeply above 99 | A great player can chase 200 and unbeaten seasons without draining the world; only near-perfect balance keeps you climbing at the top, so guessers stall |
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
