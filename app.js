// app.js - real-time streaming with Binance verification and chunked WS connections
// Updated to:
//  - Load symbols.json (250 pairs)
//  - Verify which pairs are listed and TRADING on Binance via /api/v3/exchangeInfo
//  - Fetch snapshot prices via /api/v3/ticker/price for initial values
//  - Open chunked combined WebSocket connections to Binance trade streams (@trade)
//  - Fallback: use snapshot price when WS message hasn't arrived yet
//  - UI shows requested / Binance-supported / non-Binance counts

let symbolCatalog = []; // will be loaded from symbols.json
const state = {
  watchlist: new Set(),
  cards: {},
  lastUpdate: null,
  binanceSockets: [],
  binanceSymbols: [],
  nonBinanceSymbols: [],
};

const DEFAULT_CHUNK_SIZE = 50; // safe default; adjust if needed

function $(sel) { return document.querySelector(sel); }
function createEl(tag, className) { const e = document.createElement(tag); if (className) e.className = className; return e; }

// Inline SVGs
const SVG = {
  starOutline: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.963a1 1 0 00.95.69h4.174c.969 0 1.371 1.24.588 1.81l-3.379 2.455a1 1 0 00-.364 1.118l1.286 3.963c.3.921-.755 1.688-1.54 1.118l-3.379-2.455a1 1 0 00-1.176 0l-3.379 2.455c-.784.57-1.84-.197-1.54-1.118l1.286-3.963a1 1 0 00-.364-1.118L2.06 9.39c-.783-.57-.38-1.81.588-1.81h4.174a1 1 0 00.95-.69l1.286-3.963z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  starSolid: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 .587l3.668 7.431L23.2 9.748l-5.6 5.458L18.8 24 12 19.897 5.2 24l1.2-8.794L.8 9.748l7.532-1.73L12 .587z"/></svg>',
  chartIcon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3v18h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 9l-5.5 6L13 12 9 16 6 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

// UI helpers
function ensureStatusBar(){
  let status = $("#streamStatus");
  if (!status){
    const header = document.querySelector('header') || document.body;
    status = createEl('div');
    status.id = 'streamStatus';
    status.style.fontSize = '13px';
    status.style.color = '#9aa6b2';
    status.style.marginTop = '6px';
    header.appendChild(status);
  }
  return status;
}

function updateStatusBar(requested, binanceCount, nonBinanceCount){
  const status = ensureStatusBar();
  status.textContent = `Requested: ${requested} — Binance-streaming: ${binanceCount} — Chart-only: ${nonBinanceCount}`;
}

// Existing UI functions (renderCatalog, createRateCard, updateCardPrice, etc.)
function renderCatalog(){
  const grid = $("#ratesGrid"); if (!grid) return;
  grid.innerHTML = "";
  const q = $("#searchInput") ? $("#searchInput").value.trim().toLowerCase() : '';
  const filter = currentFilter();
  const filtered = symbolCatalog.filter(s => { if (filter !== "all" && s.type !== filter) return false; if (!q) return true; return s.id.toLowerCase().includes(q) || (s.tv && s.tv.toLowerCase().includes(q)); });
  filtered.forEach(s => { const card = createRateCard(s); grid.appendChild(card.container); state.cards[s.id] = card; });
  const totalPairsEl = $("#totalPairs"); if (totalPairsEl) totalPairsEl.textContent = filtered.length;
}

function createRateCard(sym){
  const container = createEl("div","rate-card"); container.setAttribute("data-symbol", sym.id);
  const header = createEl("div","card-header");
  const left = createEl("div","left");
  const symEl = createEl("div","symbol"); symEl.textContent = sym.id;
  left.appendChild(symEl);
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
  if (Number.isNaN(newPrice)) return;
  card.priceEl.dataset.price = newPrice;
  card.priceEl.textContent = Number(newPrice).toLocaleString(undefined,{maximumFractionDigits:8});

  let changePct = 0;
  if (prev > 0) changePct = ((newPrice - prev)/prev) * 100;
  card.changeEl.textContent = (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%";
  card.changeEl.classList.remove('positive','negative');
  if (changePct > 0) card.changeEl.classList.add('positive');
  else if (changePct < 0) card.changeEl.classList.add('negative');

  card.tsEl.textContent = new Date(timestamp).toLocaleTimeString(); state.lastUpdate = new Date(); const lu = $("#lastUpdate"); if (lu) lu.textContent = state.lastUpdate.toLocaleTimeString();

  if (prev > 0){
    const c = card.container;
    c.classList.remove('price-flash-up','price-flash-down');
    void c.offsetWidth;
    if (newPrice > prev) c.classList.add('price-flash-up'); else if (newPrice < prev) c.classList.add('price-flash-down');
    setTimeout(()=>{ c.classList.remove('price-flash-up','price-flash-down'); }, 900);
  }
}

function toggleWatchlist(symbol, btn){
  if (state.watchlist.has(symbol)){ state.watchlist.delete(symbol); btn.innerHTML = `<span class=\"icon\">${SVG.starOutline}</span><span>Add</span>`; }
  else{ state.watchlist.add(symbol); btn.innerHTML = `<span class=\"icon\">${SVG.starSolid}</span><span>Remove</span>`; }
  persistWatchlist(); updateStats();
}

function persistWatchlist(){ try{ localStorage.setItem("tradingApp_watchlist_v1", JSON.stringify(Array.from(state.watchlist))); }catch(e){console.warn('Failed to persist watchlist',e);} }
function loadWatchlist(){ try{ const raw = localStorage.getItem("tradingApp_watchlist_v1"); if (raw) JSON.parse(raw).forEach(s => state.watchlist.add(s)); }catch(e){console.warn("Failed to load watchlist",e);} }

function renderWatchlistModal(){ const content = $("#watchlistContent"); if (!content) return; content.innerHTML = ""; if (state.watchlist.size === 0){ content.textContent = "Your watchlist is empty."; $("#watchlistCount").textContent = "0"; return; } $("#watchlistCount").textContent = String(state.watchlist.size);
  state.watchlist.forEach(symbol => { const row = createEl("div","watch-row"); const label = createEl("div"); label.textContent = symbol; const remove = createEl("button","remove-watch"); remove.textContent = "Remove"; remove.addEventListener("click", ()=>{ state.watchlist.delete(symbol); persistWatchlist(); renderWatchlistModal(); if (state.cards[symbol]) state.cards[symbol].watchBtn.innerHTML = `<span class=\\"icon\\">${SVG.starOutline}</span><span>Add</span>`; updateStats(); }); row.appendChild(label); row.appendChild(remove); content.appendChild(row); }); }

function updateStats(){ const wc = $("#watchlistCount"); if (wc) wc.textContent = String(state.watchlist.size); const lu = $("#lastUpdate"); if (lu && state.lastUpdate) lu.textContent = state.lastUpdate.toLocaleTimeString(); }

// Binance helpers
async function fetchSymbolsJson(){
  try{
    const r = await fetch('symbols.json');
    if (!r.ok) throw new Error('Failed to load symbols.json');
    return await r.json();
  }catch(e){ console.error('Failed to fetch symbols.json', e); return []; }
}

async function fetchBinanceExchangeInfo(){
  try{
    const r = await fetch('https://api.binance.com/api/v3/exchangeInfo');
    if (!r.ok) throw new Error('Binance exchangeInfo failed');
    const data = await r.json();
    const tradables = new Set((data.symbols || []).map(s => s.symbol));
    const statusMap = (data.symbols || []).reduce((acc,s) => { acc[s.symbol] = s.status; return acc; }, {});
    return { tradables, statusMap };
  }catch(e){ console.error('Failed to fetch Binance exchangeInfo', e); return { tradables: new Set(), statusMap: {} }; }
}

async function fetchBinanceAllPrices(){
  try{
    const r = await fetch('https://api.binance.com/api/v3/ticker/price');
    if (!r.ok) throw new Error('Ticker price fetch failed');
    const arr = await r.json(); // [{symbol,price},...]
    const map = {};
    arr.forEach(it => { map[it.symbol] = it.price; });
    return map;
  }catch(e){ console.warn('Failed to fetch binance prices', e); return {}; }
}

function chunkArray(arr, size){ const out = []; for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }

function connectBinanceForChunks(chunks){
  // close existing sockets
  state.binanceSockets.forEach(s => { try{ s.ws.close(); }catch(e){} });
  state.binanceSockets = [];

  chunks.forEach((chunk, idx) => {
    const streams = chunk.map(s => s.toLowerCase() + '@trade').join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    const ws = new WebSocket(url);
    ws._chunk = chunk; ws._url = url; ws._idx = idx;

    ws.onopen = () => { console.log('Binance WS open for chunk', idx, 'symbols', chunk.length); };
    ws.onmessage = (evt) => {
      try{
        const payload = JSON.parse(evt.data);
        const data = payload.data || payload;
        const s = (data.s || data.symbol || '').toUpperCase();
        const price = parseFloat(data.p || data.price || data.c);
        const ts = data.E || data.T || Date.now();
        if (s && !Number.isNaN(price)) updateCardPrice(s, price, ts);
      }catch(err){ console.warn('Failed to parse binance message', err); }
    };
    ws.onclose = (e) => {
      console.warn('Binance WS closed for chunk', idx, 'reconnect in 3s', e && e.code);
      setTimeout(()=> connectBinanceChunk(chunk, idx), 3000);
    };
    ws.onerror = (e) => { console.warn('Binance WS error for chunk', idx, e); ws.close(); };

    state.binanceSockets.push({ ws, chunk, url });
  });
}

// helper to reconnect a single chunk (used onclose handler)
function connectBinanceChunk(chunk, idx){
  const streams = chunk.map(s => s.toLowerCase() + '@trade').join('/');
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  const ws = new WebSocket(url);
  ws._chunk = chunk; ws._url = url; ws._idx = idx;
  ws.onopen = () => { console.log('Reconnected Binance WS chunk', idx); };
  ws.onmessage = (evt) => { try{ const payload = JSON.parse(evt.data); const data = payload.data || payload; const s = (data.s || data.symbol || '').toUpperCase(); const price = parseFloat(data.p || data.price || data.c); const ts = data.E || data.T || Date.now(); if (s && !Number.isNaN(price)) updateCardPrice(s, price, ts); }catch(err){ console.warn('Failed to parse binance message', err); } };
  ws.onclose = () => { console.warn('Reconnected ws closed for chunk', idx, 'retry 3s'); setTimeout(()=> connectBinanceChunk(chunk, idx), 3000); };
  ws.onerror = (e) => { console.warn('ws error', e); ws.close(); };
  state.binanceSockets.push({ ws, chunk, url });
}

// Entry point
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  loadWatchlist();
  // Load symbols list
  const requested = await fetchSymbolsJson();
  if (!Array.isArray(requested)){
    console.error('symbols.json invalid'); return;
  }
  symbolCatalog = requested;

  // update UI counters
  const requestedCount = symbolCatalog.length;
  updateStatusBar(requestedCount, 0, requestedCount);

  renderCatalog();

  // Verify Binance symbols
  const { tradables, statusMap } = await fetchBinanceExchangeInfo();
  const binanceSupported = [];
  const nonBinance = [];
  symbolCatalog.forEach(s => {
    if (tradables.has(s.id) && statusMap[s.id] === 'TRADING') binanceSupported.push(s.id);
    else nonBinance.push(s.id);
  });
  state.binanceSymbols = binanceSupported; state.nonBinanceSymbols = nonBinance;
  updateStatusBar(requestedCount, binanceSupported.length, nonBinance.length);

  // Fetch initial prices snapshot (single call)
  const priceMap = await fetchBinanceAllPrices();

  // Prime initial prices for Binance symbols
  state.binanceSymbols.forEach(sym => {
    if (priceMap[sym]){
      updateCardPrice(sym, parseFloat(priceMap[sym]), Date.now());
    }
  });

  // Connect in chunks
  const chunkSize = DEFAULT_CHUNK_SIZE;
  const chunks = chunkArray(state.binanceSymbols, chunkSize);
  connectBinanceForChunks(chunks);

  // If any binance symbols did not get a price in the snapshot, optionally fetch per-symbol when idle (skipped for now)

  // Keep the UI active
  updateStats();
});

// --- TradingView chart popup (unchanged) ---
function initUI() {
  if ($("#searchInput")) $("#searchInput").addEventListener("input", onSearch);
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => { document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); renderCatalog(); });
  });

  const watchBtn = $("#watchlistBtn"); if (watchBtn) watchBtn.addEventListener("click", () => { showOverlay(); const m = $("#watchlistModal"); if (m) m.style.display = "block"; renderWatchlistModal(); });
  const closeWatch = $("#closeWatchlist"); if (closeWatch) closeWatch.addEventListener("click", () => { hideOverlay(); const m = $("#watchlistModal"); if (m) m.style.display = "none"; });
  const overlay = $("#modalOverlay"); if (overlay) overlay.addEventListener("click", () => { hideOverlay(); const wm = $("#watchlistModal"); if (wm) wm.style.display = "none"; const cm = $("#chartModal"); if (cm) cm.style.display = "none"; });
  const closeChart = $("#closeChart"); if (closeChart) closeChart.addEventListener("click", () => { hideOverlay(); const cm = $("#chartModal"); if (cm) cm.style.display = "none"; const c = document.getElementById("tv_chart_container"); if (c) c.innerHTML = ""; });
}

function showOverlay(){ const o = $("#modalOverlay"); if (o) o.style.display = "block"; }
function hideOverlay(){ const o = $("#modalOverlay"); if (o) o.style.display = "none"; }

function onSearch(){ renderCatalog(); }
function currentFilter(){ const f = document.querySelector(".filter-btn.active"); return f ? f.dataset.filter : "all"; }

function openChart(sym){ showOverlay(); const title = $("#chartTitle"); if (title) title.textContent = sym.id; const cm = $("#chartModal"); if (cm) cm.style.display = "block"; try{ if (typeof TradingView === "undefined"){ const s = document.createElement("script"); s.src = "https://s3.tradingview.com/tv.js"; s.onload = () => startTVWidget(sym); document.head.appendChild(s); } else startTVWidget(sym); }catch(e){ console.warn("Failed to open TradingView widget", e); } }

function startTVWidget(sym){ const container = "tv_chart_container"; const el = document.getElementById(container); if (!el) return; el.innerHTML = ""; new TradingView.widget({ width: "100%", height: 520, symbol: sym.tv || sym.id, interval: "D", timezone: "Etc/UTC", theme: "light", style: "1", locale: "en", toolbar_bg: "#f1f3f6", enable_publishing: false, allow_symbol_change: true, container_id: container }); }

