/* K&P Restaurant Catalogue — frontend logic.
 *
 * Talks to the Cloudflare D1-backed API when reachable (restaurants + cuisines),
 * and falls back to localStorage (seeded from seed-data.js) otherwise.
 */
(function () {
  "use strict";

  var API = "/api/restaurants";
  var CUISINE_API = "/api/cuisines";
  var LS_ITEMS = "kp_restaurants_v1";
  var LS_CUISINES = "kp_cuisines_v1";

  var BUILTIN_CUISINES = [
    "Brunch", "Canadian & Comfort", "Caribbean", "Chinese", "Ethiopian", "French",
    "Indian", "Italian", "Japanese", "Korean", "Mexican", "Middle Eastern",
    "Thai", "Vietnamese",
  ];
  // Map any legacy fine-grained cuisine to its broad bucket.
  var BROAD = {
    "Québécois": "French", "Brewpub": "French",
    "Lebanese": "Middle Eastern", "Mediterranean": "Middle Eastern", "Greek": "Middle Eastern",
    "Haitian": "Caribbean",
    "Café & Brunch": "Brunch", "Diner": "Brunch",
    "Canadian": "Canadian & Comfort", "Seafood": "Canadian & Comfort",
    "Comfort Food": "Canadian & Comfort", "Burgers": "Canadian & Comfort",
    "British Pub": "Canadian & Comfort", "Vegetarian": "Canadian & Comfort",
  };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var state = {
    items: [],
    cuisines: [],
    mode: "loading",
    search: "",
    sort: { key: "date", dir: "desc" }, // default: newest
    exCuisine: new Set(),               // excluded cuisines (empty = all shown)
    exCity: new Set(),                  // excluded cities
  };

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function uid() { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v) { if (v === "" || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function categoryOf(r) { var c = r.cuisine || "Other"; return BROAD[c] || c; }
  function latestVisit(r) { var vs = r.visits || []; return vs.length ? vs[vs.length - 1] : null; }
  function scoreVal(r, key) { var v = latestVisit(r); return v && v[key] != null ? v[key] : null; }
  function latestDate(r) {
    var ds = (r.visits || []).map(function (v) { return v.date || ""; }).filter(Boolean).sort();
    return ds.length ? ds[ds.length - 1] : "";
  }
  function fmt(n) { if (n == null) return "–"; return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""); }
  function fmtMonth(s) {
    var m = /^(\d{4})-(\d{2})$/.exec(s || "");
    if (!m) return "";
    return MONTHS[(+m[2]) - 1] + " " + m[1];
  }
  function currentMonth() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function mapsUrl(r) {
    var q = encodeURIComponent([r.name, r.city].filter(Boolean).join(", "));
    return "https://www.google.com/maps/search/?api=1&query=" + q;
  }
  function cityOf(r) { return r.city || "—"; }

  /* ---------------- data layer ---------------- */
  function dataCuisines() {
    var set = {};
    state.items.forEach(function (r) { set[categoryOf(r)] = true; });
    return Object.keys(set);
  }
  function defaultCuisines() {
    var set = {};
    BUILTIN_CUISINES.concat(dataCuisines()).forEach(function (c) { set[c] = true; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }
  function loadLocalItems() {
    try { var raw = localStorage.getItem(LS_ITEMS); if (raw) return JSON.parse(raw); } catch (e) {}
    var seed = (window.SEED_DATA || []).map(clone);
    saveLocalItems(seed);
    return seed;
  }
  function saveLocalItems(items) { try { localStorage.setItem(LS_ITEMS, JSON.stringify(items)); } catch (e) {} }
  function loadLocalCuisines() {
    try { var raw = localStorage.getItem(LS_CUISINES); if (raw) return JSON.parse(raw); } catch (e) {}
    var c = defaultCuisines(); saveLocalCuisines(c); return c;
  }
  function saveLocalCuisines(c) { try { localStorage.setItem(LS_CUISINES, JSON.stringify(c)); } catch (e) {} }

  function init() {
    fetch(API, { headers: { accept: "application/json" } })
      .then(function (res) { if (!res.ok) throw new Error("api"); return res.json(); })
      .then(function (data) {
        state.mode = "cloud";
        state.items = data.restaurants || [];
        return fetch(CUISINE_API).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (cj) { state.cuisines = (cj && cj.cuisines && cj.cuisines.length) ? cj.cuisines : defaultCuisines(); });
      })
      .then(afterLoad)
      .catch(function () {
        state.mode = "local";
        state.items = loadLocalItems();
        state.cuisines = loadLocalCuisines();
        afterLoad();
      });
  }

  function persistItem(item, isNew) {
    if (state.mode === "cloud") {
      var url = isNew ? API : API + "/" + encodeURIComponent(item.id);
      return fetch(url, { method: isNew ? "POST" : "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(item) })
        .then(function (res) { if (!res.ok) throw new Error("save"); return res.json(); });
    }
    var idx = state.items.findIndex(function (r) { return r.id === item.id; });
    if (idx >= 0) state.items[idx] = item; else state.items.push(item);
    saveLocalItems(state.items);
    return Promise.resolve(item);
  }
  function removeItem(id) {
    if (state.mode === "cloud") {
      return fetch(API + "/" + encodeURIComponent(id), { method: "DELETE" }).then(function (res) { if (!res.ok) throw new Error("del"); });
    }
    state.items = state.items.filter(function (r) { return r.id !== id; });
    saveLocalItems(state.items);
    return Promise.resolve();
  }
  function addCuisineRemote(name) {
    if (state.mode === "cloud") {
      return fetch(CUISINE_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name }) })
        .then(function (res) { if (!res.ok) throw new Error("add"); return res.json(); })
        .then(function (j) { state.cuisines = j.cuisines || state.cuisines; });
    }
    if (state.cuisines.indexOf(name) < 0) { state.cuisines = state.cuisines.concat(name).sort(function (a, b) { return a.localeCompare(b); }); saveLocalCuisines(state.cuisines); }
    return Promise.resolve();
  }
  function removeCuisineRemote(name) {
    if (state.mode === "cloud") {
      return fetch(CUISINE_API + "/" + encodeURIComponent(name), { method: "DELETE" })
        .then(function (res) { if (res.status === 409) throw new Error("in-use"); if (!res.ok) throw new Error("del"); return res.json(); })
        .then(function (j) { state.cuisines = j.cuisines || state.cuisines; });
    }
    state.cuisines = state.cuisines.filter(function (c) { return c !== name; });
    saveLocalCuisines(state.cuisines);
    return Promise.resolve();
  }

  /* ---------------- counts ---------------- */
  function cuisineCounts() {
    var c = {};
    state.items.forEach(function (r) { var k = categoryOf(r); c[k] = (c[k] || 0) + 1; });
    return c;
  }
  function cityCounts() {
    var c = {};
    state.items.forEach(function (r) { var k = cityOf(r); c[k] = (c[k] || 0) + 1; });
    return c;
  }

  /* ---------------- rendering ---------------- */
  function afterLoad() {
    var badge = $("#syncBadge");
    if (state.mode === "cloud") { badge.textContent = "Synced"; badge.className = "sync-badge cloud"; badge.title = "Saved to your Cloudflare database, shared across devices"; }
    else { badge.textContent = "Saved on this device"; badge.className = "sync-badge"; badge.title = "Connect the Cloudflare database to sync across devices"; }
    updateSortUI();
    updateFilterBadges();
    render();
  }

  function visibleItems() {
    var q = state.search.trim().toLowerCase();
    var items = state.items.filter(function (r) {
      if (state.exCuisine.has(categoryOf(r))) return false;
      if (state.exCity.has(cityOf(r))) return false;
      if (!q) return true;
      return [r.name, categoryOf(r), r.city, r.comment].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    items.sort(compare);
    return items;
  }
  function sortVal(r) {
    switch (state.sort.key) {
      case "name": return r.name.toLowerCase();
      case "kayla": return scoreVal(r, "k");
      case "paul": return scoreVal(r, "p");
      default: return latestDate(r);
    }
  }
  function compare(a, b) {
    var dir = state.sort.dir === "asc" ? 1 : -1;
    var va = sortVal(a), vb = sortVal(b);
    var ma = (va === null || va === ""), mb = (vb === null || vb === "");
    if (ma && mb) return (b.sort || 0) - (a.sort || 0);
    if (ma) return 1;   // missing values always sort last
    if (mb) return -1;
    var c = (typeof va === "string") ? va.localeCompare(vb) : va - vb;
    if (c === 0) return (a.sort || 0) - (b.sort || 0);
    return c * dir;
  }

  function render() {
    var app = $("#app");
    app.innerHTML = "";
    var items = visibleItems();

    var nC = Object.keys(cuisineCounts()).length;
    $("#statLine").textContent = state.items.length + " places · " + nC + " cuisines";

    if (!items.length) {
      app.appendChild(el("p", "empty-state",
        state.items.length ? "Nothing matches your filters." : "No places yet — add your first one."));
      return;
    }
    items.forEach(function (r) { app.appendChild(renderRow(r)); });
  }

  function renderRow(r) {
    var row = el("button", "row"); row.type = "button";
    var main = el("div", "row-main");
    main.appendChild(el("span", "row-name", r.name));
    var meta = el("span", "row-meta");
    var parts = [categoryOf(r)];
    if (r.city && r.city !== "Montreal") parts.push(r.city);
    var d = fmtMonth(latestDate(r));
    if (d) parts.push(d);
    meta.appendChild(document.createTextNode(parts.join(" · ")));
    if ((r.visits || []).length > 1) {
      meta.appendChild(document.createTextNode("  "));
      meta.appendChild(el("span", "rev", "↺" + r.visits.length));
    }
    main.appendChild(meta);
    row.appendChild(main);

    var last = latestVisit(r);
    row.appendChild(scoreCell(last ? last.k : null));
    row.appendChild(scoreCell(last ? last.p : null));
    row.addEventListener("click", function () { openDetail(r); });
    return row;
  }
  function scoreCell(v) { return el("span", "row-score" + (v == null ? " empty" : ""), fmt(v)); }

  /* ---------------- sort UI ---------------- */
  function setSort(key) {
    if (state.sort.key === key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    else state.sort = { key: key, dir: key === "name" ? "asc" : "desc" };
    updateSortUI(); render();
  }
  function toggleDateSort() {
    if (state.sort.key !== "date") state.sort = { key: "date", dir: "desc" };
    else state.sort.dir = state.sort.dir === "desc" ? "asc" : "desc";
    updateSortUI(); render();
  }
  function updateSortUI() {
    var k = state.sort.key, asc = state.sort.dir === "asc";
    var dBtn = $("#sortDateBtn");
    dBtn.dataset.active = (k === "date") ? "true" : "false";
    dBtn.textContent = (k === "date" && asc) ? "Oldest ↑" : "Newest ↓";
    [["#sortName", "name"], ["#sortKayla", "kayla"], ["#sortPaul", "paul"]].forEach(function (pair) {
      var btn = $(pair[0]), active = k === pair[1];
      btn.classList.toggle("active", active);
      $(".arrow", btn).textContent = active ? (asc ? "↑" : "↓") : "";
    });
  }

  /* ---------------- filters ---------------- */
  var filterDlg = $("#filterDialog");
  var filterKind = "cuisine";

  function openFilter(kind) {
    filterKind = kind;
    $("#filterTitle").textContent = kind === "cuisine" ? "Show cuisines" : "Show cities";
    buildPills();
    openDialog(filterDlg);
  }
  function filterValues() {
    var counts = filterKind === "cuisine" ? cuisineCounts() : cityCounts();
    return { counts: counts, names: Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); }) };
  }
  function excludedSet() { return filterKind === "cuisine" ? state.exCuisine : state.exCity; }

  function buildPills() {
    var grid = $("#pillGrid"); grid.innerHTML = "";
    var fv = filterValues(), ex = excludedSet();

    var all = el("button", "pill pill-all" + (ex.size === 0 ? " on" : ""), "All");
    all.type = "button";
    all.addEventListener("click", function () {
      if (ex.size === 0) fv.names.forEach(function (n) { ex.add(n); });
      else ex.clear();
      buildPills(); afterFilterChange();
    });
    grid.appendChild(all);
    grid.appendChild(el("div", "pill-sep"));

    fv.names.forEach(function (name) {
      var on = !ex.has(name);
      var p = el("button", "pill" + (on ? " on" : ""));
      p.type = "button";
      p.appendChild(document.createTextNode(name));
      p.appendChild(el("span", "pc", String(fv.counts[name])));
      p.addEventListener("click", function () {
        if (ex.has(name)) ex.delete(name); else ex.add(name);
        buildPills(); afterFilterChange();
      });
      grid.appendChild(p);
    });
  }
  function afterFilterChange() { updateFilterBadges(); render(); }

  function updateFilterBadges() {
    badge($("#filterCuisineBtn"), "Cuisines", cuisineCounts(), state.exCuisine);
    badge($("#filterCityBtn"), "Cities", cityCounts(), state.exCity);
    var any = state.exCuisine.size > 0 || state.exCity.size > 0;
    $("#clearFiltersBtn").hidden = !any;
  }
  function badge(btn, label, counts, ex) {
    var total = Object.keys(counts).length;
    var active = 0; ex.forEach(function (n) { if (counts[n] != null) active++; });
    var shown = total - active;
    btn.classList.toggle("filtered", active > 0);
    btn.textContent = active > 0 ? label + " · " + shown : label;
  }
  function clearFilters() { state.exCuisine.clear(); state.exCity.clear(); updateFilterBadges(); render(); }

  /* ---------------- manage cuisines ---------------- */
  var manageDlg = $("#manageDialog");
  function openManage() { buildManageList(); openDialog(manageDlg); }
  function buildManageList() {
    var ul = $("#cuisineMgrList"); ul.innerHTML = "";
    var counts = cuisineCounts();
    var list = state.cuisines.slice().sort(function (a, b) { return a.localeCompare(b); });
    list.forEach(function (name) {
      var li = document.createElement("li");
      var left = el("span");
      left.appendChild(el("span", "cm-name", name));
      var n = counts[name] || 0;
      left.appendChild(el("span", "cm-count", n === 1 ? "1 place" : n + " places"));
      li.appendChild(left);
      var del = el("button", "cm-del", "Remove"); del.type = "button"; del.disabled = n > 0;
      del.title = n > 0 ? "In use — can't remove" : "Remove cuisine";
      del.addEventListener("click", function () {
        removeCuisineRemote(name)
          .then(function () { buildManageList(); refreshCuisineUI(); showToast("Removed " + name); })
          .catch(function (e) { showToast(e.message === "in-use" ? "That cuisine is in use" : "Couldn't remove", true); });
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
  }
  function onAddCuisine(e) {
    e.preventDefault();
    var inp = $("#newCuisine");
    var name = inp.value.trim();
    if (!name) return;
    if (state.cuisines.some(function (c) { return c.toLowerCase() === name.toLowerCase(); })) {
      showToast("Already in the list", true); inp.value = ""; return;
    }
    addCuisineRemote(name)
      .then(function () { inp.value = ""; buildManageList(); refreshCuisineUI(); showToast("Added " + name); })
      .catch(function () { showToast("Couldn't add — try again", true); });
  }
  function refreshCuisineUI() { updateFilterBadges(); }

  /* ---------------- detail ---------------- */
  var detailDlg = $("#detail");
  var detailItem = null;
  function openDetail(r) {
    detailItem = r;
    var body = $("#detailBody"); body.innerHTML = "";
    body.appendChild(el("h2", "detail-name", r.name));
    var sub = el("p", "detail-sub");
    var parts = [categoryOf(r)];
    if (r.city) parts.push(r.city);
    parts.forEach(function (p, i) { if (i) sub.appendChild(el("span", "dot", "·")); sub.appendChild(document.createTextNode(p)); });
    body.appendChild(sub);

    var last = latestVisit(r);
    var scores = el("div", "detail-scores");
    scores.appendChild(detailScore("Kayla", last ? last.k : null));
    scores.appendChild(detailScore("Paul", last ? last.p : null));
    body.appendChild(scores);

    if ((r.visits || []).length > 1) {
      var hist = el("div", "detail-history");
      hist.appendChild(el("p", "dh-title", "Every visit"));
      r.visits.slice().reverse().forEach(function (v, i) {
        var hr = el("div", "dh-row");
        hr.appendChild(el("span", "dh-when", fmtMonth(v.date) || "Visit"));
        hr.appendChild(el("span", null, fmt(v.k)));
        hr.appendChild(el("span", null, fmt(v.p)));
        hist.appendChild(hr);
      });
      body.appendChild(hist);
    }
    if (r.comment) { body.appendChild(el("p", "detail-notes-label", "Notes")); body.appendChild(el("p", "detail-notes", r.comment)); }
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

  function buildCuisineSelect(selected) {
    var sel = $("#f-cuisine"); sel.innerHTML = "";
    sel.appendChild(optionEl("", "—"));
    var list = state.cuisines.slice().sort(function (a, b) { return a.localeCompare(b); });
    if (selected && list.indexOf(selected) < 0) list.unshift(selected);
    list.forEach(function (c) { sel.appendChild(optionEl(c, c)); });
    sel.value = selected || "";
  }
  function optionEl(value, label) { var o = document.createElement("option"); o.value = value; o.textContent = label; return o; }

  function visitRow(v) {
    v = v || { date: currentMonth(), k: "", p: "" };
    var row = el("div", "visit-row");
    var date = el("input", "date-input"); date.type = "month"; date.value = v.date || ""; date.setAttribute("data-f", "date");
    var k = mkNum(v.k); k.setAttribute("data-f", "k");
    var p = mkNum(v.p); p.setAttribute("data-f", "p");
    var del = el("button", "del", "✕"); del.type = "button"; del.title = "Remove this visit";
    del.addEventListener("click", function () {
      var list = $("#visitsList");
      if (list.children.length > 1) row.remove(); else showToast("Keep at least one visit", true);
    });
    row.appendChild(date); row.appendChild(k); row.appendChild(p); row.appendChild(del);
    return row;
  }
  function mkNum(val) {
    var i = el("input"); i.type = "number"; i.step = "0.25"; i.min = "0"; i.max = "10"; i.inputMode = "decimal"; i.placeholder = "–";
    i.value = val == null ? "" : val; return i;
  }

  function openEditor(r) {
    editing = r ? r.id : null;
    $("#editorTitle").textContent = r ? "Edit place" : "Add a place";
    $("#f-name").value = r ? r.name : "";
    buildCuisineSelect(r ? categoryOf(r) : "");
    $("#f-city").value = r ? (r.city || "") : "Montreal";
    $("#f-comment").value = r ? (r.comment || "") : "";
    var list = $("#visitsList"); list.innerHTML = "";
    var visits = (r && r.visits && r.visits.length) ? r.visits : [{ date: currentMonth(), k: "", p: "" }];
    visits.forEach(function (v) { list.appendChild(visitRow(v)); });
    $("#deleteBtn").hidden = !r;
    openDialog(dlg);
    setTimeout(function () { $("#f-name").focus(); }, 30);
  }

  function collectForm() {
    var visits = [];
    $("#visitsList").querySelectorAll(".visit-row").forEach(function (row) {
      var date = $('[data-f="date"]', row).value;
      var k = num($('[data-f="k"]', row).value);
      var p = num($('[data-f="p"]', row).value);
      if (!date && k == null && p == null) return;
      visits.push({ date: date || "", k: k, p: p });
    });
    if (!visits.length) visits.push({ date: "", k: null, p: null });
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
    persistItem(item, isNew)
      .then(function (saved) {
        saved = saved && saved.id ? saved : item;
        if (isNew) state.items.push(saved);
        else { var i = state.items.findIndex(function (x) { return x.id === saved.id; }); if (i >= 0) state.items[i] = saved; }
        updateFilterBadges(); render(); closeDialog(dlg);
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
    removeItem(id)
      .then(function () {
        state.items = state.items.filter(function (x) { return x.id !== id; });
        updateFilterBadges(); render(); closeDialog(dlg);
        showToast("Deleted " + r.name);
      })
      .catch(function () { showToast("Couldn't delete — try again", true); });
  }

  /* ---------------- dialog + toast ---------------- */
  function openDialog(d) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
  function closeDialog(d) { if (typeof d.close === "function") d.close(); else d.removeAttribute("open"); }
  var toastTimer;
  function showToast(msg, isErr) {
    var t = $("#toast"); t.textContent = msg; t.className = "toast show" + (isErr ? " error" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = "toast"; }, 2600);
  }

  /* ---------------- wiring ---------------- */
  function bind() {
    $("#addBtn").addEventListener("click", function () { openEditor(null); });
    $("#manageCuisinesBtn").addEventListener("click", openManage);
    $("#addVisitBtn").addEventListener("click", function () { $("#visitsList").appendChild(visitRow()); });
    $("#editorForm").addEventListener("submit", onSubmit);
    $("#cancelBtn").addEventListener("click", function () { closeDialog(dlg); });
    $("#closeEditor").addEventListener("click", function () { closeDialog(dlg); });
    $("#deleteBtn").addEventListener("click", onDelete);
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(dlg); });

    $("#closeDetail").addEventListener("click", function () { closeDialog(detailDlg); });
    detailDlg.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(detailDlg); });
    detailDlg.addEventListener("click", function (e) { if (e.target === detailDlg) closeDialog(detailDlg); });
    $("#detailEdit").addEventListener("click", function () { closeDialog(detailDlg); if (detailItem) openEditor(detailItem); });

    $("#filterCuisineBtn").addEventListener("click", function () { openFilter("cuisine"); });
    $("#filterCityBtn").addEventListener("click", function () { openFilter("city"); });
    $("#clearFiltersBtn").addEventListener("click", clearFilters);
    $("#closeFilter").addEventListener("click", function () { closeDialog(filterDlg); });
    $("#filterDone").addEventListener("click", function () { closeDialog(filterDlg); });
    filterDlg.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(filterDlg); });
    filterDlg.addEventListener("click", function (e) { if (e.target === filterDlg) closeDialog(filterDlg); });

    $("#closeManage").addEventListener("click", function () { closeDialog(manageDlg); });
    manageDlg.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(manageDlg); });
    manageDlg.addEventListener("click", function (e) { if (e.target === manageDlg) closeDialog(manageDlg); });
    $("#addCuisineForm").addEventListener("submit", onAddCuisine);

    $("#sortDateBtn").addEventListener("click", toggleDateSort);
    $("#sortName").addEventListener("click", function () { setSort("name"); });
    $("#sortKayla").addEventListener("click", function () { setSort("kayla"); });
    $("#sortPaul").addEventListener("click", function () { setSort("paul"); });

    var s = $("#search"), deb;
    s.addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(function () { state.search = s.value; render(); }, 120); });
  }

  bind();
  init();
})();
