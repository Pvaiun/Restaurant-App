// GET    /api/restaurants/:id  -> fetch one
// PUT    /api/restaurants/:id  -> update
// DELETE /api/restaurants/:id  -> delete
import { json, rowToObj, sanitize, ensureReady, upsert } from "../../_db.js";

function noDb() {
  return json({ error: "D1 database not bound. Set up the 'DB' binding (see README)." }, 500);
}

export async function onRequestGet({ env, params }) {
  if (!env.DB) return noDb();
  await ensureReady(env.DB);
  const row = await env.DB.prepare("SELECT * FROM restaurants WHERE id = ?").bind(params.id).first();
  if (!row) return json({ error: "Not found" }, 404);
  return json(rowToObj(row));
}

export async function onRequestPut({ env, request, params }) {
  if (!env.DB) return noDb();
  await ensureReady(env.DB);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }

  const existing = await env.DB.prepare("SELECT sort FROM restaurants WHERE id = ?").bind(params.id).first();
  const fallbackSort = existing ? existing.sort : 0;
  const rec = sanitize(body, params.id, fallbackSort);
  if (!rec.name) return json({ error: "Name is required" }, 400);
  await upsert(env.DB, rec);
  return json(rec);
}

export async function onRequestDelete({ env, params }) {
  if (!env.DB) return noDb();
  await ensureReady(env.DB);
  await env.DB.prepare("DELETE FROM restaurants WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
