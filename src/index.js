// Cloudflare Worker for the K&P Restaurant Catalogue.
//
// Routing:
//   /api/restaurants        GET (list, auto-seeds) · POST (create)
//   /api/restaurants/:id    GET · PUT · DELETE
//   /api/cuisines           GET (list) · POST (add)
//   /api/cuisines/:name     DELETE
//   everything else         served from the static assets in /public
import { json, rowToObj, sanitize, ensureReady, upsert, listCuisines } from "./db.js";

function noDb() {
  return json({ error: "D1 database not connected yet. Add a D1 binding named 'DB' (see README)." }, 503);
}
async function readJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

async function handleRestaurants(request, env, pathname) {
  const db = env.DB;
  const parts = pathname.replace(/^\/api\/restaurants\/?/, "").split("/").filter(Boolean);
  const id = parts.length ? decodeURIComponent(parts[0]) : null;
  const method = request.method.toUpperCase();
  await ensureReady(db);

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

async function handleCuisines(request, env, pathname) {
  const db = env.DB;
  const method = request.method.toUpperCase();
  await ensureReady(db);

  const rest = pathname.replace(/^\/api\/cuisines\/?/, "");
  const name = rest ? decodeURIComponent(rest).trim() : null;

  if (!name) {
    if (method === "GET") return json({ cuisines: await listCuisines(db) });
    if (method === "POST") {
      const body = await readJson(request);
      const newName = body && body.name ? String(body.name).slice(0, 60).trim() : "";
      if (!newName) return json({ error: "Name is required" }, 400);
      const { results } = await db.prepare("SELECT MAX(sort) AS m FROM cuisines").all();
      const nextSort = ((results && results[0] && results[0].m) || 0) + 1;
      await db.prepare("INSERT OR IGNORE INTO cuisines (name, sort) VALUES (?, ?)").bind(newName, nextSort).run();
      return json({ cuisines: await listCuisines(db) }, 201);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  if (method === "DELETE") {
    const used = await db.prepare("SELECT COUNT(*) AS n FROM restaurants WHERE cuisine = ?").bind(name).first();
    if (used && used.n > 0) return json({ error: "Cuisine is in use" }, 409);
    await db.prepare("DELETE FROM cuisines WHERE name = ?").bind(name).run();
    return json({ cuisines: await listCuisines(db) });
  }
  return json({ error: "Method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === "/api/restaurants" || p.startsWith("/api/restaurants/")) {
      if (!env.DB) return noDb();
      return handleRestaurants(request, env, p);
    }
    if (p === "/api/cuisines" || p.startsWith("/api/cuisines/")) {
      if (!env.DB) return noDb();
      return handleCuisines(request, env, p);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
