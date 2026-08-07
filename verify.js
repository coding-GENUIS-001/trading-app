// verify.js - runtime verification helper
// Adds a small UI to the page to verify up to 250 symbols against Binance exchangeInfo
// Usage: Enter comma-separated symbols (e.g. BTCUSDT,ETHUSDT) and click Verify Selected,
// or click Verify All to check every symbol in symbolCatalog.

(function(){
  function el(tag, cls, text){ const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  function createPanel(){
    const container = el('div','verify-panel');
    container.style.position = 'fixed';
    container.style.right = '18px';
    container.style.bottom = '18px';
    container.style.width = '360px';
    container.style.maxHeight = '60vh';
    container.style.overflow = 'auto';
    container.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))';
    container.style.border = '1px solid rgba(255,255,255,0.04)';
    container.style.borderRadius = '10px';
    container.style.padding = '12px';
    container.style.boxShadow = '0 10px 30px rgba(2,6,23,0.6)';
    container.style.zIndex = '2000';

    const title = el('div',null,'Verify symbols (Binance)');
    title.style.fontWeight = '700'; title.style.marginBottom = '8px';
    container.appendChild(title);

    const input = el('input','verify-input'); input.placeholder = 'Comma-separated symbols (or leave empty to verify all)';
    input.style.width = '100%'; input.style.padding = '8px'; input.style.borderRadius = '8px'; input.style.border = '1px solid rgba(255,255,255,0.06)'; input.style.background = 'transparent'; input.style.color = 'inherit';
    container.appendChild(input);

    const btnRow = el('div',''); btnRow.style.display='flex'; btnRow.style.gap='8px'; btnRow.style.marginTop='8px';
    const verifySelected = el('button','verify-btn','Verify Selected');
    const verifyAll = el('button','verify-btn','Verify All');
    verifySelected.style.flex='1'; verifyAll.style.flex='1';
    btnRow.appendChild(verifySelected); btnRow.appendChild(verifyAll);
    container.appendChild(btnRow);

    const output = el('div','verify-output'); output.style.marginTop='10px'; output.style.fontSize='13px'; output.style.color='var(--muted)'; container.appendChild(output);

    const spinner = el('div','verify-spinner'); spinner.style.display='none'; spinner.textContent='Running...'; spinner.style.marginTop='8px'; container.appendChild(spinner);

    document.body.appendChild(container);

    verifySelected.addEventListener('click', async ()=>{
      const raw = input.value.trim();
      const list = raw ? raw.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean) : [];
      if (list.length===0){ output.textContent = 'Enter symbols (comma-separated) or click Verify All'; return; }
      spinner.style.display='block'; output.innerHTML='';
      const res = await verifySymbols(list);
      spinner.style.display='none'; renderResults(res, output);
      console.log('verify-selected results', res);
    });

    verifyAll.addEventListener('click', async ()=>{
      input.value = '';
      output.innerHTML = '';
      spinner.style.display='block';
      const all = (typeof symbolCatalog !== 'undefined' && Array.isArray(symbolCatalog)) ? symbolCatalog.map(s=>s.id) : [];
      const res = await verifySymbols(all);
      spinner.style.display='none'; renderResults(res, output);
      console.log('verify-all results', res);
    });
  }

  function renderResults(results, containerEl){
    const ok = results.filter(r=>r.binanceStatus === 'TRADING');
    const nok = results.filter(r=>r.binanceStatus !== 'TRADING');
    containerEl.innerHTML = '';
    const summary = el('div',null,`Checked: ${results.length} — Binance TRADING: ${ok.length} — Not TRADING / missing: ${nok.length}`);
    summary.style.marginBottom='8px'; containerEl.appendChild(summary);

    // show up to 100 results (avoid huge DOM)
    const list = el('div');
    results.slice(0,200).forEach(r=>{
      const row = el('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.borderTop='1px solid rgba(255,255,255,0.02)'; row.style.padding='6px 0';
      const left = el('div',null,`${r.symbol} ${r.inCatalog? '• in catalog':''} ${r.subscribed? '• subscribed':''}`);
      left.style.fontSize='13px';
      const right = el('div',null, r.binanceStatus === 'TRADING' ? `TRADING • ${r.price}` : (r.binanceStatus || 'MISSING'));
      right.style.fontSize='13px'; right.style.color = r.binanceStatus === 'TRADING' ? 'var(--good)' : 'var(--bad)';
      row.appendChild(left); row.appendChild(right); list.appendChild(row);
    });
    containerEl.appendChild(list);

    // show a button to copy results JSON
    const copyBtn = el('button',null,'Copy JSON'); copyBtn.style.marginTop='8px';
    copyBtn.addEventListener('click', ()=>{ navigator.clipboard.writeText(JSON.stringify(results,null,2)).then(()=>alert('Copied')); });
    containerEl.appendChild(copyBtn);
  }

  async function verifySymbols(symbols){
    // limit to 250 symbols to avoid long runs
    const out = [];
    // We'll fetch exchangeInfo symbol-by-symbol using ?symbol= to be specific
    for (let i=0;i<symbols.length;i++){
      const sym = symbols[i];
      const r = { symbol: sym, binanceStatus: null, price: null, inCatalog: false, subscribed: false };
      try{
        // check in app catalog
        if (typeof symbolCatalog !== 'undefined' && Array.isArray(symbolCatalog)){
          r.inCatalog = symbolCatalog.some(s=> (s.id || s).toUpperCase() === sym);
        }
        if (typeof state !== 'undefined' && Array.isArray(state.binanceSymbols)){
          r.subscribed = state.binanceSymbols.includes(sym);
        }

        // exchangeInfo for single symbol
        const ei = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${sym}`);
        if (ei.status === 200){
          const d = await ei.json();
          if (d && Array.isArray(d.symbols) && d.symbols.length>0){ r.binanceStatus = d.symbols[0].status; }
        } else if (ei.status === 400 || ei.status === 404){
          r.binanceStatus = 'MISSING';
        } else {
          r.binanceStatus = `ERR(${ei.status})`;
        }

        // price snapshot
        if (r.binanceStatus === 'TRADING'){
          try{ const p = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`); if (p.ok){ const pj = await p.json(); r.price = pj.price; } } catch(e){ console.warn('price fetch failed',e); }
        }
      }catch(e){ console.warn('verify error for',sym,e); r.binanceStatus = 'ERR'; }
      out.push(r);
    }
    return out;
  }

  // inject panel after DOM ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') createPanel(); else document.addEventListener('DOMContentLoaded', createPanel);
})();
