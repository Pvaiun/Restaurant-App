// GET  /api/restaurants        -> list all (auto-creates + seeds DB on first run)
// POST /api/restaurants        -> create a new restaurant
import { json, rowToObj, sanitize, ensureReady, upsert } from "../../_db.js";

function noDb() {
  return json({ error: "D1 database not bound. Set up the 'DB' binding (see README)." }, 500);
}

export async function onRequestGet({ env }) {
  if (!env.DB) return noDb();
  await ensureReady(env.DB);
  const { results } = await env.DB
    .prepare("SELECT * FROM restaurants ORDER BY sort ASC")
    .all();
  return json({ restaurants: (results || []).map(rowToObj) });
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return noDb();
  await ensureReady(env.DB);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }

  const id = body && body.id ? String(body.id).slice(0, 40) : "r" + Date.now().toString(36);
  const { results } = await env.DB.prepare("SELECT MAX(sort) AS m FROM restaurants").all();
  const nextSort = ((results && results[0] && results[0].m) || 0) + 1;

  const rec = sanitize(body, id, nextSort);
  if (!rec.name) return json({ error: "Name is required" }, 400);
  await upsert(env.DB, rec);
  return json(rec, 201);
}
