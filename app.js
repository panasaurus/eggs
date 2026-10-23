/* Panasaurus Eggs — a static, dependency-free catalog. */
(function () {
  "use strict";

  const REPO = "https://github.com/panasaurus/eggs";
  const RAW = "https://raw.githubusercontent.com/panasaurus/eggs/main/";
  const CATEGORIES = {
    all: { label: "All eggs", icon: "grid" },
    games: { label: "Games", icon: "game" },
    applications: { label: "Applications", icon: "apps" },
    generic: { label: "Runtimes", icon: "terminal" },
  };
  const RUNTIMES = ["all", "java", "node", "python", "steam", "wine", "dotnet", "other"];
  const PAGE_SIZE = 24;
  const $ = (id) => document.getElementById(id);
  let eggs = [];
  let byPath = new Map();
  let loaded = false;
  let visible = PAGE_SIZE;
  let searchTimer;
  let toastTimer;
  let copyTimer;
  let detailController;
  let currentEgg = null;
  let state = { q: "", cat: "all", runtime: "all", sort: "az", view: "grid" };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function icon(name, extra = "") {
    return '<svg class="icon ' + esc(extra) + '" aria-hidden="true"><use href="#i-' + esc(name) + '"/></svg>';
  }
  function normalize(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  function encodedPath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }
  function fileUrl(egg) { return encodedPath(egg.path); }
  function sourceUrl(egg) { return REPO + "/blob/main/" + encodedPath(egg.path); }
  function family(egg) {
    const group = egg.group.split("/");
    const value = group[0] || CATEGORIES[egg.category].label;
    return value.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
  function imageOrder(images) {
    return images.slice().sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }
  function appearance(egg) {
    if (egg.group.toLowerCase().startsWith("minecraft")) return { icon: "cube", tone: "green" };
    if (egg.group.toLowerCase().startsWith("valheim")) return { icon: "feather", tone: "blue" };
    if (egg.category === "applications") return { icon: "apps", tone: "purple" };
    if (egg.category === "generic") return { icon: "terminal", tone: "amber" };
    return { icon: "game", tone: "green" };
  }
  function avatar(egg) {
    const value = appearance(egg);
    return '<span class="egg-avatar" data-tone="' + value.tone + '">' + icon(value.icon) + "</span>";
  }
  function runtimeFor(image) {
    if (/^java_/i.test(image)) return "java";
    if (/^(nodejs_|bun_)/i.test(image)) return "node";
    if (/^python_/i.test(image)) return "python";
    if (/^steamcmd/i.test(image)) return "steam";
    if (/wine|proton/i.test(image)) return "wine";
    if (/^(dotnet_|mono_)/i.test(image)) return "dotnet";
    return "other";
  }
  function tags(egg) {
    const images = imageOrder(egg.images);
    let html = images.slice(0, 2).map((image) => '<button class="runtime-tag" type="button" data-image="' + esc(image) + '" aria-label="Search image ' + esc(image) + '">' + esc(image) + "</button>").join("");
    if (images.length > 2) html += '<button type="button" class="runtime-more" data-details="' + esc(egg.path) + '" aria-label="View all ' + images.length + ' images for ' + esc(egg.name) + '">+' + (images.length - 2) + "</button>";
    return html || '<span class="runtime-tag">Custom image</span>';
  }
  function downloadLink(egg, featured = false) {
    return '<a class="' + (featured ? "featured-download" : "download-button") + '" href="' + fileUrl(egg) + '" download="' + esc(egg.path.split("/").pop()) + '" aria-label="Download ' + esc(egg.name) + '">' + (featured ? "Download" + icon("download") : icon("download") + "Download") + "</a>";
  }
  function eggCard(egg) {
    return '<li class="egg-card" data-egg="' + esc(egg.path) + '">' +
      '<div class="egg-card-main"><div class="egg-head">' + avatar(egg) + '<div class="egg-head-copy"><button type="button" class="egg-name" data-details="' + esc(egg.path) + '">' + esc(egg.name) + '</button><span class="egg-family">' + esc(CATEGORIES[egg.category].label + " / " + family(egg)) + "</span></div></div>" +
      '<p class="egg-description">' + esc(egg.description || "A server definition ready to import into your panel.") + '</p><div class="runtime-tags">' + tags(egg) + "</div></div>" +
      '<div class="egg-footer"><button type="button" class="preview-button" data-details="' + esc(egg.path) + '" aria-label="Preview ' + esc(egg.name) + '">Preview egg' + icon("arrow") + "</button>" + downloadLink(egg) + "</div></li>";
  }
  function featuredCard(egg) {
    const image = imageOrder(egg.images)[0];
    return '<article class="featured-card"><div class="featured-head">' + avatar(egg) + '<div><button class="featured-name" type="button" data-details="' + esc(egg.path) + '">' + esc(egg.name) + '</button><span class="featured-family">' + esc(family(egg)) + '</span></div></div><p class="featured-description">' + esc(egg.description) + '</p><div class="featured-footer"><span class="runtime-tag">' + esc(image || "Custom image") + "</span>" + downloadLink(egg, true) + "</div></article>";
  }

  function renderCategories() {
    const counts = { all: eggs.length, games: 0, applications: 0, generic: 0 };
    eggs.forEach((egg) => { counts[egg.category]++; });
    const html = Object.entries(CATEGORIES).map(([key, value]) => '<button type="button" data-cat="' + key + '" aria-pressed="' + (state.cat === key) + '">' + icon(value.icon) + '<span>' + value.label + '</span><span>' + counts[key] + "</span></button>").join("");
    $("cats").innerHTML = html;
    $("mobile-cats").innerHTML = html;
    $("minecraft-count").textContent = eggs.filter((egg) => egg.group.toLowerCase().startsWith("minecraft")).length;
  }
  function syncControls() {
    if ($("q").value !== state.q) $("q").value = state.q;
    $("runtime").value = state.runtime;
    $("sort").value = state.sort;
    $("clear-search").hidden = !state.q;
    document.querySelectorAll("[data-cat]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.cat === state.cat)));
    document.querySelectorAll("[data-view]").forEach((button) => {
      if (button.tagName === "BUTTON") button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
    });
    $("list").dataset.view = state.view;
  }
  function render() {
    if (!loaded) return;
    const words = normalize(state.q).trim().split(/\s+/).filter(Boolean);
    const found = eggs.filter((egg) => (state.cat === "all" || egg.category === state.cat) && (state.runtime === "all" || egg.runtimes.has(state.runtime)) && words.every((word) => egg.search.includes(word)));
    found.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * (state.sort === "za" ? -1 : 1));
    const shown = Math.min(visible, found.length);
    $("list").innerHTML = found.slice(0, shown).map(eggCard).join("");
    $("empty").hidden = found.length !== 0;
    $("empty-message").textContent = state.q ? 'No matches for “' + state.q + '”. Try another search or clear your filters.' : "Try another category or clear your runtime filter.";
    $("status").textContent = found.length === 0 ? "No matching eggs" : shown === found.length ? found.length + (found.length === 1 ? " egg" : " eggs") : "Showing " + shown + " of " + found.length + " eggs";
    $("load-more-wrap").hidden = shown >= found.length;
    $("load-more-status").textContent = found.length - shown + " more to explore";
    $("featured").hidden = Boolean(state.q || state.cat !== "all" || state.runtime !== "all");
    syncControls();
  }
  function syncHash() {
    const params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.cat !== "all") params.set("c", state.cat);
    if (state.runtime !== "all") params.set("r", state.runtime);
    if (state.sort !== "az") params.set("s", state.sort);
    history.replaceState(null, "", location.pathname + location.search + (params.size ? "#" + params.toString() : ""));
  }
  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const cat = params.get("c");
    const runtime = params.get("r");
    state.q = (params.get("q") || "").trim();
    state.cat = Object.hasOwn(CATEGORIES, cat) ? cat : "all";
    state.runtime = RUNTIMES.includes(runtime) ? runtime : "all";
    state.sort = params.get("s") === "za" ? "za" : "az";
  }
  function applyFilters(update) {
    clearTimeout(searchTimer);
    state.q = $("q").value.trim();
    Object.assign(state, update);
    visible = PAGE_SIZE;
    syncHash();
    render();
  }
  function focusSearch() {
    $("q").focus({ preventScroll: true });
    $("catalog").scrollIntoView({ block: "start", behavior: "instant" });
  }
  function showToast(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").hidden = false;
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3500);
  }

  function detailContent(egg, data) {
    const images = data.docker_images && typeof data.docker_images === "object" ? Object.entries(data.docker_images) : data.docker_image ? [["Image", data.docker_image]] : [];
    const variables = Array.isArray(data.variables) ? data.variables.filter((variable) => variable.user_viewable !== false) : [];
    let html = '<div class="detail-heading">' + avatar(egg) + '<div><h2 id="detail-title">' + esc(egg.name) + '</h2><p class="detail-category">' + esc(CATEGORIES[egg.category].label + " / " + family(egg)) + '</p></div></div><p class="detail-description">' + esc(data.description || egg.description) + "</p>";
    if (images.length) html += '<section class="detail-section"><h3>Runtime images</h3><div class="detail-images">' + images.map(([name, image]) => '<div class="detail-image"><span>' + esc(name) + '</span><code>' + esc(image) + "</code></div>").join("") + "</div></section>";
    if (data.startup) html += '<section class="detail-section"><h3>Startup command</h3><pre class="detail-startup"><code>' + esc(data.startup) + "</code></pre></section>";
    if (variables.length) html += '<section class="detail-section"><h3>Configuration defaults</h3><dl class="variables">' + variables.map((variable) => '<div class="variable-row"><dt>' + esc(variable.name) + '<small>' + esc(variable.env_variable) + '</small></dt><dd>' + esc(variable.default_value === "" || variable.default_value == null ? "Not set" : variable.default_value) + "</dd></div>").join("") + "</dl></section>";
    html += '<div class="detail-meta">' + (data.author ? '<span>Original author: ' + esc(data.author) + "</span>" : "") + '<a href="' + sourceUrl(egg) + '" target="_blank" rel="noopener noreferrer">View source on GitHub' + icon("external") + "</a></div>";
    return html;
  }
  async function fetchDetails(egg) {
    detailController?.abort();
    const controller = new AbortController();
    detailController = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    $("detail-body").setAttribute("aria-busy", "true");
    $("detail-body").innerHTML = '<div class="detail-heading">' + avatar(egg) + '<div><h2 id="detail-title">' + esc(egg.name) + '</h2><p class="detail-category">' + esc(family(egg)) + '</p></div></div><p class="modal-loading">Opening the configuration…</p>';
    try {
      const response = await fetch(fileUrl(egg), { signal: controller.signal });
      if (!response.ok) throw new Error("Configuration unavailable");
      const data = await response.json();
      if (currentEgg !== egg || !$("egg-details").open) return;
      $("detail-body").innerHTML = detailContent(egg, data);
    } catch (error) {
      if (currentEgg !== egg || !$("egg-details").open || detailController !== controller) return;
      $("detail-body").innerHTML = '<h2 id="detail-title">' + esc(egg.name) + '</h2><div class="detail-error">The preview couldn’t load. You can still download the JSON or try again.<br><button type="button" class="button button-secondary" data-retry-details>Try again</button></div>';
    } finally {
      clearTimeout(timeout);
      if (currentEgg === egg && detailController === controller) $("detail-body").setAttribute("aria-busy", "false");
    }
  }
  function openDetails(path) {
    const egg = byPath.get(path);
    if (!egg) return;
    currentEgg = egg;
    $("detail-download").href = fileUrl(egg);
    $("detail-download").download = egg.path.split("/").pop();
    $("detail-download").setAttribute("aria-label", "Download " + egg.name);
    clearTimeout(copyTimer);
    $("copy-link").innerHTML = icon("link") + "Copy JSON link";
    if (!$("egg-details").open) $("egg-details").showModal();
    fetchDetails(egg);
  }
  async function copyLink() {
    if (!currentEgg) return;
    const link = RAW + encodedPath(currentEgg.path);
    try {
      await navigator.clipboard.writeText(link);
      $("copy-link").innerHTML = icon("check") + "Link copied";
      showToast("JSON link copied. Ready to share.");
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { $("copy-link").innerHTML = icon("link") + "Copy JSON link"; }, 2200);
    } catch (error) {
      showToast("Copy this JSON link: " + link);
    }
  }

  function updateTheme() {
    const theme = document.documentElement.dataset.theme;
    const dark = theme !== "light";
    $("theme-toggle").innerHTML = icon(dark ? "sun" : "moon");
    $("theme-toggle").setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    document.querySelector('meta[name="theme-color"]').content = dark ? "#0c0f11" : "#f1f4f6";
  }
  $("theme-toggle").addEventListener("click", () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch (error) { /* Theme still works without storage. */ }
    updateTheme();
  });
  $("open-search").addEventListener("click", focusSearch);
  $("q").addEventListener("input", () => {
    clearTimeout(searchTimer);
    state.q = $("q").value.trim();
    $("clear-search").hidden = !$("q").value;
    searchTimer = setTimeout(() => applyFilters({ q: $("q").value.trim() }), 120);
  });
  $("clear-search").addEventListener("click", () => { applyFilters({ q: "" }); $("q").focus(); });
  $("runtime").addEventListener("change", () => applyFilters({ runtime: $("runtime").value }));
  $("sort").addEventListener("change", () => applyFilters({ sort: $("sort").value }));
  $("reset-filters").addEventListener("click", () => applyFilters({ q: "", cat: "all", runtime: "all", sort: "az" }));
  $("load-more").addEventListener("click", () => {
    const previous = visible;
    visible += PAGE_SIZE;
    render();
    $("list").children[previous]?.querySelector(".egg-name")?.focus();
  });
  $("copy-link").addEventListener("click", copyLink);

  document.addEventListener("click", (event) => {
    const element = event.target.closest("button, a");
    if (!element) return;
    if (element.dataset.cat) applyFilters({ cat: element.dataset.cat });
    else if (element.dataset.details) openDetails(element.dataset.details);
    else if (element.dataset.image) { applyFilters({ q: element.dataset.image }); focusSearch(); }
    else if (element.dataset.view) {
      state.view = element.dataset.view;
      try { localStorage.setItem("panasaurus-eggs-view", state.view); } catch (error) { /* Optional preference. */ }
      syncControls();
    } else if (element.dataset.collection) {
      const collection = element.dataset.collection;
      applyFilters(collection === "minecraft" ? { q: "minecraft", cat: "games", runtime: "all" } : collection === "steam" ? { q: "", cat: "games", runtime: "steam" } : { q: "", cat: "generic", runtime: "all" });
      $("catalog").scrollIntoView({ block: "start", behavior: "instant" });
    } else if (element.hasAttribute("data-retry-details") && currentEgg) fetchDetails(currentEgg);
    else if (element.hasAttribute("data-open-help")) $("import-guide").showModal();
    else if (element.hasAttribute("data-close-dialog")) element.closest("dialog")?.close();
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
  });
  $("egg-details").addEventListener("close", () => { currentEgg = null; detailController?.abort(); });
  document.addEventListener("keydown", (event) => {
    if ($("egg-details").open || $("import-guide").open) return;
    const typing = event.target instanceof HTMLElement && (event.target.matches("input, textarea, select") || event.target.isContentEditable);
    if (((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") || (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey)) {
      event.preventDefault(); focusSearch();
    } else if (event.key === "Escape" && document.activeElement === $("q")) {
      event.preventDefault(); applyFilters({ q: "" });
    }
  });
  window.addEventListener("hashchange", () => { clearTimeout(searchTimer); readHash(); visible = PAGE_SIZE; render(); });

  async function loadCatalog() {
    $("load-error").hidden = true;
    $("retry-load").disabled = true;
    $("status").textContent = "Loading the collection…";
    $("featured").hidden = true;
    try {
      const response = await fetch("eggs.json");
      if (!response.ok) throw new Error("Catalog unavailable");
      const data = await response.json();
      if (!Array.isArray(data.eggs)) throw new Error("Invalid catalog");
      eggs = data.eggs.filter((egg) => typeof egg.path === "string" && !egg.path.startsWith("/") && !egg.path.split("/").some((part) => part === ".." || part === ".") && Object.hasOwn(CATEGORIES, egg.category) && egg.category !== "all").map((entry) => {
        const egg = { ...entry, name: String(entry.name || "Untitled egg"), group: String(entry.group || ""), images: Array.isArray(entry.images) ? entry.images.filter((image) => typeof image === "string") : [] };
        egg.runtimes = new Set(egg.images.map(runtimeFor));
        egg.search = normalize([egg.name, egg.group, egg.category, egg.description, ...egg.images].join(" "));
        return egg;
      });
      byPath = new Map(eggs.map((egg) => [egg.path, egg]));
      loaded = true;
      renderCategories();
      const picks = ["Paper", "Valheim", "Uptime Kuma"].map((name) => eggs.find((egg) => egg.name === name)).filter(Boolean);
      $("featured-list").innerHTML = picks.map(featuredCard).join("");
      render();
    } catch (error) {
      loaded = false;
      $("list").innerHTML = "";
      $("empty").hidden = true;
      $("load-more-wrap").hidden = true;
      $("featured").hidden = true;
      $("load-error").hidden = false;
      $("status").textContent = "Catalog unavailable";
    } finally { $("retry-load").disabled = false; }
  }
  $("retry-load").addEventListener("click", loadCatalog);
  try { if (localStorage.getItem("panasaurus-eggs-view") === "list") state.view = "list"; } catch (error) { /* Defaults work without storage. */ }
  readHash();
  syncControls();
  updateTheme();
  loadCatalog();
})();
