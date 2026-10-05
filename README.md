# Editorial Template

A Next.js 16 + Tailwind v4 + GSAP starter extracted from the Devidy project's structure: the fonts, the root scaler and one-unit token system, the 12-column editorial grid, and the house reveal motion.

## Start a new project from it

```bash
cp -r editorial-template my-new-site
cd my-new-site
npm install
npm run dev
```

Then:

1. Rename `name` in `package.json` and `metadata` in `app/layout.tsx`.
2. `git init`.
3. Read `AGENTS.md`. It is the design system and the coding rules; `CLAUDE.md` just imports it.

## What's inside

| Path | What it is |
|---|---|
| `app/globals.css` | The one stylesheet entry: imports the partials below, in cascade order |
| `app/styles/` | `theme.css` (theme tokens), `tokens.css` (shared tokens, the two step-down breakpoints), `base.css` (the **root scaler**, base styles), `utilities.css` (`bg-noise` / `glass` / reveal-mask) |
| `components/<feature>/<feature>.css` | Each feature's own unit, tokens, step-downs and component rules |
| `app/layout.tsx` | Cabinet Grotesk + Switzer via `next/font/local` (variable, `100 900` range), Lenis smooth scroll |
| `components/ui/` | `cx`, `easing` (callable cubic-bezier), shared `motion` curves, `SmoothScroll`, `StageReveal`, `useRevealOnce`, `OSDivider` |
| `components/intro/` | Worked example of a feature folder: `content.ts` + `motion.ts` + section + parts, with a masked GSAP entrance |
| `public/fonts/` | The variable woff2 files only |
| `.claude/launch.json` | Dev-server config for Claude Code's preview |

## Font scaling in one paragraph

`html` font-size is `clamp(1rem, 1rem + (100vw - 95rem) × 0.012, 3.75rem)`: 16px up to 1520px, growing above that, capped at 60px, and never below the visitor's own default. Every size in the system is rem, so the whole site scales on that one curve. Each component has one `--<name>-unit`, and all its sizes are `calc(unit × figmaPx/16)`. Only those units step down, at 1280 and 768. See the Scaling System section of `AGENTS.md`.

## Fonts licence

Cabinet Grotesk and Switzer come from Fontshare (Indian Type Foundry), under the ITF Free Font License. Check the licence terms for each new project.


##Designed for award winning level web designs