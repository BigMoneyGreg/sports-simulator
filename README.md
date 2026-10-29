# Sports Simulator

A football management sim that lives in a small box in your VS Code sidebar. Pick a league, and it plays every match, table and season on its own while you code. Glance over when you like; once a season, you make one decision.

<p>
  <img src="media/screenshots/match.png" width="220" alt="A live match: scoreboard and match report">
  <img src="media/screenshots/table.png" width="220" alt="The live league table, with clubs moving as goals go in">
  <img src="media/screenshots/seasonOver.png" width="220" alt="The end of a season">
</p>

## How to play

1. **Start a career.** Open the Sports Simulator box in the Explorer. Name your club, pick its badge colours, choose a league (L1 is the top), a difficulty, a match length and a style.
2. **Let it play.** Matches play live while VS Code is open: goals, cards, half-time and full-time. The table moves as goals go in. Pause any time with ⏸.
3. **Read the results.** You never see ratings. Lots of goals at both ends suggests you lean attacking; tight, low-scoring games suggest you lean defensive.
4. **Choose your summer focus.** At the end of each season pick *Focus attack*, *Balanced* or *Focus defence*, then press **Start next season**. Finish above expectations and you have more to build with.
5. **Climb.** Top two go up, 3rd–6th play off, bottom three go down. Win League 1 to be champions.

## Features

- 100 fictional clubs across 5 leagues, with promotion, play-offs and relegation
- Live match report and live tables, with your score in the status bar
- A goal flash in the box: green when you score, red when you concede
- Fits any size: shrink the box and it keeps just the essentials (club, league, position, form and controls)
- Season reports, trophy cabinet, club history and records
- Pauses when VS Code closes, so you never miss a match

All club and player names are fictional.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `sportsSimulator.matchDuration` | `2m` | Real time one 90-minute match takes: 30 seconds, 2 minutes or 5 minutes. Also on the ⏱ button. |
| `sportsSimulator.fullTimeOverlay` | `true` | Show the full-time result over the box for a few seconds after your match. |
| `sportsSimulator.statusBarScore` | `true` | Show your live score in the status bar. Click it to open the box. |

Commands: **Sports Simulator: Open**, **Pause / Play** and **Reset Career**.

## Development

```sh
npm install
npm run build          # bundles dist/extension.js and dist/webview.js
npm test               # unit tests (Vitest)
npm run test:integration   # launches your installed VS Code with a throwaway profile
npm run balance        # headless balance check against DESIGN.md §5 and §7 (add --quick)
npm run check-names    # re-checks club names against real clubs (add -- --online)
npm run preview        # renders the webview with sample states in dist/preview/
```

Press **F5** in VS Code ("Run Sports Simulator") to try it in an Extension Development Host; the Sports Simulator box appears in the Explorer.
