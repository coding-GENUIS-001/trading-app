// app.js - simplified, robust live-data app
// Loads symbols.json, verifies Binance tradability, primes prices, and opens chunked WS streams.

let symbolCatalog = [];
const state = {
  watchlist: new Set(),
  cards: {},
  lastUpdate: null,
  binanceSockets: [],
  binanceSymbols: [],
  nonBinanceSymbols: [],
};

const DEFAULT_CHUNK_SIZE = 30; // lowered to reduce WS URL length

function $(sel){ return document.querySelector(sel); }
function createEl(tag, cls){ const e = document.createElement(tag); if (cls) e.className = cls; return e; }

function ensureStatusBar(){
  let status = $("#streamStatus");
  if (!status){
    const header = document.querySelector('header') || document.body;
    status = createEl('div'); status.id = 'streamStatus';
    status.style.fontSize = '13px'; status.style.color = '#9aa6b2'; status.style.marginTop = '6px';
    header.appendChild(status);
  }
  return status;
}
function updateStatusBar(requested, binanceCount, nonBinanceCount){
  const status = ensureStatusBar();
  status.textContent = `Requested: ${requested} — Binance-streaming: ${binanceCount} — Chart-only: ${nonBinanceCount}`;
}

// --- Render and UI ---
function renderCatalog(){
  const grid = $("#ratesGrid"); if (!grid) return;
  grid.innerHTML = '';
  const q = $("#searchInput") ? $("#searchInput").value.trim().toLowerCase() : '';
  const filter = currentFilter();
  const filtered = symbolCatalog.filter(s => {
    if (filter !== 'all' && s.type !== filter) return false;
    if (!q) return true;
    return (s.id || '').toLowerCase().includes(q) || ((s.tv || '').toLowerCase().includes(q));
  });

  filtered.forEach(s => {
    const card = createRateCard(s);
    grid.appendChild(card.container);
    state.cards[s.id] = card;
  });

  const totalPairsEl = $("#totalPairs"); if (totalPairsEl) totalPairsEl.textContent = String(filtered.length);
}

function createRateCard(sym){
  const container = createEl('div','rate-card'); container.setAttribute('data-symbol', sym.id);
  const header = createEl('div','card-header');
  const left = createEl('div','left');
  const symEl = createEl('div','symbol'); symEl.textContent = sym.id;
  left.appendChild(symEl);
  const src = createEl('div','source-badge'); src.textContent = (sym.source || 'tv').toUpperCase(); left.appendChild(src);
  header.appendChild(left);
  const typeEl = createEl('div','type'); typeEl.textContent = sym.type || '';
  header.appendChild(typeEl);
  container.appendChild(header);

  const body = createEl('div','card-body');
  const priceEl = createEl('div','price'); priceEl.textContent = '--'; priceEl.dataset.price = '0';
  const changeEl = createEl('div','change'); changeEl.textContent = '--';
  const tsEl = createEl('div','timestamp'); tsEl.textContent = '--:--:--';
  body.appendChild(priceEl); body.appendChild(changeEl); body.appendChild(tsEl);
  container.appendChild(body);

  const footer = createEl('div','card-footer');
  const watchBtn = createEl('button','watch-btn'); watchBtn.innerHTML = state.watchlist.has(sym.id) ? '★ Remove' : '☆ Add';
  watchBtn.addEventListener('click', ()=>{ toggleWatchlist(sym.id, watchBtn); });
  const chartBtn = createEl('button','chart-btn'); chartBtn.innerHTML = 'Chart'; chartBtn.addEventListener('click', ()=> openChart(sym));
  footer.appendChild(watchBtn); footer.appendChild(chartBtn); container.appendChild(footer);

  return { container, priceEl, changeEl, tsEl, watchBtn, symbol: sym.id };
}

function updateCardPrice(symbol, price, timestamp){
  const card = state.cards[symbol]; if (!card) return;
  const prev = parseFloat(card.priceEl.dataset.price || '0');
  const newPrice = Number(price);
  if (!isFinite(newPrice)) return;
  card.priceEl.dataset.price = String(newPrice);
  card.priceEl.textContent = newPrice.toLocaleString(undefined,{maximumFractionDigits:8});

  let changePct = 0;
  if (prev > 0) changePct = ((newPrice - prev)/prev) * 100;
  card.changeEl.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%';
  card.changeEl.classList.remove('positive','negative');
  if (changePct > 0) card.changeEl.classList.add('positive'); else if (changePct < 0) card.changeEl.classList.add('negative');

  card.tsEl.textContent = new Date(timestamp || Date.now()).toLocaleTimeString();
  state.lastUpdate = new Date(); const lu = $("#lastUpdate"); if (lu) lu.textContent = state.lastUpdate.toLocaleTimeString();

  if (prev > 0){ const c = card.container; c.classList.remove('price-flash-up','price-flash-down'); void c.offsetWidth; if (newPrice > prev) c.classList.add('price-flash-up'); else if (newPrice < prev) c.classList.add('price-flash-down'); setTimeout(()=>{ c.classList.remove('price-flash-up','price-flash-down'); }, 900); }
}

function toggleWatchlist(symbol, btn){
  if (state.watchlist.has(symbol)){ state.watchlist.delete(symbol); btn.innerHTML = '☆ Add'; }
  else { state.watchlist.add(symbol); btn.innerHTML = '★ Remove'; }
  persistWatchlist(); updateStats();
}
function persistWatchlist(){ try{ localStorage.setItem('tradingApp_watchlist_v1', JSON.stringify(Array.from(state.watchlist))); }catch(e){ console.warn('persist failed', e); } }
function loadWatchlist(){ try{ const raw = localStorage.getItem('tradingApp_watchlist_v1'); if (raw) JSON.parse(raw).forEach(s=>state.watchlist.add(s)); }catch(e){ console.warn('load watchlist failed', e); } }

function renderWatchlistModal(){ const content = $("#watchlistContent"); if (!content) return; content.innerHTML = ''; if (state.watchlist.size === 0){ content.textContent = 'Your watchlist is empty.'; return; } state.watchlist.forEach(symbol => { const row = createEl('div','watch-row'); const label = createEl('div'); label.textContent = symbol; const remove = createEl('button','remove-watch'); remove.textContent = 'Remove'; remove.addEventListener('click', ()=>{ state.watchlist.delete(symbol); persistWatchlist(); renderWatchlistModal(); renderCatalog(); }); row.appendChild(label); row.appendChild(remove); content.appendChild(row); }); }

function updateStats(){ const wc = $("#watchlistCount"); if (wc) wc.textContent = String(state.watchlist.size); const lu = $("#lastUpdate"); if (lu && state.lastUpdate) lu.textContent = state.lastUpdate.toLocaleTimeString(); }

// --- Binance helpers ---
async function fetchSymbolsJson(){ try{ const r = await fetch('symbols.json'); if (!r.ok) throw new Error('Failed to load symbols.json '+r.status); return await r.json(); }catch(e){ console.error('Failed to fetch symbols.json', e); return []; } }

async function fetchBinanceExchangeInfo(){ try{ const r = await fetch('https://api.binance.com/api/v3/exchangeInfo'); if (!r.ok) throw new Error('Binance exchangeInfo failed '+r.status); const data = await r.json(); const tradables = new Set((data.symbols || []).map(s=>s.symbol)); const statusMap = (data.symbols || []).reduce((acc,s)=>{ acc[s.symbol]=s.status; return acc; },{}); return { tradables, statusMap }; }catch(e){ console.error('Failed to fetch Binance exchangeInfo', e); return { tradables: new Set(), statusMap: {} }; } }

async function fetchBinanceAllPrices(){ try{ const r = await fetch('https://api.binance.com/api/v3/ticker/price'); if (!r.ok) throw new Error('Ticker price fetch failed'); const arr = await r.json(); const map = {}; arr.forEach(it => { map[it.symbol] = it.price; }); return map; }catch(e){ console.warn('Failed to fetch binance prices', e); return {}; } }

function chunkArray(arr, size){ const out = []; for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }

function connectBinanceForChunks(chunks){ // close existing
  state.binanceSockets.forEach(s => { try{ s.ws.close(); }catch(e){} }); state.binanceSockets = [];
  chunks.forEach((chunk, idx) => {
    const streams = chunk.map(s => s.toLowerCase() + '@trade').join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    try{
      const ws = new WebSocket(url);
      ws._chunk = chunk; ws._idx = idx; ws._url = url;
      ws.onopen = ()=> console.log('WS open chunk', idx, chunk.length);
      ws.onmessage = (evt)=>{
        try{ const payload = JSON.parse(evt.data); const data = payload.data || payload; const s = (data.s || data.symbol || '').toUpperCase(); const price = parseFloat(data.p || data.price || data.c); const ts = data.E || data.T || Date.now(); if (s && !Number.isNaN(price)) updateCardPrice(s, price, ts); }catch(e){ console.warn('ws parse err', e); }
      };
      ws.onclose = (e)=>{ console.warn('WS closed chunk', idx, e && e.code); setTimeout(()=> connectBinanceChunk(chunk, idx), 3000); };
      ws.onerror = (e)=>{ console.warn('WS error chunk', idx, e); try{ ws.close(); }catch(e){} };
      state.binanceSockets.push({ ws, chunk, url });
    }catch(e){ console.warn('Failed to open WS for chunk', idx, e); }
  });
  updateStatusBar(symbolCatalog.length, state.binanceSymbols.length, state.nonBinanceSymbols.length);
}

function connectBinanceChunk(chunk, idx){ const streams = chunk.map(s => s.toLowerCase() + '@trade').join('/'); const url = `wss://stream.binance.com:9443/stream?streams=${streams}`; try{ const ws = new WebSocket(url); ws._chunk = chunk; ws._idx = idx; ws._url = url; ws.onopen = ()=> console.log('Reconnected WS chunk', idx); ws.onmessage = (evt)=>{ try{ const payload = JSON.parse(evt.data); const data = payload.data || payload; const s = (data.s || data.symbol || '').toUpperCase(); const price = parseFloat(data.p || data.price || data.c); const ts = data.E || data.T || Date.now(); if (s && !Number.isNaN(price)) updateCardPrice(s, price, ts); }catch(e){ console.warn('ws parse err', e); } }; ws.onclose = ()=> { console.warn('reconnect closed', idx); setTimeout(()=> connectBinanceChunk(chunk, idx), 3000); }; ws.onerror = (e)=>{ console.warn('reconnect ws error', e); try{ ws.close(); }catch(e){} }; state.binanceSockets.push({ ws, chunk, url }); }catch(e){ console.warn('connectBinanceChunk failed', e); } }

// Entry
document.addEventListener('DOMContentLoaded', async ()=>{
  initUI(); loadWatchlist();
  const requested = await fetchSymbolsJson(); if (!Array.isArray(requested) || requested.length===0){ console.error('symbols.json invalid or empty'); symbolCatalog = []; return; }
  symbolCatalog = requested;
  updateStatusBar(symbolCatalog.length, 0, symbolCatalog.length);
  renderCatalog();

  const { tradables, statusMap } = await fetchBinanceExchangeInfo();
  const binanceSupported = []; const nonBinance = [];
  symbolCatalog.forEach(s => { const id = (s.id || s).toUpperCase(); if (tradables.has(id) && statusMap[id] === 'TRADING') binanceSupported.push(id); else nonBinance.push(id); });
  state.binanceSymbols = binanceSupported; state.nonBinanceSymbols = nonBinance;
  updateStatusBar(symbolCatalog.length, binanceSupported.length, nonBinance.length);

  const priceMap = await fetchBinanceAllPrices();
  state.binanceSymbols.forEach(sym => { if (priceMap[sym]) updateCardPrice(sym, parseFloat(priceMap[sym]), Date.now()); });

  const chunks = chunkArray(state.binanceSymbols, DEFAULT_CHUNK_SIZE);
  connectBinanceForChunks(chunks);
  updateStats();
});

// UI helpers
function initUI(){ if ($('#searchInput')) $('#searchInput').addEventListener('input', onSearch); document.querySelectorAll('.filter-btn').forEach(btn=>{ btn.addEventListener('click', ()=>{ document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderCatalog(); }); }); const watchBtn = $('#watchlistBtn'); if (watchBtn) watchBtn.addEventListener('click', ()=>{ showOverlay(); const m = $('#watchlistModal'); if (m) m.style.display = 'block'; renderWatchlistModal(); }); const closeWatch = $('#closeWatchlist'); if (closeWatch) closeWatch.addEventListener('click', ()=>{ hideOverlay(); const m = $('#watchlistModal'); if (m) m.style.display = 'none'; }); const overlay = $('#modalOverlay'); if (overlay) overlay.addEventListener('click', ()=>{ hideOverlay(); const wm = $('#watchlistModal'); if (wm) wm.style.display = 'none'; const cm = $('#chartModal'); if (cm) cm.style.display = 'none'; }); const closeChart = $('#closeChart'); if (closeChart) closeChart.addEventListener('click', ()=>{ hideOverlay(); const cm = $('#chartModal'); if (cm) cm.style.display = 'none'; }); }
function showOverlay(){ const o = $('#modalOverlay'); if (o) o.style.display = 'block'; }
function hideOverlay(){ const o = $('#modalOverlay'); if (o) o.style.display = 'none'; }
function onSearch(){ renderCatalog(); }
function currentFilter(){ const f = document.querySelector('.filter-btn.active'); return f ? f.dataset.filter : 'all'; }

function openChart(sym){ try{ showOverlay(); const title = $('#chartTitle'); if (title) title.textContent = sym.id; const cm = $('#chartModal'); if (cm) cm.style.display = 'block'; // load TradingView only when needed
    startTVWidget(sym);
  }catch(e){ console.warn('openChart failed', e); } }

function startTVWidget(sym){ try{ if (typeof TradingView === 'undefined') { console.log('TradingView not loaded'); return; } const container = 'tv_chart_container'; const el = document.getElementById(container); if (!el) return; el.innerHTML = ''; new TradingView.widget({ width:'100%', height:520, symbol: sym.id, interval:'60', container_id: container, autosize: true }); }catch(e){ console.warn('startTVWidget error', e); } }
