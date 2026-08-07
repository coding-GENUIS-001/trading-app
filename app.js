// app.js - updated: icons, source badge, modal overlay, price flash animation, color-class toggles

const symbolCatalog = [
  { id: "BTCUSDT", type: "crypto", tv: "BINANCE:BTCUSDT", source: "binance" },
  { id: "ETHUSDT", type: "crypto", tv: "BINANCE:ETHUSDT", source: "binance" },
  { id: "SOLUSDT", type: "crypto", tv: "BINANCE:SOLUSDT", source: "binance" },
  { id: "EURUSD", type: "forex", tv: "OANDA:EUR_USD", source: "tv" },
  { id: "GBPUSD", type: "forex", tv: "OANDA:GBP_USD", source: "tv" },
  { id: "XAUUSD", type: "commodity", tv: "OANDA:XAU_USD", source: "tv" },
  { id: "CL1!", type: "commodity", tv: "NYMEX:CL1!", source: "tv" },
  { id: "AAPL", type: "stock", tv: "NASDAQ:AAPL", source: "tv" },
  { id: "TSLA", type: "stock", tv: "NASDAQ:TSLA", source: "tv" },
];

const state = { watchlist: new Set(), cards: {}, lastUpdate: null };

function $(sel) { return document.querySelector(sel); }
function createEl(tag, className) { const e = document.createElement(tag); if (className) e.className = className; return e; }

// small inline SVG helpers
const SVG = {
  starOutline: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.963a1 1 0 00.95.69h4.174c.969 0 1.371 1.24.588 1.81l-3.379 2.455a1 1 0 00-.364 1.118l1.286 3.963c.3.921-.755 1.688-1.54 1.118l-3.379-2.455a1 1 0 00-1.176 0l-3.379 2.455c-.784.57-1.84-.197-1.54-1.118l1.286-3.963a1 1 0 00-.364-1.118L2.06 9.39c-.783-.57-.38-1.81.588-1.81h4.174a1 1 0 00.95-.69l1.286-3.963z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  starSolid: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 .587l3.668 7.431L23.2 9.748l-5.6 5.458L18.8 24 12 19.897 5.2 24l1.2-8.794L.8 9.748l7.532-1.73L12 .587z"/></svg>',
  chartIcon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3v18h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 9l-5.5 6L13 12 9 16 6 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  loadWatchlist();
  renderCatalog();
  connectBinanceForCrypto();
  updateStats();
});

function initUI() {
  $("#searchInput").addEventListener("input", onSearch);
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => { document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); renderCatalog(); });
  });

  $("#watchlistBtn").addEventListener("click", () => { showOverlay(); $("#watchlistModal").style.display = "block"; renderWatchlistModal(); });
  $("#closeWatchlist").addEventListener("click", () => { hideOverlay(); $("#watchlistModal").style.display = "none"; });
  $("#modalOverlay").addEventListener("click", () => { hideOverlay(); $("#watchlistModal").style.display = "none"; $("#chartModal").style.display = "none"; });

  $("#closeChart").addEventListener("click", () => { hideOverlay(); $("#chartModal").style.display = "none"; const c = document.getElementById("tv_chart_container"); if (c) c.innerHTML = ""; });
}

function showOverlay(){ $("#modalOverlay").style.display = "block"; }
function hideOverlay(){ $("#modalOverlay").style.display = "none"; }

function onSearch(){ renderCatalog(); }
function currentFilter(){ const f = document.querySelector(".filter-btn.active"); return f ? f.dataset.filter : "all"; }

function renderCatalog(){
  const grid = $("#ratesGrid"); grid.innerHTML = "";
  const q = $("#searchInput").value.trim().toLowerCase(); const filter = currentFilter();
  const filtered = symbolCatalog.filter(s => { if (filter !== "all" && s.type !== filter) return false; if (!q) return true; return s.id.toLowerCase().includes(q) || (s.tv && s.tv.toLowerCase().includes(q)); });
  filtered.forEach(s => { const card = createRateCard(s); grid.appendChild(card.container); state.cards[s.id] = card; });
  $("#totalPairs").textContent = filtered.length;
}

function createRateCard(sym){
  const container = createEl("div","rate-card"); container.setAttribute("data-symbol", sym.id);
  const header = createEl("div","card-header");
  const left = createEl("div","left");
  const symEl = createEl("div","symbol"); symEl.textContent = sym.id;
  left.appendChild(symEl);
  // source badge
  const src = createEl("div","source-badge"); src.textContent = (sym.source || "tv").toUpperCase(); left.appendChild(src);
  header.appendChild(left);

  const typeEl = createEl("div","type"); typeEl.textContent = sym.type; header.appendChild(typeEl);
  container.appendChild(header);

  const body = createEl("div","card-body");
  const priceEl = createEl("div","price"); priceEl.textContent = "--"; priceEl.dataset.price = "0";
  const changeEl = createEl("div","change"); changeEl.textContent = "--";
  const tsEl = createEl("div","timestamp"); tsEl.textContent = "--:--:--";
  body.appendChild(priceEl); body.appendChild(changeEl); body.appendChild(tsEl); container.appendChild(body);

  const footer = createEl("div","card-footer");
  const watchBtn = createEl("button","watch-btn"); watchBtn.innerHTML = `<span class=\"icon\">${state.watchlist.has(sym.id)?SVG.starSolid:SVG.starOutline}</span><span>${state.watchlist.has(sym.id)?'Remove':'Add'}</span>`;
  watchBtn.addEventListener("click", () => { toggleWatchlist(sym.id, watchBtn); });
  const chartBtn = createEl("button","chart-btn"); chartBtn.innerHTML = `<span class=\"icon\">${SVG.chartIcon}</span><span>Chart</span>`;
  chartBtn.addEventListener("click", () => openChart(sym));
  footer.appendChild(watchBtn); footer.appendChild(chartBtn); container.appendChild(footer);

  return { container, priceEl, changeEl, tsEl, watchBtn, symbol: sym.id };
}

function updateCardPrice(symbol, price, timestamp){
  const card = state.cards[symbol]; if (!card) return;
  const prev = parseFloat(card.priceEl.dataset.price || "0");
  const newPrice = parseFloat(price);
  card.priceEl.dataset.price = newPrice;
  card.priceEl.textContent = Number(newPrice).toLocaleString(undefined,{maximumFractionDigits:8});

  // compute percent change relative to previous non-zero price
  let changePct = 0;
  if (prev > 0) changePct = ((newPrice - prev)/prev) * 100;
  card.changeEl.textContent = (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%";
  card.changeEl.classList.remove('positive','negative');
  if (changePct > 0) card.changeEl.classList.add('positive');
  else if (changePct < 0) card.changeEl.classList.add('negative');

  // timestamp
  card.tsEl.textContent = new Date(timestamp).toLocaleTimeString(); state.lastUpdate = new Date(); $("#lastUpdate").textContent = state.lastUpdate.toLocaleTimeString();

  // price flash animation on card container
  if (prev > 0){
    const c = card.container;
    c.classList.remove('price-flash-up','price-flash-down');
    void c.offsetWidth; // force reflow
    if (newPrice > prev) c.classList.add('price-flash-up'); else if (newPrice < prev) c.classList.add('price-flash-down');
    // remove animation classes after completion
    setTimeout(()=>{ c.classList.remove('price-flash-up','price-flash-down'); }, 900);
  }
}

function toggleWatchlist(symbol, btn){
  if (state.watchlist.has(symbol)){ state.watchlist.delete(symbol); btn.innerHTML = `<span class=\"icon\">${SVG.starOutline}</span><span>Add</span>`; }
  else{ state.watchlist.add(symbol); btn.innerHTML = `<span class=\"icon\">${SVG.starSolid}</span><span>Remove</span>`; }
  persistWatchlist(); updateStats();
}

function persistWatchlist(){ localStorage.setItem("tradingApp_watchlist_v1", JSON.stringify(Array.from(state.watchlist))); }
function loadWatchlist(){ try{ const raw = localStorage.getItem("tradingApp_watchlist_v1"); if (raw) JSON.parse(raw).forEach(s => state.watchlist.add(s)); }catch(e){console.warn("Failed to load watchlist",e);} }

function renderWatchlistModal(){ const content = $("#watchlistContent"); content.innerHTML = ""; if (state.watchlist.size === 0){ content.textContent = "Your watchlist is empty."; $("#watchlistCount").textContent = "0"; return; } $("#watchlistCount").textContent = String(state.watchlist.size);
  state.watchlist.forEach(symbol => { const row = createEl("div","watch-row"); const label = createEl("div"); label.textContent = symbol; const remove = createEl("button","remove-watch"); remove.textContent = "Remove"; remove.addEventListener("click", ()=>{ state.watchlist.delete(symbol); persistWatchlist(); renderWatchlistModal(); if (state.cards[symbol]) state.cards[symbol].watchBtn.innerHTML = `<span class=\"icon\">${SVG.starOutline}</span><span>Add</span>`; updateStats(); }); row.appendChild(label); row.appendChild(remove); content.appendChild(row); }); }

function updateStats(){ $("#watchlistCount").textContent = String(state.watchlist.size); if (state.lastUpdate) $("#lastUpdate").textContent = state.lastUpdate.toLocaleTimeString(); }

// --- Binance WebSocket for crypto trade ticks (prototype) ---
let binanceWS = null;
function connectBinanceForCrypto(){ const cryptoSyms = symbolCatalog.filter(s => s.type === "crypto" && s.id.toUpperCase().endsWith("USDT")).map(s => s.id.toLowerCase()); if (cryptoSyms.length === 0) return; const streamNames = cryptoSyms.map(s => `${s}@trade`).join("/"); const url = `wss://stream.binance.com:9443/stream?streams=${streamNames}`;
  try{
    binanceWS = new WebSocket(url);
    binanceWS.onopen = () => { console.log("Binance WS connected to", url); };
    binanceWS.onmessage = (evt) => {
      try{
        const payload = JSON.parse(evt.data);
        const data = payload.data || payload;
        const s = (data.s || data.symbol || "").toUpperCase();
        const price = parseFloat(data.p || data.price || data.c);
        const ts = data.E || data.T || Date.now();
        if (s && !Number.isNaN(price)) updateCardPrice(s, price, ts);
      }catch(err){ console.warn("Failed to parse binance message", err); }
    };
    binanceWS.onclose = () => { console.log("Binance WS closed, will attempt reconnect in 5s"); setTimeout(connectBinanceForCrypto,5000); };
    binanceWS.onerror = (e) => { console.warn("Binance WS error", e); binanceWS.close(); };
  }catch(e){ console.warn("Unable to create Binance websocket", e); }
}

// --- TradingView chart popup ---
function openChart(sym){ showOverlay(); $("#chartTitle").textContent = sym.id; $("#chartModal").style.display = "block"; try{ if (typeof TradingView === "undefined"){ const s = document.createElement("script"); s.src = "https://s3.tradingview.com/tv.js"; s.onload = () => startTVWidget(sym); document.head.appendChild(s); } else startTVWidget(sym); }catch(e){ console.warn("Failed to open TradingView widget", e); } }

function startTVWidget(sym){ const container = "tv_chart_container"; const el = document.getElementById(container); if (!el) return; el.innerHTML = ""; new TradingView.widget({ width: "100%", height: 520, symbol: sym.tv || sym.id, interval: "D", timezone: "Etc/UTC", theme: "light", style: "1", locale: "en", toolbar_bg: "#f1f3f6", enable_publishing: false, allow_symbol_change: true, container_id: container }); }
