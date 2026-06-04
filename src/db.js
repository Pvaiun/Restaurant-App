// D1 helpers for the K&P Restaurant Catalogue Worker.
import { SEED } from "./seeddata.js";

// The canonical starter set of broad, country-of-origin cuisines.
export const BUILTIN_CUISINES = [
  "Brunch", "Canadian & Comfort", "Caribbean", "Chinese", "Ethiopian", "French",
  "Indian", "Italian", "Japanese", "Korean", "Mexican", "Middle Eastern",
  "Thai", "Vietnamese",
];

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
    date: cleanDate(v && v.date),
    k: numOrNull(v && v.k),
    p: numOrNull(v && v.p),
  }));
  if (!cleanVisits.length) cleanVisits.push({ date: "", k: null, p: null });
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
// Visit dates are month + year, stored as "YYYY-MM".
function cleanDate(v) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : "";
}

// Idempotent schema creation + first-run seeding (restaurants and cuisines).
export async function ensureReady(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, cuisine TEXT, city TEXT,
      comment TEXT, visits TEXT, sort INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0
    )`
  ).run();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS cuisines (
      name TEXT PRIMARY KEY COLLATE NOCASE, sort INTEGER DEFAULT 0
    )`
  ).run();

  const r = await db.prepare("SELECT COUNT(*) AS n FROM restaurants").all();
  if (!(r.results && r.results[0] && r.results[0].n)) {
    const now = Date.now();
    const stmts = SEED.map((x) =>
      db.prepare(
        `INSERT INTO restaurants (id, name, cuisine, city, comment, visits, sort, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(x.id, x.name, x.cuisine, x.city, x.comment, JSON.stringify(x.visits), x.sort, now)
    );
    if (stmts.length) await db.batch(stmts);
  }

  const c = await db.prepare("SELECT COUNT(*) AS n FROM cuisines").all();
  if (!(c.results && c.results[0] && c.results[0].n)) {
    const stmts = BUILTIN_CUISINES.map((name, i) =>
      db.prepare("INSERT OR IGNORE INTO cuisines (name, sort) VALUES (?, ?)").bind(name, i)
    );
    if (stmts.length) await db.batch(stmts);
  }

  await db.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)").run();
  await backfillDates(db);
}

// One-time: copy the SEED's placeholder visit dates onto any existing rows whose
// visits still have no dates (older data seeded before dates existed).
async function backfillDates(db) {
  const done = await db.prepare("SELECT v FROM meta WHERE k = 'placeholder_dates'").first();
  if (done) return;

  const seedById = {};
  for (const s of SEED) seedById[s.id] = s;
  const { results } = await db.prepare("SELECT id, visits FROM restaurants").all();
  const stmts = [];
  for (const row of results || []) {
    const seed = seedById[row.id];
    if (!seed) continue;
    let visits;
    try { visits = JSON.parse(row.visits || "[]"); } catch (e) { continue; }
    let changed = false;
    visits.forEach((v, i) => {
      if ((!v.date || v.date === "") && seed.visits[i] && seed.visits[i].date) {
        v.date = seed.visits[i].date;
        changed = true;
      }
    });
    if (changed) stmts.push(db.prepare("UPDATE restaurants SET visits = ? WHERE id = ?").bind(JSON.stringify(visits), row.id));
  }
  if (stmts.length) await db.batch(stmts);
  await db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('placeholder_dates', '1')").run();
}

export async function upsert(db, r) {
  await db.prepare(
    `INSERT INTO restaurants (id, name, cuisine, city, comment, visits, sort, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, cuisine=excluded.cuisine, city=excluded.city,
       comment=excluded.comment, visits=excluded.visits, sort=excluded.sort,
       updated_at=excluded.updated_at`
  ).bind(r.id, r.name, r.cuisine, r.city, r.comment, JSON.stringify(r.visits), r.sort, Date.now()).run();
  return r;
}

export async function listCuisines(db) {
  const { results } = await db.prepare("SELECT name FROM cuisines ORDER BY name COLLATE NOCASE").all();
  return (results || []).map((r) => r.name);
}
