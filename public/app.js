/* K&P Restaurant Catalogue — frontend logic.
 *
 * Talks to the Cloudflare D1-backed API at /api/restaurants when reachable, and
 * transparently falls back to localStorage (seeded from seed-data.js) otherwise.
 */
(function () {
  "use strict";

  var API = "/api/restaurants";
  var LS_KEY = "kp_restaurants_v1";

  // Collapse any fine-grained cuisine into a broad country-of-origin bucket.
  // (Keeps older data stored in D1 consistent with the new categories.)
  var BROAD = {
    "Québécois": "French", "Brewpub": "French",
    "Lebanese": "Middle Eastern", "Mediterranean": "Middle Eastern", "Greek": "Middle Eastern",
    "Haitian": "Caribbean",
    "Café & Brunch": "Brunch", "Diner": "Brunch",
    "Canadian": "Canadian & Comfort", "Seafood": "Canadian & Comfort",
    "Comfort Food": "Canadian & Comfort", "Burgers": "Canadian & Comfort",
    "British Pub": "Canadian & Comfort", "Vegetarian": "Canadian & Comfort",
  };

  var state = {
    items: [],
    mode: "loading",
    search: "",
    sortBy: "avg-desc",
    cuisine: "",
  };

  /* ---------------- helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function uid() { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v) {
    if (v === "" || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function categoryOf(r) { var c = (r.cuisine || "Other"); return BROAD[c] || c; }
  function rankScore(r) {
    var vals = [];
    (r.visits || []).forEach(function (v) {
      if (v.k != null) vals.push(v.k);
      if (v.p != null) vals.push(v.p);
    });
    if (!vals.length) return -1;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function latestVisit(r) { var vs = r.visits || []; return vs.length ? vs[vs.length - 1] : null; }
  function fmt(n) {
    if (n == null) return "–";
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
  }
  function mapsUrl(r) {
    var q = encodeURIComponent([r.name, r.city].filter(Boolean).join(", "));
    return "https://www.google.com/maps/search/?api=1&query=" + q;
  }

  /* ---------------- data layer ---------------- */
  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var seed = (window.SEED_DATA || []).map(clone);
    saveLocal(seed);
    return seed;
  }
  function saveLocal(items) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch (e) {}
  }

  function init() {
    fetch(API, { headers: { accept: "application/json" } })
      .then(function (res) { if (!res.ok) throw new Error("api"); return res.json(); })
      .then(function (data) { state.mode = "cloud"; state.items = data.restaurants || []; afterLoad(); })
      .catch(function () { state.mode = "local"; state.items = loadLocal(); afterLoad(); });
  }

  function persist(item, isNew) {
    if (state.mode === "cloud") {
      var url = isNew ? API : API + "/" + encodeURIComponent(item.id);
      return fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item),
      }).then(function (res) { if (!res.ok) throw new Error("save"); return res.json(); });
    }
    var idx = state.items.findIndex(function (r) { return r.id === item.id; });
    if (idx >= 0) state.items[idx] = item; else state.items.push(item);
    saveLocal(state.items);
    return Promise.resolve(item);
  }

  function remove(id) {
    if (state.mode === "cloud") {
      return fetch(API + "/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function (res) { if (!res.ok) throw new Error("del"); });
    }
    state.items = state.items.filter(function (r) { return r.id !== id; });
    saveLocal(state.items);
    return Promise.resolve();
  }

  /* ---------------- rendering ---------------- */
  function afterLoad() {
    var badge = $("#syncBadge");
    if (state.mode === "cloud") {
      badge.textContent = "Synced"; badge.className = "sync-badge cloud";
      badge.title = "Saved to your Cloudflare database, shared across devices";
    } else {
      badge.textContent = "Saved on this device"; badge.className = "sync-badge";
      badge.title = "Connect the Cloudflare database to sync across devices";
    }
    renderChips();
    render();
  }

  function categoryCounts() {
    var counts = {};
    state.items.forEach(function (r) { var c = categoryOf(r); counts[c] = (counts[c] || 0) + 1; });
    return counts;
  }

  function renderChips() {
    var wrap = $("#cuisineChips");
    wrap.innerHTML = "";
    var counts = categoryCounts();
    var names = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); });
    wrap.appendChild(makeChip("", "All", state.items.length));
    names.forEach(function (c) { wrap.appendChild(makeChip(c, c, counts[c])); });

    var dl = $("#cuisineList");
    dl.innerHTML = "";
    names.forEach(function (c) { var o = document.createElement("option"); o.value = c; dl.appendChild(o); });
  }

  function makeChip(value, label, count) {
    var b = el("button", "chip-btn" + (state.cuisine === value ? " active" : ""));
    b.type = "button";
    b.appendChild(document.createTextNode(label));
    b.appendChild(el("span", "cnt", String(count)));
    b.addEventListener("click", function () {
      state.cuisine = state.cuisine === value ? "" : value;
      renderChips(); render();
      var active = $("#cuisineChips .chip-btn.active");
      if (active && active.scrollIntoView) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return b;
  }

  function visibleItems() {
    var q = state.search.trim().toLowerCase();
    var items = state.items.filter(function (r) {
      if (state.cuisine && categoryOf(r) !== state.cuisine) return false;
      if (!q) return true;
      return [r.name, categoryOf(r), r.city, r.comment].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    items.sort(sorter);
    return items;
  }
  function sorter(a, b) {
    switch (state.sortBy) {
      case "avg-asc": return rankScore(a) - rankScore(b);
      case "name-asc": return a.name.localeCompare(b.name);
      case "recent": return (b.sort || 0) - (a.sort || 0);
      default: return rankScore(b) - rankScore(a);
    }
  }

  function render() {
    var app = $("#app");
    app.innerHTML = "";
    var items = visibleItems();

    $("#statLine").textContent =
      state.items.length + " places · " + Object.keys(categoryCounts()).length + " cuisines";

    if (!items.length) {
      app.appendChild(el("p", "empty-state",
        state.items.length ? "Nothing matches that search." : "No places yet — add your first one."));
      return;
    }

    if (state.cuisine) {
      app.appendChild(groupSection(state.cuisine, items));
      return;
    }
    var groups = {};
    items.forEach(function (r) { var g = categoryOf(r); (groups[g] || (groups[g] = [])).push(r); });
    Object.keys(groups).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (g) {
      app.appendChild(groupSection(g, groups[g]));
    });
  }

  function groupSection(title, rows) {
    var section = el("section", "group");
    var head = el("div", "group-head");
    var t = el("div", "group-title");
    t.appendChild(document.createTextNode(title));
    t.appendChild(el("span", "gc", String(rows.length)));
    head.appendChild(t);
    head.appendChild(el("div", "col-label", "Kayla"));
    head.appendChild(el("div", "col-label", "Paul"));
    section.appendChild(head);
    rows.forEach(function (r) { section.appendChild(renderRow(r)); });
    return section;
  }

  function renderRow(r) {
    var row = el("button", "row");
    row.type = "button";

    var main = el("div", "row-main");
    main.appendChild(el("span", "row-name", r.name));
    var meta = el("span", "row-meta");
    var bits = [];
    if (r.city) bits.push(r.city);
    meta.appendChild(document.createTextNode(bits.join(" · ")));
    if ((r.visits || []).length > 1) {
      if (bits.length) meta.appendChild(document.createTextNode("  "));
      meta.appendChild(el("span", "rev", "↺ " + r.visits.length + " visits"));
    }
    main.appendChild(meta);
    row.appendChild(main);

    var last = latestVisit(r);
    row.appendChild(scoreCell(last ? last.k : null));
    row.appendChild(scoreCell(last ? last.p : null));

    row.addEventListener("click", function () { openDetail(r); });
    return row;
  }

  function scoreCell(v) {
    return el("span", "row-score" + (v == null ? " empty" : ""), fmt(v));
  }

  /* ---------------- detail sheet ---------------- */
  var detailDlg = $("#detail");
  var detailItem = null;

  function openDetail(r) {
    detailItem = r;
    var body = $("#detailBody");
    body.innerHTML = "";

    body.appendChild(el("h2", "detail-name", r.name));
    var sub = el("p", "detail-sub");
    var parts = [categoryOf(r)];
    if (r.city) parts.push(r.city);
    parts.forEach(function (p, i) {
      if (i) sub.appendChild(el("span", "dot", "·"));
      sub.appendChild(document.createTextNode(p));
    });
    body.appendChild(sub);

    var last = latestVisit(r);
    var scores = el("div", "detail-scores");
    scores.appendChild(detailScore("Kayla", last ? last.k : null));
    scores.appendChild(detailScore("Paul", last ? last.p : null));
    body.appendChild(scores);

    if ((r.visits || []).length > 1) {
      var hist = el("div", "detail-history");
      hist.appendChild(el("p", "dh-title", "Every visit"));
      r.visits.forEach(function (v, i) {
        var hr = el("div", "dh-row");
        hr.appendChild(el("span", "dh-when", v.label || ("Visit " + (i + 1))));
        hr.appendChild(el("span", null, fmt(v.k)));
        hr.appendChild(el("span", null, fmt(v.p)));
        hist.appendChild(hr);
      });
      body.appendChild(hist);
    }

    if (r.comment) {
      body.appendChild(el("p", "detail-notes-label", "Notes"));
      body.appendChild(el("p", "detail-notes", r.comment));
    }

    $("#detailMap").href = mapsUrl(r);
    openDialog(detailDlg);
  }

  function detailScore(name, v) {
    var d = el("div", "ds");
    d.appendChild(el("div", "ds-who", name));
    d.appendChild(el("div", "ds-num" + (v == null ? " empty" : ""), fmt(v)));
    return d;
  }

  /* ---------------- editor ---------------- */
  var dlg = $("#editor");
  var editing = null;

  function visitRow(v) {
    v = v || { label: "", k: "", p: "" };
    var row = el("div", "visit-row");
    var label = el("input", "label-input");
    label.placeholder = "Visit (e.g. 2025)"; label.value = v.label || ""; label.setAttribute("data-f", "label");
    var k = mkNumInput(v.k); k.setAttribute("data-f", "k");
    var p = mkNumInput(v.p); p.setAttribute("data-f", "p");
    var del = el("button", "del", "✕"); del.type = "button"; del.title = "Remove this visit";
    del.addEventListener("click", function () {
      var list = $("#visitsList");
      if (list.children.length > 1) row.remove();
      else showToast("Keep at least one visit", true);
    });
    row.appendChild(label); row.appendChild(k); row.appendChild(p); row.appendChild(del);
    return row;
  }
  function mkNumInput(val) {
    var i = el("input");
    i.type = "number"; i.step = "0.25"; i.min = "0"; i.max = "10"; i.inputMode = "decimal"; i.placeholder = "–";
    i.value = val == null ? "" : val;
    return i;
  }

  function openEditor(r) {
    editing = r ? r.id : null;
    $("#editorTitle").textContent = r ? "Edit place" : "Add a place";
    $("#f-name").value = r ? r.name : "";
    $("#f-cuisine").value = r ? categoryOf(r) : "";   // normalise to a broad bucket
    $("#f-city").value = r ? (r.city || "") : "Montreal";
    $("#f-comment").value = r ? (r.comment || "") : "";

    var list = $("#visitsList");
    list.innerHTML = "";
    var visits = (r && r.visits && r.visits.length) ? r.visits : [{ label: "", k: "", p: "" }];
    visits.forEach(function (v) { list.appendChild(visitRow(v)); });

    $("#deleteBtn").hidden = !r;
    openDialog(dlg);
    setTimeout(function () { $("#f-name").focus(); }, 30);
  }

  function collectForm() {
    var visits = [];
    $("#visitsList").querySelectorAll(".visit-row").forEach(function (row) {
      var label = $('[data-f="label"]', row).value.trim();
      var k = num($('[data-f="k"]', row).value);
      var p = num($('[data-f="p"]', row).value);
      if (label === "" && k == null && p == null) return;
      visits.push({ label: label, k: k, p: p });
    });
    if (!visits.length) visits.push({ label: "", k: null, p: null });
    var existing = editing ? state.items.find(function (x) { return x.id === editing; }) : null;
    return {
      id: editing || uid(),
      name: $("#f-name").value.trim(),
      cuisine: $("#f-cuisine").value.trim(),
      city: $("#f-city").value.trim(),
      comment: $("#f-comment").value.trim(),
      visits: visits,
      sort: existing ? existing.sort : (maxSort() + 1),
    };
  }
  function maxSort() { return state.items.reduce(function (m, r) { return Math.max(m, r.sort || 0); }, 0); }

  function onSubmit(e) {
    e.preventDefault();
    var item = collectForm();
    if (!item.name) { showToast("Please add a name", true); return; }
    var isNew = !editing;
    var btn = $("#saveBtn"); btn.disabled = true;
    persist(item, isNew)
      .then(function (saved) {
        saved = saved && saved.id ? saved : item;
        if (isNew) state.items.push(saved);
        else {
          var idx = state.items.findIndex(function (x) { return x.id === saved.id; });
          if (idx >= 0) state.items[idx] = saved;
        }
        renderChips(); render(); closeDialog(dlg);
        showToast(isNew ? "Added " + saved.name : "Saved changes");
      })
      .catch(function () { showToast("Couldn't save — try again", true); })
      .finally(function () { btn.disabled = false; });
  }

  function onDelete() {
    if (!editing) return;
    var r = state.items.find(function (x) { return x.id === editing; });
    if (!r) return;
    if (!confirm("Delete \"" + r.name + "\"? This can't be undone.")) return;
    var id = editing;
    remove(id)
      .then(function () {
        state.items = state.items.filter(function (x) { return x.id !== id; });
        if (state.cuisine && !categoryCounts()[state.cuisine]) state.cuisine = "";
        renderChips(); render(); closeDialog(dlg);
        showToast("Deleted " + r.name);
      })
      .catch(function () { showToast("Couldn't delete — try again", true); });
  }

  /* ---------------- dialog + toast ---------------- */
  function openDialog(d) {
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
  }
  function closeDialog(d) {
    if (typeof d.close === "function") d.close();
    else d.removeAttribute("open");
  }

  var toastTimer;
  function showToast(msg, isError) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, 2600);
  }

  /* ---------------- wiring ---------------- */
  function bind() {
    $("#addBtn").addEventListener("click", function () { openEditor(null); });
    $("#addVisitBtn").addEventListener("click", function () { $("#visitsList").appendChild(visitRow()); });
    $("#editorForm").addEventListener("submit", onSubmit);
    $("#cancelBtn").addEventListener("click", function () { closeDialog(dlg); });
    $("#closeEditor").addEventListener("click", function () { closeDialog(dlg); });
    $("#deleteBtn").addEventListener("click", onDelete);
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(dlg); });

    $("#closeDetail").addEventListener("click", function () { closeDialog(detailDlg); });
    detailDlg.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(detailDlg); });
    detailDlg.addEventListener("click", function (e) { if (e.target === detailDlg) closeDialog(detailDlg); });
    $("#detailEdit").addEventListener("click", function () {
      closeDialog(detailDlg);
      if (detailItem) openEditor(detailItem);
    });

    var searchEl = $("#search"), deb;
    searchEl.addEventListener("input", function () {
      clearTimeout(deb);
      deb = setTimeout(function () { state.search = searchEl.value; render(); }, 120);
    });
    $("#sortBy").addEventListener("change", function (e) { state.sortBy = e.target.value; render(); });
  }

  bind();
  init();
})();
