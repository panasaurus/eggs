/* Panasaurus Eggs marketplace — plain JS, no dependencies. */
"use strict";

var REPO = "panasaurus/eggs";
var BRANCH = "main";
var RAW = "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/";
var BLOB = "https://github.com/" + REPO + "/blob/" + BRANCH + "/";
var CATEGORY_LABELS = { games: "Games", applications: "Applications", generic: "Generic" };
var CATEGORY_ORDER = ["games", "applications", "generic"];

var EGGS = [];
var state = { q: "", cat: "all" };

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function debounce(fn, ms) {
  var t;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

/* ---------- rendering ---------- */

function eggRow(e) {
  var tags = "";
  for (var i = 0; i < e.images.length; i++) {
    tags += '<span class="tag">' + esc(e.images[i]) + "</span>";
  }
  if (!tags) tags = '<span class="tag">-</span>';
  return '<li class="egg">' +
    "<div>" +
    '<div class="egg-top"><a class="name" href="' + BLOB + esc(e.path) + '">' + esc(e.name) + "</a>" +
    '<span class="path">' + esc(e.category + (e.group ? "/" + e.group : "")) + "</span></div>" +
    '<p class="desc">' + esc(e.description) + "</p>" +
    '<div class="tags">' + tags + "</div>" +
    "</div>" +
    '<a class="dl" href="' + RAW + esc(e.path) + '" data-path="' + esc(e.path) + '">Download</a>' +
    "</li>";
}

function matches(e) {
  if (state.cat !== "all" && e.category !== state.cat) return false;
  var q = state.q;
  if (!q) return true;
  return e.search.indexOf(q) !== -1;
}

function render() {
  var out = [];
  for (var i = 0; i < EGGS.length; i++) {
    if (matches(EGGS[i])) out.push(eggRow(EGGS[i]));
  }
  $("list").innerHTML = out.join("");
  var empty = $("empty");
  if (out.length === 0) {
    empty.hidden = false;
    empty.textContent = "No eggs match " + JSON.stringify(state.q) +
      (state.cat !== "all" ? " in " + CATEGORY_LABELS[state.cat] : "") + ".";
  } else {
    empty.hidden = true;
  }
  $("status").textContent = state.q || state.cat !== "all"
    ? out.length + " of " + EGGS.length + " eggs"
    : EGGS.length + " eggs";
}

function renderCats() {
  var counts = { all: EGGS.length };
  for (var i = 0; i < EGGS.length; i++) {
    counts[EGGS[i].category] = (counts[EGGS[i].category] || 0) + 1;
  }
  var html = '<button type="button" data-cat="all" aria-pressed="true">All ' + counts.all + "</button>";
  for (var c = 0; c < CATEGORY_ORDER.length; c++) {
    var cat = CATEGORY_ORDER[c];
    if (!counts[cat]) continue;
    html += '<button type="button" data-cat="' + cat + '" aria-pressed="false">' +
      CATEGORY_LABELS[cat] + " " + counts[cat] + "</button>";
  }
  $("cats").innerHTML = html;
}

function syncHash() {
  var h = "";
  if (state.q) h += "q=" + encodeURIComponent(state.q);
  if (state.cat !== "all") h += (h ? "&" : "") + "c=" + state.cat;
  history.replaceState(null, "", h ? "#" + h : location.pathname);
}

/* ---------- downloads ---------- */

function download(path) {
  var url = RAW + path;
  var name = path.split("/").pop();
  fetch(url).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.blob();
  }).then(function (blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }).catch(function () {
    location.href = url; /* fall back to opening the raw file */
  });
}

/* ---------- events ---------- */

$("list").addEventListener("click", function (ev) {
  var a = ev.target.closest("a.dl");
  if (!a) return;
  ev.preventDefault();
  download(a.getAttribute("data-path"));
});

$("cats").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-cat]");
  if (!b) return;
  state.cat = b.getAttribute("data-cat");
  var btns = $("cats").querySelectorAll("button");
  for (var i = 0; i < btns.length; i++) {
    btns[i].setAttribute("aria-pressed", btns[i] === b ? "true" : "false");
  }
  syncHash();
  render();
});

$("q").addEventListener("input", debounce(function () {
  state.q = $("q").value.trim().toLowerCase();
  syncHash();
  render();
}, 120));

document.addEventListener("keydown", function (ev) {
  if (ev.key === "/" && document.activeElement !== $("q")) {
    ev.preventDefault();
    $("q").focus();
  } else if (ev.key === "Escape" && document.activeElement === $("q")) {
    $("q").value = "";
    state.q = "";
    syncHash();
    render();
  }
});

/* ---------- init ---------- */

function readHash() {
  var h = location.hash.replace(/^#/, "");
  if (!h) return;
  var parts = h.split("&");
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split("=");
    if (kv[0] === "q" && kv[1]) {
      state.q = decodeURIComponent(kv[1]).toLowerCase();
      $("q").value = state.q;
    } else if (kv[0] === "c" && kv[1]) {
      state.cat = kv[1];
    }
  }
}

fetch("eggs.json").then(function (r) {
  if (!r.ok) throw new Error(r.status);
  return r.json();
}).then(function (data) {
  EGGS = data.eggs;
  for (var i = 0; i < EGGS.length; i++) {
    var e = EGGS[i];
    e.search = (e.name + " " + (e.group || "") + " " + e.category + " " +
      e.description + " " + e.images.join(" ")).toLowerCase();
  }
  readHash();
  renderCats();
  var btns = $("cats").querySelectorAll("button");
  for (var j = 0; j < btns.length; j++) {
    btns[j].setAttribute("aria-pressed",
      btns[j].getAttribute("data-cat") === state.cat ? "true" : "false");
  }
  render();
}).catch(function (err) {
  $("status").textContent = "Failed to load eggs.json (" + err.message + ").";
});
