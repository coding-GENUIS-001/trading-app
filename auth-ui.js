(function(){
  // Minimal auth-ui stub to avoid missing-file errors when auth-ui.js is included in index.html.
  // This provides a simple Login/Register UI placeholder and exposes a small API used by the app if needed.

  function createEl(tag, cls, text){ const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  // Only render if there's a header present and no existing auth container
  function init(){
    try{
      if (!document || !document.body) return;
      if (document.getElementById('authContainer')) return;
      const header = document.querySelector('header') || document.body;
      const div = createEl('div','auth-container'); div.id = 'authContainer';
      div.style.display = 'inline-block'; div.style.marginLeft = '12px'; div.style.verticalAlign = 'middle';

      const loginBtn = createEl('button','auth-btn','Log in');
      const regBtn = createEl('button','auth-btn','Register');
      loginBtn.style.marginRight = '6px';

      loginBtn.addEventListener('click', ()=>{
        alert('Auth UI placeholder: implement auth-ui.js to enable login/register.');
      });
      regBtn.addEventListener('click', ()=>{
        alert('Auth UI placeholder: implement auth-ui.js to enable registration.');
      });

      div.appendChild(loginBtn); div.appendChild(regBtn);
      header.appendChild(div);

      // expose a simple API: authUI.getToken() and authUI.setToken()
      window.authUI = window.authUI || {};
      window.authUI.getToken = () => localStorage.getItem('tradingApp_jwt') || null;
      window.authUI.setToken = (t) => { if (t) localStorage.setItem('tradingApp_jwt', t); else localStorage.removeItem('tradingApp_jwt'); };

      console.log('auth-ui placeholder loaded');
    }catch(e){ console.warn('auth-ui init failed', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
