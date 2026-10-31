# Sports Simulator

International football, rugby and cricket sims that live in a small box in your VS Code sidebar. Pick a sport, your country and where it starts, and it plays every match, table, cup and season on its own while you code. Glance over when you like; once a season, you make one decision.

<p>
  <img src="media/screenshots/match.png" width="220" alt="A live match: scoreboard and match report">
  <img src="media/screenshots/table.png" width="220" alt="The live league table, with teams moving as goals go in">
  <img src="media/screenshots/seasonOver.png" width="220" alt="The end of a season: who is leaving, the clues and the summer question">
  <img src="media/screenshots/cups.png" width="220" alt="The World Championship knockout rounds in the Cups tab">
</p>

## How to play

1. **Start a career.** Open the Sports Simulator box in the Explorer. Pick a sport, your country, the league it starts in (its usual level is marked; L1 is the top) and a match length. Your team starts balanced; its character comes from the summers.
2. **Let it play.** Matches play live while VS Code is open. The table moves as goals go in. Pause any time with ⏸.
3. **Read the results.** You never see ratings. Every summer players retire or are dropped and your squad loses strength, more at one end of the pitch than the other. Where you ranked for goals scored and conceded, and who's leaving, are the clues. Let one side fall behind and it catches up with you over a season or two, and a fix takes a season or two to settle.
4. **Answer the summer question.** Call up a striker or a defender, appoint a coach, change formation or set the training camp: one answer strengthens the attack, the other the defence. Then press **Start next season**. Read it well and you climb; guess and you'll drift down. Finish above expectations and you have more to build with.
5. **Climb.** Finish high enough to go up and avoid the bottom places (see below). Win League 1 to be champions, then keep going: a great manager can build a side strong enough for an unbeaten season.
6. **Chase the cups.** Finish high enough to enter next season's Nations Cup. Every fourth summer, Leagues 1 and 2 play the World Championship: groups, then knockouts.

## The sports

| | Football | Rugby | Cricket (T20) |
|---|---|---|---|
| Nations | 100 in the world, about 210 to play as | 48 | 30 |
| Leagues | 5 of 20 | 6 of 8 | 5 of 6 |
| Up and down | Top 2 up, 3rd–6th play off, bottom 3 down | Top 2 up, bottom 2 down | Top 1 up, bottom 1 down |
| Table | 3 for a win, 1 for a draw, goal difference | 4 for a win, 2 for a draw, bonus points for four tries and for losing by 7 or fewer, points difference | 2 for a win, net run rate; ties go to a super over |
| Nations Cup | Top 64 | Top 32 | Top 16 |
| World Championship | 40 teams | 16 teams | 12 teams |
| Match lengths | 30 sec, 2 min, 5 min | 1 min, 2 min, 5 min | 2 min, 5 min |
| Season at those lengths | 25 min, 1½ hr, 3¾ hr | 20 min, 35 min, 1½ hr | 25 min, 1 hr |

Each sport has its own career, and they wait where you leave them. Only the one you're playing runs. Switch from the Team tab or with **Sports Simulator: Switch Sport**.

## Features

- Three sports, with promotion and relegation in each; big nations start near the top, shuffled a little every career
- The Nations Cup every season and the World Championship every four, each with its own Cups tab (draws, groups, results and past winners)
- Live match report and live tables, with your score in the status bar (and a *GOAL!*, *TRY!* or *WICKET!* as it happens); hover it for your position and expected finish
- Collapse the box and its title still shows your position and score
- A flash in the box: green when it goes your way, red when it doesn't
- Fits any size: shrink the box and it keeps just the essentials (club, league, position, form and controls)
- Season reports, trophy cabinet, club history and records
- Pauses when VS Code closes, so you never miss a match
- With several VS Code windows open, the game runs in the one you're working in

Player names are generated and fictional. Competitions are the game's own, not official tournaments.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `sportsSimulator.matchDuration` | `2m` | Real time one match takes (see the table above). If your sport doesn't offer this length, the next longer one is used. Also on the ⏱ button. |
| `sportsSimulator.fullTimeOverlay` | `true` | Show the full-time result over the box for a few seconds after your match. |
| `sportsSimulator.statusBarScore` | `true` | Show your live score in the status bar. Click it to open the box. |

Commands: **Sports Simulator: Open**, **Pause / Play**, **Switch Sport** and **Reset Career**.

## Development

```sh
npm install
npm run build          # bundles dist/extension.js and dist/webview.js
npm test               # unit tests (Vitest)
npm run test:integration   # launches your installed VS Code with a throwaway profile
npm run balance        # headless balance check against DESIGN.md §5 and §7 (add --quick)
npm run balance:sports # the same for rugby and cricket
npm run preview        # renders the webview with sample states in dist/preview/
```

Press **F5** in VS Code ("Run Sports Simulator") to try it in an Extension Development Host; the Sports Simulator box appears in the Explorer.

## Licence

[MIT](LICENSE)
