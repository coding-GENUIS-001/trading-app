#!/usr/bin/env node
// diagnose-local.js
// Usage: node diagnose-local.js [url]
// Example: node diagnose-local.js http://localhost:8000

const puppeteer = require('puppeteer');
const url = process.argv[2] || 'http://localhost:8000';

(async ()=>{
  console.log('Launching headless browser...');
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox']});
  try{
    const page = await browser.newPage();
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push({text: msg.text(), location: msg.location()});
    });

    console.log('Opening', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // wait a bit for app to initialize and open websockets
    await page.waitForTimeout(2500);

    const result = await page.evaluate(() => {
      const out = {};
      out.symbolsStatus = null;
      // try fetch status
      try{
        // synchronous fetch is not allowed; but we can inspect cached fetch responses only if available
      }catch(e){ }

      try{
        // symbols.json: attempt to fetch
        // Note: in page context fetch is available
        out.symbolsFetched = true;
      }catch(e){ out.symbolsFetched = false; }

      // gather variables
      try{ out.catalog = typeof symbolCatalog !== 'undefined' ? symbolCatalog.length : null; }catch(e){ out.catalog = null; }
      try{ out.binanceSymbols = (typeof state !== 'undefined' && Array.isArray(state.binanceSymbols)) ? state.binanceSymbols.length : null; }catch(e){ out.binanceSymbols = null; }
      try{ out.binanceSockets = (typeof state !== 'undefined' && state.binanceSockets) ? state.binanceSockets.length : null; }catch(e){ out.binanceSockets = null; }

      try{
        out.wsInfo = (typeof state !== 'undefined' && state.binanceSockets) ? state.binanceSockets.map(s=>({ url: s.url || s.ws && s.ws._url || null, open: !!(s.ws && s.ws.readyState===1), chunkSize: (s.chunk && s.chunk.length) || (s.ws && s.ws._chunk && s.ws._chunk.length) || null })) : null;
      }catch(e){ out.wsInfo = null; }

      try{ out.binanceStatusMapKeys = window.binanceStatusMap ? Object.keys(window.binanceStatusMap).length : null; }catch(e){ out.binanceStatusMapKeys = null; }
      try{ out.binancePriceMapKeys = window.binancePriceMap ? Object.keys(window.binancePriceMap).length : null; }catch(e){ out.binancePriceMapKeys = null; }

      // collect first red error if available from window.__lastConsoleError (not standard). We'll rely on puppeteer's captured errors instead.
      return out;
    });

    // attempt to fetch symbols.json from node via the page
    try{
      const symbolsResp = await page.evaluate(async () => {
        try{ const r = await fetch('symbols.json'); return { ok: r.ok, status: r.status, len: (await r.text()).length }; }catch(e){ return { error: String(e) }; }
      });
      result.symbols = symbolsResp;
    }catch(e){ result.symbols = { error: String(e) }; }

    // attach captured console errors
    result.consoleErrors = errors.slice(0,10);

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    process.exit(0);
  }catch(err){
    console.error('Diagnosis failed:', err);
    try{ await browser.close(); }catch(e){}
    process.exit(2);
  }
})();
