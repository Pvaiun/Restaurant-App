// D1 helpers for the K&P Restaurant Catalogue Worker.
import { SEED } from "./seeddata.js";

export function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function rowToObj(row) {
  let visits = [];
  try { visits = JSON.parse(row.visits || "[]"); } catch (e) { visits = []; }
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine || "",
    city: row.city || "",
    comment: row.comment || "",
    visits: visits,
    sort: row.sort || 0,
  };
}

// Coerce arbitrary client input into a clean, storable restaurant record.
export function sanitize(input, id, fallbackSort) {
  const visits = Array.isArray(input && input.visits) ? input.visits : [];
  const cleanVisits = visits.map((v) => ({
    label: String((v && v.label) || "").slice(0, 60),
    k: numOrNull(v && v.k),
    p: numOrNull(v && v.p),
  }));
  if (!cleanVisits.length) cleanVisits.push({ label: "", k: null, p: null });
  return {
    id: id,
    name: String((input && input.name) || "").slice(0, 120).trim(),
    cuisine: String((input && input.cuisine) || "").slice(0, 60).trim(),
    city: String((input && input.city) || "").slice(0, 80).trim(),
    comment: String((input && input.comment) || "").slice(0, 2000),
    visits: cleanVisits,
    sort: Number.isFinite(input && input.sort) ? input.sort : fallbackSort,
  };
}

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}

// Idempotent table creation + first-run seeding.
export async function ensureReady(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS restaurants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cuisine TEXT,
        city TEXT,
        comment TEXT,
        visits TEXT,
        sort INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      )`
    )
    .run();

  const { results } = await db.prepare("SELECT COUNT(*) AS n FROM restaurants").all();
  const count = results && results[0] ? results[0].n : 0;
  if (count > 0) return;

  const now = Date.now();
  const stmts = SEED.map((r) =>
    db
      .prepare(
        `INSERT INTO restaurants (id, name, cuisine, city, comment, visits, sort, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(r.id, r.name, r.cuisine, r.city, r.comment, JSON.stringify(r.visits), r.sort, now)
  );
  if (stmts.length) await db.batch(stmts);
}

export async function upsert(db, r) {
  await db
    .prepare(
      `INSERT INTO restaurants (id, name, cuisine, city, comment, visits, sort, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, cuisine=excluded.cuisine, city=excluded.city,
         comment=excluded.comment, visits=excluded.visits, sort=excluded.sort,
         updated_at=excluded.updated_at`
    )
    .bind(r.id, r.name, r.cuisine, r.city, r.comment, JSON.stringify(r.visits), r.sort, Date.now())
    .run();
  return r;
}
