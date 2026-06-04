// Cloudflare Worker for the K&P Restaurant Catalogue.
//
// Routing:
//   /api/restaurants        GET (list, auto-seeds) · POST (create)
//   /api/restaurants/:id    GET · PUT · DELETE
//   everything else         served from the static assets in /public
//
// Static assets are served by the [assets] binding configured in wrangler.toml.
import { json, rowToObj, sanitize, ensureReady, upsert } from "./db.js";

function noDb() {
  return json(
    { error: "D1 database not connected yet. Add a D1 binding named 'DB' (see README)." },
    503
  );
}

async function handleApi(request, env, pathname) {
  const db = env.DB;
  const parts = pathname.replace(/^\/api\/restaurants\/?/, "").split("/").filter(Boolean);
  const id = parts.length ? decodeURIComponent(parts[0]) : null;
  const method = request.method.toUpperCase();

  if (!db) return noDb();
  await ensureReady(db);

  // Collection: /api/restaurants
  if (!id) {
    if (method === "GET") {
      const { results } = await db.prepare("SELECT * FROM restaurants ORDER BY sort ASC").all();
      return json({ restaurants: (results || []).map(rowToObj) });
    }
    if (method === "POST") {
      const body = await readJson(request);
      if (body === null) return json({ error: "Invalid JSON" }, 400);
      const newId = body.id ? String(body.id).slice(0, 40) : "r" + Date.now().toString(36);
      const { results } = await db.prepare("SELECT MAX(sort) AS m FROM restaurants").all();
      const nextSort = ((results && results[0] && results[0].m) || 0) + 1;
      const rec = sanitize(body, newId, nextSort);
      if (!rec.name) return json({ error: "Name is required" }, 400);
      await upsert(db, rec);
      return json(rec, 201);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  // Single item: /api/restaurants/:id
  if (method === "GET") {
    const row = await db.prepare("SELECT * FROM restaurants WHERE id = ?").bind(id).first();
    return row ? json(rowToObj(row)) : json({ error: "Not found" }, 404);
  }
  if (method === "PUT") {
    const body = await readJson(request);
    if (body === null) return json({ error: "Invalid JSON" }, 400);
    const existing = await db.prepare("SELECT sort FROM restaurants WHERE id = ?").bind(id).first();
    const rec = sanitize(body, id, existing ? existing.sort : 0);
    if (!rec.name) return json({ error: "Name is required" }, 400);
    await upsert(db, rec);
    return json(rec);
  }
  if (method === "DELETE") {
    await db.prepare("DELETE FROM restaurants WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}

async function readJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname);
    }
    // Fall through to static assets (index.html, app.js, styles.css, …).
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
