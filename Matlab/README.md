# Hull Lines Design Module

This is a static JavaScript app (ES modules + Three.js CDN), so it can be hosted on any static web server.

## Run locally

### Option A: npm (recommended)

1. Install dependencies:

   npm install

2. Start local server:

   npm run start:open

3. Open this URL if it does not auto-open:

   http://localhost:8080/index.html

### Option B: Python (no npm required)

1. Run in project root:

   python -m http.server 8080

2. Open:

   http://localhost:8080/index.html

## Deploy to GitHub Pages (automatic)

A workflow already exists at:

- .github/workflows/deploy-pages.yml

### Steps

1. Create a GitHub repository and push this project.
2. Ensure your default branch is `main`.
3. In GitHub, open Repository Settings > Pages.
4. Under Build and deployment, set Source to GitHub Actions.
5. Push to `main` (or run the workflow manually from the Actions tab).
6. After deployment, the site URL appears in the workflow summary and Pages settings.

## Deploy to other static hosts

You can also deploy this folder as-is to:

- Netlify (drag-and-drop or Git integration)
- Vercel (static site)
- Cloudflare Pages
- Any Nginx/Apache static directory

No build step is required.
