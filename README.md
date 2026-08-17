# aakash-profile

Portfolio site for **Aakash Anil Madkaikar** — Senior AI Engineer, agentic systems & multi-agent orchestration.

**Live:** https://aakash7192.github.io/aakash-profile/

Built and shipped end-to-end by an agentic workflow.

## Stack

- Vite 6 (vanilla JS, no framework)
- Hand-authored HTML + CSS, dark mode only
- Deployed to GitHub Pages via GitHub Actions

## Local development

```bash
npm install
npm run dev      # dev server at http://localhost:5173/aakash-profile/
npm run build    # production build → dist/
npm run preview  # serve the production build
```

## Structure

```
index.html        markup for the whole site
src/style.css     tokens, layout, responsive rules
src/main.js       reveal-on-scroll, stat counters, terminal widget
public/assets/    profile image
```

## Deployment

Every push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds
with Vite and publishes `dist/` to GitHub Pages. `vite.config.js` sets `base: '/aakash-profile/'` so asset
paths resolve under the project-pages subpath.

## Contact

- Email — aakash7192@gmail.com
- GitHub — https://github.com/aakash7192
- X — https://x.com/SkyLife50528410
- WhatsApp — https://wa.me/917208433292
