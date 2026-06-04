/* K&P Restaurant Catalogue — frontend logic.
 *
 * Talks to the Cloudflare D1-backed API at /api/restaurants when reachable, and
 * transparently falls back to localStorage (seeded from seed-data.js) otherwise,
 * so the app always works.
 */
(function () {
  "use strict";

  var API = "/api/restaurants";
  var LS_KEY = "kp_restaurants_v1";
  var state = {
    items: [],
    mode: "loading", // "cloud" | "local"
    search: "",
    sortBy: "avg-desc",
    cuisine: "", // "" = all (grouped by cuisine); otherwise one cuisine
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
  function combinedAvg(r) {
    var vals = [];
    (r.visits || []).forEach(function (v) {
      if (v.k != null) vals.push(v.k);
      if (v.p != null) vals.push(v.p);
    });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function latestVisit(r) {
    var vs = r.visits || [];
    return vs.length ? vs[vs.length - 1] : null;
  }
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
    } catch (e) { /* ignore */ }
    var seed = (window.SEED_DATA || []).map(clone);
    saveLocal(seed);
    return seed;
  }
  function saveLocal(items) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch (e) { /* ignore */ }
  }

  function init() {
    fetch(API, { headers: { accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("api " + res.status);
        return res.json();
      })
      .then(function (data) {
        state.mode = "cloud";
        state.items = data.restaurants || [];
        afterLoad();
      })
      .catch(function () {
        state.mode = "local";
        state.items = loadLocal();
        afterLoad();
      });
  }

  function persist(item, isNew) {
    if (state.mode === "cloud") {
      var url = isNew ? API : API + "/" + encodeURIComponent(item.id);
      return fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item),
      }).then(function (res) {
        if (!res.ok) throw new Error("save failed");
        return res.json();
      });
    }
    var idx = state.items.findIndex(function (r) { return r.id === item.id; });
    if (idx >= 0) state.items[idx] = item; else state.items.push(item);
    saveLocal(state.items);
    return Promise.resolve(item);
  }

  function remove(id) {
    if (state.mode === "cloud") {
      return fetch(API + "/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function (res) { if (!res.ok) throw new Error("delete failed"); });
    }
    state.items = state.items.filter(function (r) { return r.id !== id; });
    saveLocal(state.items);
    return Promise.resolve();
  }

  /* ---------------- rendering ---------------- */
  function afterLoad() {
    var badge = $("#syncBadge");
    if (state.mode === "cloud") {
      badge.textContent = "Synced";
      badge.className = "sync-badge cloud";
      badge.title = "Saved to your Cloudflare database, shared across devices";
    } else {
      badge.textContent = "Saved on this device";
      badge.className = "sync-badge";
      badge.title = "Connect the Cloudflare database to sync across devices";
    }
    renderChips();
    render();
  }

  function cuisineCounts() {
    var counts = {};
    state.items.forEach(function (r) {
      var c = r.cuisine || "Other";
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }

  function renderChips() {
    var wrap = $("#cuisineChips");
    wrap.innerHTML = "";
    var counts = cuisineCounts();
    var names = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); });

    wrap.appendChild(makeChip("", "All", state.items.length));
    names.forEach(function (c) { wrap.appendChild(makeChip(c, c, counts[c])); });

    var dl = $("#cuisineList");
    dl.innerHTML = "";
    names.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      dl.appendChild(o);
    });
  }

  function makeChip(value, label, count) {
    var b = el("button", "chip-btn" + (state.cuisine === value ? " active" : ""));
    b.type = "button";
    b.appendChild(document.createTextNode(label));
    b.appendChild(el("span", "cnt", String(count)));
    b.addEventListener("click", function () {
      state.cuisine = state.cuisine === value ? "" : value;
      renderChips();
      render();
      var active = $("#cuisineChips .chip-btn.active");
      if (active && active.scrollIntoView) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
    return b;
  }

  function visibleItems() {
    var q = state.search.trim().toLowerCase();
    var items = state.items.filter(function (r) {
      if (state.cuisine && (r.cuisine || "Other") !== state.cuisine) return false;
      if (!q) return true;
      var hay = [r.name, r.cuisine, r.city, r.comment].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    items.sort(sorter);
    return items;
  }

  function sorter(a, b) {
    switch (state.sortBy) {
      case "avg-asc": return safeAvg(a) - safeAvg(b);
      case "name-asc": return a.name.localeCompare(b.name);
      case "recent": return (b.sort || 0) - (a.sort || 0);
      default: return safeAvg(b) - safeAvg(a);
    }
  }
  function safeAvg(r) { var v = combinedAvg(r); return v == null ? -1 : v; }

  function render() {
    var app = $("#app");
    app.innerHTML = "";
    var items = visibleItems();

    $("#statLine").textContent =
      state.items.length + " places · " + Object.keys(cuisineCounts()).length + " cuisines";

    if (!items.length) {
      app.appendChild(el("p", "empty-state",
        state.items.length ? "Nothing matches that search." : "No places yet — add your first one."));
      return;
    }

    if (state.cuisine) {
      app.appendChild(renderCards(items));
      return;
    }

    var groups = {};
    items.forEach(function (r) {
      var g = r.cuisine || "Other";
      (groups[g] || (groups[g] = [])).push(r);
    });
    Object.keys(groups).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (g) {
      var rows = groups[g];
      var section = el("section", "group");
      var head = el("div", "group-head");
      head.appendChild(el("h2", "group-title", g));
      head.appendChild(el("span", "group-count", String(rows.length)));
      head.appendChild(el("span", "group-rule"));
      section.appendChild(head);
      section.appendChild(renderCards(rows));
      app.appendChild(section);
    });
  }

  function renderCards(rows) {
    var grid = el("div", "cards");
    rows.forEach(function (r) { grid.appendChild(renderCard(r)); });
    return grid;
  }

  function renderCard(r) {
    var card = el("article", "card");

    var row = el("div", "card-row");
    row.appendChild(el("h3", "card-name", r.name));
    var avg = combinedAvg(r);
    row.appendChild(el("span", "overall" + (avg == null ? " none" : ""), avg == null ? "–" : avg.toFixed(1)));
    card.appendChild(row);

    var subParts = [];
    if (r.cuisine) subParts.push(r.cuisine);
    if (r.city) subParts.push(r.city);
    if (subParts.length) {
      var sub = el("p", "card-sub");
      subParts.forEach(function (part, i) {
        if (i) sub.appendChild(el("span", "dot", "·"));
        sub.appendChild(document.createTextNode(part));
      });
      card.appendChild(sub);
    }

    var last = latestVisit(r);
    var scores = el("div", "scores");
    scores.appendChild(scoreSpan("Kayla", last ? last.k : null));
    scores.appendChild(scoreSpan("Paul", last ? last.p : null));
    card.appendChild(scores);

    if ((r.visits || []).length > 1) {
      var lbl = last && last.label ? last.label : "latest visit";
      card.appendChild(el("p", "visit-note", "Showing " + lbl + " · " + r.visits.length + " visits"));
    } else if (last && last.label) {
      card.appendChild(el("p", "visit-note", last.label));
    }

    if (r.comment) card.appendChild(el("p", "card-comment", r.comment));

    var actions = el("div", "card-actions");
    var maps = el("a", "link", "Map ↗");
    maps.href = mapsUrl(r);
    maps.target = "_blank";
    maps.rel = "noopener";
    var edit = el("button", "link muted", "Edit");
    edit.type = "button";
    edit.addEventListener("click", function () { openEditor(r); });
    actions.appendChild(maps);
    actions.appendChild(edit);
    card.appendChild(actions);

    return card;
  }

  function scoreSpan(name, value) {
    var s = el("span", "sc");
    s.appendChild(el("b", null, name));
    s.appendChild(document.createTextNode(fmt(value)));
    return s;
  }

  /* ---------------- editor ---------------- */
  var dlg = $("#editor");
  var editing = null;

  function visitRow(v) {
    v = v || { label: "", k: "", p: "" };
    var row = el("div", "visit-row");

    var label = el("input", "label-input");
    label.placeholder = "Visit (e.g. 2025)";
    label.value = v.label || "";
    label.setAttribute("data-f", "label");

    var k = el("input");
    k.type = "number"; k.step = "0.25"; k.min = "0"; k.max = "10";
    k.inputMode = "decimal"; k.placeholder = "–";
    k.value = v.k == null ? "" : v.k;
    k.setAttribute("data-f", "k");

    var p = el("input");
    p.type = "number"; p.step = "0.25"; p.min = "0"; p.max = "10";
    p.inputMode = "decimal"; p.placeholder = "–";
    p.value = v.p == null ? "" : v.p;
    p.setAttribute("data-f", "p");

    var del = el("button", "del", "✕");
    del.type = "button";
    del.title = "Remove this visit";
    del.addEventListener("click", function () {
      var list = $("#visitsList");
      if (list.children.length > 1) row.remove();
      else showToast("Keep at least one visit", true);
    });

    row.appendChild(label);
    row.appendChild(k);
    row.appendChild(p);
    row.appendChild(del);
    return row;
  }

  function openEditor(r) {
    editing = r ? r.id : null;
    $("#editorTitle").textContent = r ? "Edit place" : "Add a place";
    $("#f-name").value = r ? r.name : "";
    $("#f-cuisine").value = r ? (r.cuisine || "") : "";
    $("#f-city").value = r ? (r.city || "") : "Montreal";
    $("#f-comment").value = r ? (r.comment || "") : "";

    var list = $("#visitsList");
    list.innerHTML = "";
    var visits = (r && r.visits && r.visits.length) ? r.visits : [{ label: "", k: "", p: "" }];
    visits.forEach(function (v) { list.appendChild(visitRow(v)); });

    $("#deleteBtn").hidden = !r;
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    setTimeout(function () { $("#f-name").focus(); }, 30);
  }

  function closeEditor() {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
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

  function maxSort() {
    return state.items.reduce(function (m, r) { return Math.max(m, r.sort || 0); }, 0);
  }

  function onSubmit(e) {
    e.preventDefault();
    var item = collectForm();
    if (!item.name) { showToast("Please add a name", true); return; }
    var isNew = !editing;
    var btn = $("#saveBtn");
    btn.disabled = true;
    persist(item, isNew)
      .then(function (saved) {
        saved = saved && saved.id ? saved : item;
        if (isNew) {
          state.items.push(saved);
        } else {
          var idx = state.items.findIndex(function (x) { return x.id === saved.id; });
          if (idx >= 0) state.items[idx] = saved;
        }
        renderChips();
        render();
        closeEditor();
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
        if (state.cuisine && !cuisineCounts()[state.cuisine]) state.cuisine = "";
        renderChips();
        render();
        closeEditor();
        showToast("Deleted " + r.name);
      })
      .catch(function () { showToast("Couldn't delete — try again", true); });
  }

  /* ---------------- toast ---------------- */
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
    $("#addVisitBtn").addEventListener("click", function () {
      $("#visitsList").appendChild(visitRow());
    });
    $("#editorForm").addEventListener("submit", onSubmit);
    $("#cancelBtn").addEventListener("click", closeEditor);
    $("#closeEditor").addEventListener("click", closeEditor);
    $("#deleteBtn").addEventListener("click", onDelete);
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); closeEditor(); });

    var searchEl = $("#search");
    var deb;
    searchEl.addEventListener("input", function () {
      clearTimeout(deb);
      deb = setTimeout(function () { state.search = searchEl.value; render(); }, 120);
    });
    $("#sortBy").addEventListener("change", function (e) { state.sortBy = e.target.value; render(); });
  }

  bind();
  init();
})();
