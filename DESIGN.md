# Sideline — Sport Simulator for Your Sidebar

> A football management sim that lives in a small box in your VS Code sidebar. You pick how good your club is, and it plays every match, table and season on its own while you code.

**Status legend**

- 🟢 **NOW**: part of version 1. Build this.
- 🔵 **LATER**: agreed for a future version. Don't build yet.
- ⚪ **IDEA**: worth considering, not committed.
- ❓ **TO CONFIRM**: proposed, awaiting a decision.

---

## 1. Vision

Football management with almost nothing to manage. Your only decisions are:

1. **How good your club is at the start:** a rating from 0 to 99, which also decides your league and how hard it is
2. **How long a match lasts:** 1–5 real minutes
3. **Where to spend points:** attack, defence or chemistry, at the end of each season

Everything else runs by itself: fixtures, matches, commentary, tables, scorers, play-offs, promotion and relegation, and the other 99 clubs rising and falling. You glance at it between tasks, react at the end of each season, and build a club history worth keeping.

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
  └─ choose starting rating (0–99) → sets your league and expected finish
  └─ choose match duration, optionally adjust the Attack / Defence / Chemistry split
        │
        ▼
Season (runs automatically, 38 matchdays)
  └─ matchday → all 50 matches across 5 leagues play at the same time
  └─ your match shown live: score + commentary feed
  └─ full-time pop-up (auto-closes after 5s) → next matchday
        │
        ▼
Play-offs (if you finished 3rd–6th)
        │
        ▼
End of season
  └─ final table, promotion / relegation
  └─ season report (what went well, what didn't)
  └─ decline applied to every club
  └─ earn points → spend on Attack / Defence / Chemistry
  └─ trophies & records updated
        │
        ▼
Next season … (won league 1? → carry on, or start a new career)
```

---

## 3. Setup 🟢 NOW

| Option | Values | Notes |
|---|---|---|
| Starting rating | 0–99 (slider) | Your club's team rating. Decides your league and your expected finish. **This replaces difficulty**: want it hard? Start low. Want to win every week? Start at 99 |
| Stat split | Optional | Defaults to an even split (attack = defence = chemistry = rating). Can be shifted, e.g. more attack, less defence, as long as the average stays at the chosen rating |
| Match duration | 1–5 real minutes | Length of one 90-minute match; can be changed later |
| Club name | Generated, editable | See §10 |

### Rating label

A live label next to the slider explains what the rating means, based on the league bands (§6). Within each league's band of 20:

| Position in band | Label | Example (League 1, 80–99) |
|---|---|---|
| Bottom quarter | "Relegation battle — League N" | 80–84 |
| Lower-middle | "Lower half — League N" | 85–89 |
| Upper-middle | "Upper half — League N" | 90–94 |
| Top quarter | "Title contender — League N" | 95–99 |

Examples: **85** → *"Lower half — League 1"* · **14** → *"Upper half — League 5"* · **99** → *"Title contender — League 1"* (strongest club in the game at the start).

---

## 4. Team model 🟢 NOW

Each club has three stats, each **0–99**:

| Stat | Effect in matches |
|---|---|
| **Attack** | How often the team creates and scores chances |
| **Defence** | How well it stops the opponent's chances |
| **Chemistry** | How *consistent* the team is (fewer bad days) plus a small late-game boost (fewer collapses, more late winners) |

**Team rating = average of attack, defence and chemistry.** This is what places a club within the rating bands (§6).

AI clubs have a "style" (attacking, defensive, balanced) that decides how their gains and declines split across the three stats, so clubs with the same rating play differently.

Players are generated (names, positions, shirt numbers). They're flavour only: they score goals, get cards and appear in commentary and records. There is no squad management.

🔵 LATER: players age and retire, youth players come through, star transfers.

---

## 5. Match engine 🟢 NOW

All matches on a matchday are simulated minute by minute at the same time. Only your match is shown live; other scores update in the tables.

**Starting model (to be tuned):**

- Each team's expected goals per match:
  `xG = 1.35 × e^(0.25 × (attack − opponentDefence) / 10)` plus a small home advantage
- Per-minute scoring chance = `xG / 90`, slightly weighted towards late in the game
- **Chemistry:** each match, a team's "form on the day" multiplier is drawn from a range that narrows as chemistry rises. Low chemistry means more random results; high chemistry means more reliable ones. High chemistry also gives a small boost after the 75th minute.
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

- **5 leagues × 20 clubs = 100 clubs.** No club is ever rated 100; ratings run 0–99. 38 matchdays per season (home and away). At 1–5 minutes per match, a season takes about 40 minutes to 3+ hours of coding time.
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

1. The player's club takes the rating they chose.
2. The remaining 99 ratings are **shuffled randomly** across the 99 AI clubs.
3. Clubs are placed into leagues by rating: the top 20 in League 1, and so on.

So each league starts with exactly one club on each rating in its band, and every career starts with a different world (which AI club is strong changes each time). A player choosing 99 starts as the strongest club; a player choosing 85 has fourteen League 1 clubs above them.

The overall average starts at **49.5** and stays there every season (§7). After the first season, ratings move freely and are no longer unique.

The bands make movement feel real:
- A league 5 club on 14 needs to get up to about 20 to challenge for promotion.
- A league 4 club slipping below 20 is in a relegation fight.
- A promoted club arrives near the bottom of its new league (the top of L2 ≈ 79 ≈ the bottom of L1), as in real life.

---

## 7. Progression, decline & balance 🟢 NOW

### Every club, every season

1. **Decline:** every club, including yours, loses **10** rating (ageing, players leaving).
2. **Gains:** clubs regain rating based on **how they finished compared with what was expected**. The average gain is **+10**.

### Expected position

At the start of each season, every league's 20 clubs are ranked by rating. That rank is each club's **expected position**: the highest-rated club is expected to finish 1st, the lowest 20th. Ranks are recalculated each season, so a newly promoted club is usually expected near the bottom of its new league, and a relegated club near the top of its new one.

### Performance gain (all clubs, including yours)

```
performance = expectedPosition − actualPosition     (positive = did better than expected)

gain = 10
     + 0.5 × performance     reward over-achievers, punish under-achievers
     + noise                  AI clubs only: small random variation
     × plateau                gains shrink as rating approaches 99
```

Examples (at the start of a career, when each rating is used exactly once):

| Club | Expected | Finished | Performance | Gain | Net after −10 decline |
|---|---|---|---|---|---|
| Rating 99 (League 1) | 1st | 10th | −9 | +5.5 | **−4.5** |
| Rating 90 (League 1) | 10th | 12th | −2 | +9 | **−1** |
| Rating 9 (League 5) | 11th | 8th | +3 | +11.5 | **+1.5** |
| Rating 0 (League 5) | 20th | 10th | +10 | +15 | **+5** |
| Rating 99 (League 1) | 1st | 1st | 0 | +10 | **0** |

So the 99 club finishing 10th is punished more than the 90 club finishing 12th, and the 0 club finishing 10th is rewarded more than the 9 club finishing 8th.

**Why this works well:**
- **It balances itself.** In any league, the expected and actual positions are both 1–20, so the performance scores always add up to zero. Before the plateau and caps, the average gain is exactly +10 without any adjustment.
- **It's a natural rubber band.** An over-achiever rises, then is expected to do better next season, so it has to keep over-achieving to keep rising. No club runs away.
- **The top is hard to hold.** A club expected to win can't over-achieve, so winning only maintains its rating, and any slip costs it. A 99 club only stays at 99 by winning every year.
- **Climbing has to be earned.** Rising from the bottom of a league takes several seasons of beating expectations.

### Extra AI-only adjustments

- **Band pull:** if an AI club drifts outside its current league's band, it is pulled back towards it (promoted clubs get a lift, relegated clubs drift down). This stops bottlenecks, e.g. league 2 filling with 80+ clubs while league 1 has clubs below 80.
- **Normalisation:** after plateau and caps, AI gains are adjusted slightly so that total gain = total decline exactly. The overall average stays **exactly 49.5** every season.

Your club gets neither, so its progress depends only on results. Your gain is given as points to allocate across the three stats (3 points ≈ +1 rating), and you can't go above 99.

The 0.5 multiplier is a starting value, tuned with the balance tool.

There are **no difficulty modes**: the starting rating is the difficulty.

### Tuning targets (checked by the balance tool)

- The overall average stays at 49.5 after 100+ simulated seasons
- No league's average drifts more than ±3 from its band average
- Fewer than 2 clubs above 95 at any time; none at 99 for long
- Promoted clubs finish in the bottom half of their new league about 70% of the time
- A player club starting at the bottom of a band takes 2–4 seasons to win promotion on average
- A player club starting at 99 wins league 1 most seasons, but not every season

---

## 8. Interface 🟢 NOW

### Sidebar box (Explorer view, bottom-left by default)

- **Header:** club name, league, position, form (last 5 results as W/D/L dots), ▶/⏸ button
- **Live match:** score, match clock, scrolling commentary feed
- **Tabs:** Match · Table · Fixtures · Club (stats, trophies, history)
- **Table:** promotion, play-off and relegation places highlighted
- **Rival:** one club in your league is your rival; derby matches are flagged

### Status bar

`⚽ ASH 2–1 RED 67'`, which you can click to open the sidebar box.

### Full-time pop-up

For your club's matches only. It **closes itself after 5 seconds** with no click needed, then the next matchday starts.

> **FT: Ashby Rovers 2–1 Holtwick Town**
> Okafor 23', Lind 67' · Marsh 81'

Built with a VS Code progress-style notification that closes automatically. If that turns out to be awkward, the fallback is a slide-in banner inside the sidebar box.

### Pause / play

- ▶/⏸ button in the sidebar box (plus a command)
- **Closing VS Code pauses automatically.** On reopen, the game continues from the exact minute it stopped. Nothing is simulated while closed.

### End-of-season screen

1. Final table with promotion, play-offs and relegation
2. **Season report:** goals scored and conceded against the league average, best and worst runs, top scorer, and a one-line verdict (*"You conceded 61, league average 48. Defence was your weakest area."*)
3. Decline applied (shown clearly)
4. Points earned → allocate to attack, defence, chemistry → confirm → next season starts

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

## 10. Club naming 🟢 NOW

**Rule: no real club names, ever.**

Real club names, nicknames, crests and kits are trademarks. Close imitations of famous clubs (*"Manchester FC"*, *"Liverpool Town"*) are also off-limits. Many small towns have real non-league clubs, so "real town + suffix" often copies a real club by accident.

### Approach

1. **Fictional towns:** built from real place-name pieces (*Ash-, Brad-, Holt-, Kings-, -by, -ford, -wick, -ton, -bridge, -ham, -field*) into plausible towns that **don't exist**, e.g. *Ashby Vale, Holtwick, Kingsbridge Moor*.
2. **Suffixes:** *United, City, Town, Rovers, Athletic, Wanderers, Albion, County, Rangers*, plus *FC* or *AFC*.
3. **Checked against real clubs:** every one of the 100 names is checked against club lists for the English pyramid (Premier League down through non-league), the Scottish, Welsh and Northern Irish leagues, and major European clubs. Towns are preferably not real UK places at all.
4. **Blocklist:** the same club list is built into the name generator, so it can never produce a real club.
5. **Fixed world:** one curated set of 100 clubs, each with generated colours and a 3-letter code (ASH, HOL…), so the world feels consistent across careers.
6. **Your club:** a generated name you can edit at setup (the blocklist doesn't apply to names you type yourself).

### User renaming 🔵 LATER

Rename any club locally (edit button, or import/export a names file). Anyone who wants real names can add them on their own machine. The extension never ships them.

---

## 11. Settings 🟢 NOW

- Match duration (1–5 minutes)
- Full-time pop-up on/off
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
| Where it runs | **Extension host** runs the game clock and engine (so the status bar and pop-ups work even when the sidebar is collapsed). The webview only *displays* state it receives |
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
    notifications.ts
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
| **M7** | Polish | Full-time pop-up, form dots, rival/derby, trophy cabinet, history, records, copy summary, settings |
| **M8** | Personal trial | Use it daily for two weeks; fix what's boring, annoying or unrealistic |

---

## 14. Later 🔵

In rough priority order:

1. **League cups:** a knockout cup per league running alongside the league season, with upsets against bigger clubs
2. **European competition:** for top league 1 finishers; group stage + knockouts against clubs from fictional foreign leagues
3. **Player lifecycle:** ageing, retirement, youth players, star transfers (still automatic)
4. **User renaming:** rename clubs locally, import/export name files
5. **Other sports in the same extension** (after football is finished): sport choice at setup, separate career per sport, keywords for each sport so it shows up in search
   - **Rugby union:** bonus points, tries/conversions/penalties commentary
   - **Cricket:** most different (formats, overs, innings, draws in multi-day games); highest effort
6. **Hall of Fame:** archive of past careers
7. **Publishing:** Marketplace listing, icon, screenshots, README

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
| Starting rating 0–99 replaces league choice and difficulty | One simple choice; players pick their own challenge, from "win every week" to "rise from nothing" |
| Same decline (−10) for the player as for AI clubs | No difficulty modes needed |
| Football first; other sports only after it's finished | Keeps version 1 small |
| Unbeaten-run tracker in status bar: **rejected** | Unnecessary; records page covers it |
| Pause when VS Code closes | You never miss matches; no catch-up simulation |
| Fictional club names only, checked against real club lists | Avoid trademark issues; renaming handled locally later |
| Engine runs in extension host | Status bar and pop-ups work without the sidebar open |
| Sport-agnostic core + sport modules | Rugby/cricket can be added later without a rewrite |
| One extension for all sports (later) | One codebase; keywords handle discovery |

## 17. Name ✅

**Sideline — Sport Simulator for Your Sidebar**

- **Name:** Sideline (short, works across sports, fits the status bar)
- **Marketplace display name:** `Sideline — Sport Simulator for Your Sidebar`
- **Keywords:** `football, soccer, sport, sports, manager, league, game, idle, simulation` (add `rugby`, `cricket` when those sports arrive)
- **Avoid** the phrase "Football Manager" anywhere (SEGA trademark)

Checked (Oct 2026): no VS Code extension or game titled "Sideline" found. Near-misses: *Beyond the Sideline Football* (American football sim announced 2014), *Sideline Labs* (a mobile game developer), *Sideline Manager* (a rugby referee tool, not a game).

Rejected: **Matchday Manager** (an existing PC football management game by Lucky Conker Games; "Matchday" is crowded on mobile) and **Sport Simulator** on its own (too generic to stand out or be remembered; kept as the subtitle instead).
