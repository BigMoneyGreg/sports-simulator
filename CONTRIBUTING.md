# Contributing

```sh
npm install
npm run build          # bundles dist/extension.js and dist/webview.js
npm test               # unit tests (Vitest)
npm run test:integration   # launches VS Code with a throwaway profile
npm run test:e2e       # clicks through the real box in VS Code, with a throwaway profile: a window opens for a few minutes
npm run balance        # headless balance check against DESIGN.md §5 and §7
npm run balance:sports # the same for rugby and cricket
npm run preview        # renders the webview with sample states in dist/preview/
```

Press **F5** in VS Code ("Run Sports Simulator") to try it in an Extension Development Host; the Sports Simulator box appears in the Explorer.

`npm run test:e2e` uses your installed VS Code on a Mac; set `VSCODE_BIN` to its executable elsewhere. Release checks: `npm test`, `npm run test:e2e`, `npm run balance` and `npm run balance:sports`, the last two with every target met. See [DESIGN.md](DESIGN.md) for how the game works and why.
