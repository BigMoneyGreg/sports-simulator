# Sports Simulator

A football management sim that lives in a small box in your VS Code sidebar. Pick how good your club is, and it plays every match, table and season on its own while you code. Once a season, you decide where to strengthen: attack or defence.

> 🚧 In development. See [DESIGN.md](DESIGN.md) for the full design and build plan.

## Features (version 1)

- 100 fictional clubs across 5 leagues, with promotion, play-offs and relegation
- Live match commentary in the sidebar, scores in the status bar
- Starting rating from 0 to 99, plus easy / medium / hard
- Clubs rise and fall over the seasons based on how they perform against expectations
- Season reports, trophy cabinet, club history and records
- Pauses when VS Code closes, so you never miss a match

All club and player names are fictional.

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
