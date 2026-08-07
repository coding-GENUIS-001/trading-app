// Lightweight live-data prototype
// - Binance combined websocket for crypto trades (no API key).
// - Watchlist persisted to localStorage.
// - TradingView widget opener for charts (no API key, uses TradingView public widget).

const symbolCatalog = [
  // crypto (Binance symbols)
  { id: "BTCUSDT", type: "crypto", tv: "BINANCE:BTCUSDT", source: "binance" },
  { id: "ETHUSDT", type: "crypto", tv: "BINANCE:ETHUSDT", source: "binance" },
  { id: "SOLUSDT", type: "crypto", tv: "BINANCE:SOLUSDT", source: "binance" },
  // forex & commodities & stocks: chartable via TradingView widget (prices may be unavailable without paid API)
  { id: "EURUSD", type: "forex", tv: "OANDA:EUR_USD", source: "tv" },
  { id: "GBPUSD", type: "forex", tv: "OANDA:GBP_USD", source: "tv" },
  { id: "XAUUSD", type: "commodity", tv: "OANDA:XAU_USD", source: "tv" }, // Gold
  { id: "CL1!", type: "commodity", tv: "NYMEX:CL1!", source: "tv" }, // Crude futures (chart)
  { id: "AAPL", type: "stock", tv: "NASDAQ:AAPL", source: "tv" },
  { id: "TSLA", type: "stock", tv: "NASDAQ:TSLA", source: "tv" },
];

const state = {
  watchlist: new Set(),
  cards: {}, // symbol -> DOM elements
  lastUpdate: null
};

// Utilities
function $(sel) { return document.querySelector(sel); }
function createEl(tag, className) { const e = document.createElement(tag); if (className) e.className = className; return e; }

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
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderCatalog();
    });
  });

  $("#watchlistBtn").addEventListener("click", () => {
    $("#watchlistModal").style.display = "block";
    renderWatchlistModal();
  });
  $("#closeWatchlist").addEventListener("click", () => {
    $("#watchlistModal").style.display = "none";
  });
  $("#modalOverlay").addEventListener("click", () => {
    $("#watchlistModal").style.display = "none";
  });

  $("#closeChart").addEventListener("click", () => {
    $("#chartModal").style.display = "none";
    // Destroy TradingView widget by clearing the container
    const c = document.getElementById("tv_chart_container");
    if (c) c.innerHTML = "";
  });
}

function onSearch() {
  renderCatalog();
}

function currentFilter() {
  const f = document.querySelector(".filter-btn.active");
  return f ? f.dataset.filter : "all";
}

function renderCatalog() {
  const grid = $("#ratesGrid");
  grid.innerHTML = "";
  const q = $("#searchInput").value.trim().toLowerCase();
  const filter = currentFilter();

  const filtered = symbolCatalog.filter(s => {
    if (filter !== "all" && s.type !== filter) return false;
    if (!q) return true;
    return s.id.toLowerCase().includes(q) || (s.tv && s.tv.toLowerCase().includes(q));
  });

  filtered.forEach(s => {
    const card = createRateCard(s);
    grid.appendChild(card.container);
    state.cards[s.id] = card;
  });

  $("#totalPairs").textContent = filtered.length;
}

function createRateCard(sym) {
  const container = createEl("div", "rate-card");
  container.setAttribute("data-symbol", sym.id);

  const header = createEl("div", "card-header");
  header.innerHTML = `<div class="symbol">${sym.id}</div><div class="type">${sym.type}</div>`;
  container.appendChild(header);

  const body = createEl("div", "card-body");
  const priceEl = createEl("div", "price"); priceEl.textContent = "--";
  const changeEl = createEl("div", "change"); changeEl.textContent = "--";
  const tsEl = createEl("div", "timestamp"); tsEl.textContent = "--:--:--";

  body.appendChild(priceEl);
  body.appendChild(changeEl);
  body.appendChild(tsEl);
  container.appendChild(body);

  const footer = createEl("div", "card-footer");
  const watchBtn = createEl("button", "watch-btn");
  watchBtn.textContent = state.watchlist.has(sym.id) ? "Remove" : "Add";
  watchBtn.addEventListener("click", () => toggleWatchlist(sym.id, watchBtn));
  const chartBtn = createEl("button", "chart-btn"); chartBtn.textContent = "Chart";
  chartBtn.addEventListener("click", () => openChart(sym));

  footer.appendChild(watchBtn);
  footer.appendChild(chartBtn);
  container.appendChild(footer);

  return {
    container, priceEl, changeEl, tsEl, watchBtn, symbol: sym.id
  };
}

function updateCardPrice(symbol, price, timestamp) {
  const card = state.cards[symbol];
  if (!card) return;
  const prev = parseFloat(card.priceEl.dataset.price || "0");
  card.priceEl.dataset.price = price;
  card.priceEl.textContent = Number(price).toLocaleString(undefined, {maximumFractionDigits:8});
  // small change calculation
  const prevVal = prev || parseFloat(price);
  const change = ((price - prevVal) / Math.max(prevVal, 1)) * 100;
  card.changeEl.textContent = (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
  card.tsEl.textContent = new Date(timestamp).toLocaleTimeString();
  state.lastUpdate = new Date();
  $("#lastUpdate").textContent = state.lastUpdate.toLocaleTimeString();
}

function toggleWatchlist(symbol, btn) {
  if (state.watchlist.has(symbol)) {
    state.watchlist.delete(symbol);
    btn.textContent = "Add";
  } else {
    state.watchlist.add(symbol);
    btn.textContent = "Remove";
  }
  persistWatchlist();
  updateStats();
}

function persistWatchlist() {
  localStorage.setItem("tradingApp_watchlist_v1", JSON.stringify(Array.from(state.watchlist)));
}

function loadWatchlist() {
  try {
    const raw = localStorage.getItem("tradingApp_watchlist_v1");
    if (raw) {
      JSON.parse(raw).forEach(s => state.watchlist.add(s));
    }
  } catch (e) {
    console.warn("Failed to load watchlist", e);
  }
}

function renderWatchlistModal() {
  const content = $("#watchlistContent");
  content.innerHTML = "";
  if (state.watchlist.size === 0) {
    content.textContent = "Your watchlist is empty.";
    $("#watchlistCount").textContent = "0";
    return;
  }
  $("#watchlistCount").textContent = String(state.watchlist.size);

  state.watchlist.forEach(symbol => {
    const row = createEl("div", "watch-row");
    row.textContent = symbol;
    const remove = createEl("button", "remove-watch");
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.watchlist.delete(symbol);
      persistWatchlist();
      renderWatchlistModal();
      if (state.cards[symbol]) state.cards[symbol].watchBtn.textContent = "Add";
      updateStats();
    });
    row.appendChild(remove);
    content.appendChild(row);
  });
}

function updateStats() {
  $("#watchlistCount").textContent = String(state.watchlist.size);
  if (state.lastUpdate) $("#lastUpdate").textContent = state.lastUpdate.toLocaleTimeString();
}

// --- Binance WebSocket for crypto trade ticks (prototype) ---
let binanceWS = null;

function connectBinanceForCrypto() {
  // Collect crypto symbols that are Binance-compatible (ending with USDT)
  const cryptoSyms = symbolCatalog.filter(s => s.type === "crypto" && s.id.toUpperCase().endsWith("USDT")).map(s => s.id.toLowerCase());
  if (cryptoSyms.length === 0) return;

  const streamNames = cryptoSyms.map(s => `${s}@trade`).join("/");
  const url = `wss://stream.binance.com:9443/stream?streams=${streamNames}`;

  try {
    binanceWS = new WebSocket(url);
    binanceWS.onopen = () => {
      console.log("Binance WS connected to", url);
    };
    binanceWS.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        const data = payload.data || payload;
        // For combined stream payload, data will be inside `data`
        const s = (data.s || data.symbol || "").toUpperCase();
        const price = parseFloat(data.p || data.price || data.c); // trade price fields vary; p is common for trade
        const ts = data.E || data.T || Date.now();
        if (s && !Number.isNaN(price)) {
          updateCardPrice(s, price, ts);
        }
      } catch (err) {
        console.warn("Failed to parse binance message", err);
      }
    };
    binanceWS.onclose = () => {
      console.log("Binance WS closed, will attempt reconnect in 5s");
      setTimeout(connectBinanceForCrypto, 5000);
    };
    binanceWS.onerror = (e) => {
      console.warn("Binance WS error", e);
      binanceWS.close();
    };
  } catch (e) {
    console.warn("Unable to create Binance websocket", e);
  }
}

// --- TradingView chart popup ---
function openChart(sym) {
  // show modal
  $("#chartTitle").textContent = sym.id;
  $("#chartModal").style.display = "block";

  // create widget (uses TradingView global)
  try {
    if (typeof TradingView === "undefined") {
      console.warn("TradingView script not loaded yet - loading dynamically");
      const s = document.createElement("script");
      s.src = "https://s3.tradingview.com/tv.js";
      s.onload = () => startTVWidget(sym);
      document.head.appendChild(s);
    } else {
      startTVWidget(sym);
    }
  } catch (e) {
    console.warn("Failed to open TradingView widget", e);
  }
}

function startTVWidget(sym) {
  const container = "tv_chart_container";
  // clear any previous widget DOM
  const el = document.getElementById(container);
  if (!el) return;
  el.innerHTML = "";

  new TradingView.widget({
    width: "100%",
    height: 520,
    symbol: sym.tv || sym.id,
    interval: "D",
    timezone: "Etc/UTC",
    theme: "light",
    style: "1",
    locale: "en",
    toolbar_bg: "#f1f3f6",
    enable_publishing: false,
    allow_symbol_change: true,
    container_id: container
  });
}
