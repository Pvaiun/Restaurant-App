// Generates public/seed-data.js (for offline/localStorage mode) and seed.sql (for Cloudflare D1)
// from the raw restaurant list. Run with: node tools/gen-seed.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// --- Raw list. Section headers set the "city" context for Google Maps. ---
const RAW = `K-P
Le Nile Bleu - 2 - 0.5
Picks - 9 - 9
Bistro Tôt ou Tard - 8.25 - 8.25
Kagayaki - 9 - 9.75
Sushi Momo - 9.25 - 9.25
Tacos Tin Tan - 8.25 - 7.75
Le P'tit Rustik - 8.75 - 8.25 - 2025 - 7.5 - 7.5
Pho Nguyen - 8 - 8
Dandy - 9.25 - 9
Le Toaster - 8.75 - 8.5
Le Mekong - 7 - 6.75
Muru Crêpes - 9 - 8
India Rosa Griffintown - 7 - 5
L'Gros Luxe - 5 - 4
Chef Lee - 8.25 - 9.25
Pho Saigon Vietnam - 9 - 9.25
Resto Végo - 8.25 - 7
Bun Mam Ninh Kieu - 9.5 - 9.25
3 Brasseurs - 5 - 4.75
Restaurant Coréen Luna - 8 - 7.5
Tsukuyomi Ramen Crescent - 8 - 7.5
Ramen cubby hole - 7 - 7
Jako - 6 - 6.5
Omnivore - 8.75 - 8.75
Nouilles Yunan - 6.75 - 6
Icehouse - 8 - 7.5
Chu Chai - 9.5 - 8.5
Nos The - 6 - 5
Ginko - 6.5 - 5
Bvrger 7.5 - 7
Mimosa café - 6 - 5.5
Yokato Yokabai - 4 - 5
Shushu Thai - 8 - 8.25
Sunny Dinette - 6 - 7.75
Maison v.i.p - 9 - 9
Ches's - 6.75 - 7.75
Sun Sushi - 9 - 7.5
Mallard Cottage 10 - 10
Bazar Café - 8.5- 8.25
Queen Sheba - 2 - 1
Desi Indian - 6 - 5
Shushu Ramen - 8 - 8
Moa Moa - 9.5 - 9.25
Escondite Drummond - 8.75 - 8.75
Kim Galbi - 7.5 - 7.5 (8.5 level food, but big portions and v expensive)
Au Pain Perdu - 8.5 - 8.25
Burgundy Lion - 8.75 - 5
Haidalio hot pot - 8 - 8
Bagel etc - 8 - 6.5
Le Petit Saigon (Victoria) - 7 - 6.75
JAM Cafe (Vancouver) - 8.75 - 8.5
Bvrger Fiancé - 8.5 - 3.5
MONO - 8.5 - 8.75
Bloom Sushi - 9 - 8.25
Rendez-vous Bistro Indien - 9 - 10
Kiodai Izakaya - 5.5 - 5.5
Katsuya - 8 - 8.25
Bistro King Creole - 9 - 8.75
Greenspot - 7 - 8
Trattoria Trestevere - 7 - 7
Dobe & Andy - 8 - 9
L'Oeufrier - 8.5 - 6.5
Lulu Épicerie - 8.75 - 8.75
Lali's - 8.75 - 8.75
Kinton Ramen Westmount - 8.5 - 7.5
Foeigwa Brunch - 8.75 - 8
Quoi de neuf - 8 - 8
Louis Pizza (Ottawa) 10 - 10
Zak's (Ottawa) - 9 - 7.5
Garden Room - 8.5 - 4
Shawarma Palace (Ottawa) - 7 - 8
Souvlaki Grec Plus - 7.5 - 7.5
Bismillah Poulet Grillé Cuisine Indienne - 8 - 8
Aqua E Farina - 4 - 1
Joyo Burger Wellington - 8 - 7.5
The Sparrow - 8 - 9.5
Luyishou Fondue - 9 - 9.25
House of Taste - 7 - 8.25
Millmans - 7- 7
Neotokyo - 8 - 8.5
NEWFOUNDLAND RESTAURANTS
The Big R - 7.5 - 6
Dock Marina - 9 - 8.75
Skippers - 7 - 9
Lovely Grand - 9 - 7.5
Quintal Cafe - 10 - 9.5
Annie's in Twillingate - 7 - 3
BACK TO MONTREAL
Ma Poule Mouillée - 8 - 9.5
Kinton Ramen Square Victoria - 8 - 8
Sammi Soup Dumpling - 8.5 - 7.5
Tacos Lakalaka - 5 - 4
3 Madames - 9 - 7.5
Le Petit Dek Sen - 8 - 8.5
Siwalee - 9 - 9
Harbin St Denis - 6 - 7
Cora - 8.25 - 3
Pho Ahn Express - 9 - 9.25
Escondite Union - 8.75 - 8.75`;

// --- Cuisine assignments by name (best-guess; trivially editable in the app). ---
const CUISINE = {
  "Le Nile Bleu": "Ethiopian",
  "Picks": "Canadian",
  "Bistro Tôt ou Tard": "French",
  "Kagayaki": "Japanese",
  "Sushi Momo": "Japanese",
  "Tacos Tin Tan": "Mexican",
  "Le P'tit Rustik": "Québécois",
  "Pho Nguyen": "Vietnamese",
  "Dandy": "Café & Brunch",
  "Le Toaster": "Café & Brunch",
  "Le Mekong": "Vietnamese",
  "Muru Crêpes": "Café & Brunch",
  "India Rosa Griffintown": "Indian",
  "L'Gros Luxe": "Comfort Food",
  "Chef Lee": "Korean",
  "Pho Saigon Vietnam": "Vietnamese",
  "Resto Végo": "Vegetarian",
  "Bun Mam Ninh Kieu": "Vietnamese",
  "3 Brasseurs": "Brewpub",
  "Restaurant Coréen Luna": "Korean",
  "Tsukuyomi Ramen Crescent": "Japanese",
  "Ramen cubby hole": "Japanese",
  "Jako": "Japanese",
  "Omnivore": "Lebanese",
  "Nouilles Yunan": "Chinese",
  "Icehouse": "Mexican",
  "Chu Chai": "Thai",
  "Nos The": "Café & Brunch",
  "Ginko": "Japanese",
  "Bvrger": "Burgers",
  "Mimosa café": "Café & Brunch",
  "Yokato Yokabai": "Japanese",
  "Shushu Thai": "Thai",
  "Sunny Dinette": "Diner",
  "Maison v.i.p": "Chinese",
  "Ches's": "Seafood",
  "Sun Sushi": "Japanese",
  "Mallard Cottage": "Canadian",
  "Bazar Café": "Café & Brunch",
  "Queen Sheba": "Ethiopian",
  "Desi Indian": "Indian",
  "Shushu Ramen": "Japanese",
  "Moa Moa": "Korean",
  "Escondite Drummond": "Mexican",
  "Kim Galbi": "Korean",
  "Au Pain Perdu": "Café & Brunch",
  "Burgundy Lion": "British Pub",
  "Haidalio hot pot": "Chinese",
  "Bagel etc": "Café & Brunch",
  "Le Petit Saigon": "Vietnamese",
  "JAM Cafe": "Café & Brunch",
  "Bvrger Fiancé": "Burgers",
  "MONO": "Korean",
  "Bloom Sushi": "Japanese",
  "Rendez-vous Bistro Indien": "Indian",
  "Kiodai Izakaya": "Japanese",
  "Katsuya": "Japanese",
  "Bistro King Creole": "Caribbean",
  "Greenspot": "Diner",
  "Trattoria Trestevere": "Italian",
  "Dobe & Andy": "Chinese",
  "L'Oeufrier": "Café & Brunch",
  "Lulu Épicerie": "Mediterranean",
  "Lali's": "Indian",
  "Kinton Ramen Westmount": "Japanese",
  "Foeigwa Brunch": "Café & Brunch",
  "Quoi de neuf": "Café & Brunch",
  "Louis Pizza": "Italian",
  "Zak's": "Diner",
  "Garden Room": "Café & Brunch",
  "Shawarma Palace": "Middle Eastern",
  "Souvlaki Grec Plus": "Greek",
  "Bismillah Poulet Grillé Cuisine Indienne": "Indian",
  "Aqua E Farina": "Italian",
  "Joyo Burger Wellington": "Burgers",
  "The Sparrow": "Café & Brunch",
  "Luyishou Fondue": "Chinese",
  "House of Taste": "Middle Eastern",
  "Millmans": "Café & Brunch",
  "Neotokyo": "Japanese",
  "The Big R": "Diner",
  "Dock Marina": "Seafood",
  "Skippers": "Seafood",
  "Lovely Grand": "Canadian",
  "Quintal Cafe": "Café & Brunch",
  "Annie's in Twillingate": "Seafood",
  "Ma Poule Mouillée": "Haitian",
  "Kinton Ramen Square Victoria": "Japanese",
  "Sammi Soup Dumpling": "Chinese",
  "Tacos Lakalaka": "Mexican",
  "3 Madames": "Café & Brunch",
  "Le Petit Dek Sen": "Thai",
  "Siwalee": "Thai",
  "Harbin St Denis": "Chinese",
  "Cora": "Café & Brunch",
  "Pho Ahn Express": "Vietnamese",
  "Escondite Union": "Mexican",
};

const PAREN_CITY = { Ottawa: "Ottawa", Vancouver: "Vancouver", Victoria: "Victoria, BC" };

function parse(raw) {
  const out = [];
  let city = "Montreal";
  let order = 0;
  for (const lineRaw of raw.split("\n")) {
    const line = lineRaw.trim();
    if (!line || line === "K-P") continue;
    if (line === "NEWFOUNDLAND RESTAURANTS") { city = "Newfoundland"; continue; }
    if (line === "BACK TO MONTREAL") { city = "Montreal"; continue; }

    let work = line;
    let comment = "";
    let rowCity = city;

    // Pull out a trailing/inline parenthetical: city marker or free-text note.
    const paren = work.match(/\(([^)]*)\)/);
    if (paren) {
      const inside = paren[1].trim();
      if (PAREN_CITY[inside]) rowCity = PAREN_CITY[inside];
      else comment = inside;
      work = work.replace(paren[0], " ").replace(/\s+/g, " ").trim();
    }

    // Scores are the trailing run of numbers/dashes/years (handles names that
    // start with a digit, e.g. "3 Brasseurs"). Name is whatever precedes them.
    const scoreMatch = work.match(/[\s-]*\d[\d.\s-]*$/);
    const scorePart = scoreMatch ? scoreMatch[0] : "";
    const name = work.slice(0, work.length - scorePart.length).replace(/[-\s]+$/, "").trim();

    // All numeric tokens, in order. Years (>= 1900) delimit a new visit.
    const nums = (scorePart.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const visits = [];
    let cur = { label: "", scores: [] };
    for (const n of nums) {
      if (n >= 1900) {
        if (cur.scores.length) visits.push(cur);
        cur = { label: String(n), scores: [] };
      } else {
        cur.scores.push(n);
      }
    }
    if (cur.scores.length) visits.push(cur);

    const visitObjs = visits.map((v) => ({
      label: v.label,
      k: v.scores[0] ?? null,
      p: v.scores[1] ?? null,
    }));

    out.push({
      id: "r" + String(++order).padStart(3, "0"),
      name,
      cuisine: CUISINE[name] || "Other",
      city: rowCity,
      comment,
      visits: visitObjs,
      sort: order,
    });
  }
  return out;
}

const data = parse(RAW);

// Sanity check: warn on rows missing a cuisine or scores.
for (const r of data) {
  if (r.cuisine === "Other") console.warn("No cuisine for:", r.name);
  if (!r.visits.length || r.visits.some((v) => v.k == null || v.p == null))
    console.warn("Score parse issue:", r.name, JSON.stringify(r.visits));
}

// --- Emit public/seed-data.js ---
const jsBody =
  "// AUTO-GENERATED by tools/gen-seed.mjs — do not edit by hand.\n" +
  "window.SEED_DATA = " +
  JSON.stringify(data, null, 2) +
  ";\n";
mkdirSync(ROOT + "/public", { recursive: true });
writeFileSync(ROOT + "/public/seed-data.js", jsBody);

// --- Emit src/seeddata.js (ESM) for D1 auto-seeding in the Worker ---
const esmBody =
  "// AUTO-GENERATED by tools/gen-seed.mjs — do not edit by hand.\n" +
  "export const SEED = " +
  JSON.stringify(data, null, 2) +
  ";\n";
mkdirSync(ROOT + "/src", { recursive: true });
writeFileSync(ROOT + "/src/seeddata.js", esmBody);

// --- Emit seed.sql for Cloudflare D1 ---
const esc = (s) => String(s).replace(/'/g, "''");
let sql = "-- AUTO-GENERATED by tools/gen-seed.mjs — do not edit by hand.\n";
sql += "DELETE FROM restaurants;\n";
for (const r of data) {
  sql +=
    `INSERT INTO restaurants (id, name, cuisine, city, comment, visits, sort) VALUES (` +
    `'${esc(r.id)}', '${esc(r.name)}', '${esc(r.cuisine)}', '${esc(r.city)}', ` +
    `'${esc(r.comment)}', '${esc(JSON.stringify(r.visits))}', ${r.sort});\n`;
}
writeFileSync(ROOT + "/seed.sql", sql);

console.log(`Generated ${data.length} restaurants -> public/seed-data.js, seed.sql`);
