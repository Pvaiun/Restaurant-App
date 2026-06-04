# 🍽️ Kayla & Paul — Restaurant Catalogue

A little web app to catalogue the restaurants you've visited, grouped **by cuisine**, with:

- **Dual ratings** — a Kayla (K) and a Paul (P) score for every place, plus an auto-calculated overall score.
- **Comments** — tasting notes, what to order, who you went with.
- **Google Maps** — every card has a "📍 Maps" button that searches the restaurant by name + city.
- **Re-visits** — log multiple visits per restaurant (e.g. a `2025` re-visit). The newest visit drives the headline K/P scores, and the overall score averages everything.
- **Search, group & sort** — group by cuisine or city, sort by score / name / recency, filter by cuisine, full-text search.

Your data lives in **Cloudflare D1** when deployed. Until then (or if you just open the file locally), it falls back to this browser's storage so it always works.

---

## Quick look (no deploy)

Open `public/index.html` in a browser. It loads the full seeded list and saves any edits to your browser's `localStorage`. The badge in the top-right shows **● This device**.

> Note: changes in local mode stay on that one device/browser. Deploy to Cloudflare (below) to sync everywhere and back up the data.

## Deploy to Cloudflare (Pages + D1)

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and Node installed.

```bash
# 1. Install the CLI and log in
npm install
npx wrangler login

# 2. Create the D1 database, then paste the printed database_id into wrangler.toml
npm run db:create
#   -> copy "database_id" into the [[d1_databases]] block of wrangler.toml

# 3. Create the table + load your restaurants into the REMOTE database
npm run db:schema:remote
npm run db:seed:remote

# 4. Deploy the site (static files in /public + the API in /functions)
npm run deploy
```

Then, in the Cloudflare dashboard, open your new Pages project →
**Settings → Functions → D1 database bindings** and add a binding named
**`DB`** pointing at the `kp-restaurants` database. Re-deploy if needed.
Once live, the badge reads **☁ Cloudflare** and every device shares the same data.

### Run it locally with the real D1 backend

```bash
npm run db:create        # if you haven't already (creates a local DB too)
npm run db:schema        # local schema
npm run db:seed          # local seed
npm run dev              # serves http://localhost:8788 with the Functions API
```

(The API also auto-creates the table and seeds it on first request, so steps
`db:schema`/`db:seed` are optional belt-and-suspenders.)

---

## How the data is structured

Each restaurant:

```json
{
  "id": "r042",
  "name": "Sushi Momo",
  "cuisine": "Japanese",
  "city": "Montreal",
  "comment": "Vegan sushi — get the tasting menu.",
  "visits": [
    { "label": "", "k": 9.25, "p": 9.25 },
    { "label": "2025", "k": 7.5, "p": 7.5 }
  ]
}
```

- `k` = Kayla's score, `p` = Paul's score (0–10).
- `visits` is ordered oldest → newest. Add a visit (with an optional label like
  a year) instead of overwriting, to keep the history.

## Editing the seed list

The starter list lives in `tools/gen-seed.mjs` (raw text + a cuisine lookup).
After changing it, regenerate the derived files:

```bash
npm run gen   # rewrites public/seed-data.js, functions/_seeddata.js, seed.sql
```

> Cuisines were auto-assigned as a best guess — a few may be off (e.g. `Lali's`).
> Just hit **✎ Edit** on any card to fix the cuisine, scores, city or notes.

## Project layout

```
public/            Static site (served by Cloudflare Pages)
  index.html
  styles.css
  app.js           Frontend logic + API client w/ localStorage fallback
  seed-data.js     Bundled starter data (generated)
functions/         Cloudflare Pages Functions (the API)
  _db.js           D1 helpers (schema, seed, sanitise, upsert)
  _seeddata.js     Seed data for the API (generated)
  api/restaurants/index.js   GET list / POST create
  api/restaurants/[id].js    GET / PUT / DELETE one
tools/gen-seed.mjs Generator for the seed files
schema.sql         D1 table definition
seed.sql           D1 seed inserts (generated)
wrangler.toml      Cloudflare config (set your database_id here)
```
