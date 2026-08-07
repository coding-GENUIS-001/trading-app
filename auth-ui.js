// auth-ui.js - frontend auth UI (login/register) and token handling
(function(){
  function $q(s){return document.querySelector(s);} 
  function createEl(t,cls,txt){const e=document.createElement(t); if(cls)e.className=cls; if(txt)e.textContent=txt; return e;}

  function injectAuthControls(){
    const header = document.querySelector('header');
    if(!header) return;
    const container = createEl('div','auth-controls');
    container.style.display='flex'; container.style.alignItems='center'; container.style.gap='8px';
    container.id='authControls';

    const loginBtn = createEl('button',null,'Log in');
    const registerBtn = createEl('button',null,'Register');
    const userBadge = createEl('div',null,''); userBadge.style.color='var(--muted)';

    loginBtn.addEventListener('click', ()=> showModal('login'));
    registerBtn.addEventListener('click', ()=> showModal('register'));

    container.appendChild(userBadge); container.appendChild(loginBtn); container.appendChild(registerBtn);
    header.appendChild(container);

    refreshAuthUI();
  }

  function refreshAuthUI(){
    const token = localStorage.getItem('tradingApp_jwt');
    const userRaw = localStorage.getItem('tradingApp_user');
    const badge = document.querySelector('#authControls div');
    const loginBtn = document.querySelector('#authControls button:nth-child(2)');
    const registerBtn = document.querySelector('#authControls button:nth-child(3)');
    if(token && userRaw){
      const user = JSON.parse(userRaw);
      badge.textContent = user.username ? `Hello, ${user.username}` : user.email;
      loginBtn.textContent = 'Logout';
      registerBtn.style.display = 'none';
      loginBtn.onclick = logout;
    } else {
      badge.textContent = '';
      loginBtn.textContent = 'Log in';
      registerBtn.style.display = '';
      loginBtn.onclick = ()=> showModal('login');
    }
  }

  function logout(){ localStorage.removeItem('tradingApp_jwt'); localStorage.removeItem('tradingApp_user'); refreshAuthUI(); alert('Logged out'); }

  function showModal(mode){
    // simple modal
    let modal = document.getElementById('authModal');
    if(modal){ modal.remove(); }
    modal = createEl('div','auth-modal'); modal.id='authModal';
    modal.style.position='fixed'; modal.style.left='50%'; modal.style.top='50%'; modal.style.transform='translate(-50%,-50%)'; modal.style.zIndex='3000'; modal.style.background='var(--card-bg)'; modal.style.padding='18px'; modal.style.border='1px solid var(--glass)'; modal.style.borderRadius='12px';

    const title = createEl('h3',null, mode==='login' ? 'Log in' : 'Register');
    const email = createEl('input',null); email.placeholder='Email'; email.style.display='block'; email.style.margin='8px 0'; email.style.width='320px';
    const username = createEl('input',null); username.placeholder='Username (optional)'; username.style.display = mode==='login' ? 'none' : 'block'; username.style.margin='8px 0'; username.style.width='320px';
    const pwd = createEl('input',null); pwd.type='password'; pwd.placeholder='Password'; pwd.style.display='block'; pwd.style.margin='8px 0'; pwd.style.width='320px';
    const btn = createEl('button',null, mode==='login' ? 'Log in' : 'Register');
    const close = createEl('button',null,'Close'); close.style.marginLeft='8px';

    btn.addEventListener('click', async ()=>{
      const e = email.value.trim(); const p = pwd.value; const u = username.value.trim();
      if(!e || !p){ alert('Enter email and password'); return; }
      try{
        const url = mode==='login' ? '/api/login' : '/api/register';
        const res = await fetch(url, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(mode==='login' ? { email: e, password: p } : { email: e, password: p, username: u }) });
        const j = await res.json();
        if (!res.ok){ alert(j.error || 'Auth failed'); return; }
        localStorage.setItem('tradingApp_jwt', j.token);
        localStorage.setItem('tradingApp_user', JSON.stringify(j.user));
        refreshAuthUI(); modal.remove(); alert('Welcome '+(j.user.username||j.user.email));
      }catch(err){ console.error('auth error',err); alert('Auth error'); }
    });
    close.addEventListener('click', ()=> modal.remove());

    modal.appendChild(title); modal.appendChild(email); modal.appendChild(username); modal.appendChild(pwd); modal.appendChild(btn); modal.appendChild(close);
    document.body.appendChild(modal);
  }

  // Inject on DOM ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') { injectAuthControls(); } else document.addEventListener('DOMContentLoaded', injectAuthControls);
})();
