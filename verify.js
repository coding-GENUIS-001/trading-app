// verify.js - lightweight verify helper that uses global Binance snapshots when available
// Exposes window.verifySymbols, which accepts an array of symbol ids (['BTCUSDT'])
// and returns a Promise resolving to [{ symbol, status, price }]

window.verifySymbols = async function(symbols){
  const out = [];
  try{
    const statusMap = window.binanceStatusMap || {};
    const priceMap = window.binancePriceMap || {};
    const toFetch = [];

    symbols.forEach(s => {
      const id = (s || '').toUpperCase();
      const status = statusMap[id];
      const price = priceMap[id];
      if (typeof status !== 'undefined' && typeof price !== 'undefined'){
        out.push({ symbol: id, status: status, price: price });
      } else {
        toFetch.push(id);
      }
    });

    if (toFetch.length > 0){
      // fetch in one batch if possible
      try{
        const batch = toFetch.slice(0, 20); // limit
        const url = 'https://api.binance.com/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(batch));
        const r = await fetch(url);
        if (r.ok){
          const arr = await r.json();
          arr.forEach(it => { out.push({ symbol: it.symbol, status: (statusMap[it.symbol] || 'UNKNOWN'), price: it.price }); });
        } else {
          // fallback single-symbols
          for (const id of toFetch){
            try{ const rr = await fetch('https://api.binance.com/api/v3/ticker/price?symbol='+id); if (rr.ok){ const oj = await rr.json(); out.push({ symbol: id, status: (statusMap[id] || 'UNKNOWN'), price: oj.price }); } }catch(e){}
          }
        }
      }catch(e){
        console.warn('verify batch fetch failed', e);
        // degrade gracefully: return UNKNOWN for remaining symbols
        toFetch.forEach(id => out.push({ symbol: id, status: (statusMap[id] || 'UNKNOWN'), price: null }));
      }
    }
  }catch(e){ console.error('verifySymbols failed', e); }
  return out;
};
