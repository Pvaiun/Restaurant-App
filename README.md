# 🍽️ Kayla & Paul — Restaurant Catalogue

A little web app to catalogue the restaurants you've visited, grouped **by cuisine**, with:

- **Dual ratings** — a Kayla (K) and a Paul (P) score for every place, plus an auto-calculated overall score.
- **Comments** — tasting notes, what to order, who you went with.
- **Google Maps** — every card has a "📍 Maps" button that searches the restaurant by name + city.
- **Re-visits** — log multiple visits per restaurant (e.g. a `2025` re-visit). The newest visit drives the headline K/P scores, and the overall score averages everything.
- **Search, group & sort** — group by cuisine or city, sort by score / name / recency, filter by cuisine, full-text search.

It runs as a **Cloudflare Worker** that serves the static site and a small JSON API
backed by **Cloudflare D1**. Until D1 is connected (or if you just open the file
locally), it falls back to the browser's own storage so it always works.

---

## Deploy from your phone (no computer needed)

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Import a repository**.
3. Pick the `restaurant-app` repo and the branch `claude/restaurant-rating-app-vfDwT`.
4. Leave the build command as the default (`npx wrangler deploy`) and click **Deploy**.

You'll get a URL like `kp-restaurants.<you>.workers.dev`. Open it on your phone —
the full list is there. The badge in the corner reads **● This device**, meaning
edits are saved in that browser only.

### Turn on cloud sync (data saved on Cloudflare, shared across devices)

1. Dashboard → **Storage & Databases → D1** → **Create database**, name it
   **`kp-restaurants`**. Copy the **Database ID** it shows.
2. Edit **`wrangler.toml`** (GitHub's web editor works fine on a phone): uncomment
   the `[[d1_databases]]` block at the bottom and paste your Database ID.
3. Commit — Cloudflare auto-redeploys. The table creates and seeds itself on first
   load, the badge switches to **☁ Cloudflare**, and every device shares the data.

---

## Deploy / develop from a computer (optional)

```bash
npm install
npx wrangler login

# create the D1 database, paste the printed id into wrangler.toml (uncomment the block)
npm run db:create

npm run deploy            # live on *.workers.dev
# or
npm run dev               # local dev server with the API
```

The API auto-creates and seeds the table on first request. To load the seed
manually instead: `npm run db:seed:remote`.

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
- `visits` is ordered oldest → newest. Add a visit (with an optional label like a
  year) instead of overwriting, to keep the history.

## Editing the seed list

The starter list lives in `tools/gen-seed.mjs` (raw text + a cuisine lookup).
After changing it, regenerate the derived files:

```bash
npm run gen   # rewrites public/seed-data.js, src/seeddata.js, seed.sql
```

> Cuisines were auto-assigned as a best guess — a few may be off (e.g. `Lali's`).
> Just hit **✎ Edit** on any card to fix the cuisine, scores, city or notes.

## Project layout

```
public/            Static site (served by the Worker's asset binding)
  index.html
  styles.css
  app.js           Frontend logic + API client w/ localStorage fallback
  seed-data.js     Bundled starter data (generated)
src/               The Cloudflare Worker
  index.js         Router: /api/* -> D1, everything else -> static assets
  db.js            D1 helpers (schema, seed, sanitise, upsert)
  seeddata.js      Seed data for the API (generated)
tools/gen-seed.mjs Generator for the seed files
schema.sql         D1 table definition
seed.sql           D1 seed inserts (generated)
wrangler.toml      Cloudflare config (uncomment the D1 block to enable sync)
```
