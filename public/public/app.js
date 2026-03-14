/* ═══════════════════════════════════════════════
   URBANBET MAIN.JS v5 PRO — Live Backend Connected
═══════════════════════════════════════════════ */
'use strict';

const API_BASE_URL = "https://bet-6jn6.onrender.com";

const GAMES={
  urbanbet:[
    {id:'aviator',name:'Aviator',cat:'crash',badge:'hot',img:'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=420&q=85',bg:'linear-gradient(160deg,#1a0533 0%,#3d0a6b 100%)',stripe:'#9333ea',provider:'UrbanBet',players:2847,link:'aviator.html',liveMult:true},
    {id:'mines',name:'Mines',cat:'urbanbet',badge:'top',img:'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=420&q=85',bg:'linear-gradient(160deg,#052e16 0%,#065f46 100%)',stripe:'#059669',provider:'UrbanBet',players:1204,link:'#'},
    {id:'coinflip',name:'CoinFlip',cat:'urbanbet',badge:null,img:'https://images.unsplash.com/photo-1605792657660-596af9009e82?w=420&q=85',bg:'linear-gradient(160deg,#1c1205 0%,#713f12 100%)',stripe:'#d97706',provider:'UrbanBet',players:876,link:'#'},
    {id:'dice',name:'Dice',cat:'urbanbet',badge:null,img:'https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=420&q=85',bg:'linear-gradient(160deg,#0c1a3d 0%,#1e3a8a 100%)',stripe:'#3b82f6',provider:'UrbanBet',players:543,link:'#'},
    {id:'penalty',name:'Penalty',cat:'urbanbet',badge:null,img:'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=420&q=85',bg:'linear-gradient(160deg,#1e3a1e 0%,#166534 100%)',stripe:'#16a34a',provider:'UrbanBet',players:329,link:'#'},
    {id:'rocket',name:'Rocket Queen',cat:'crash',badge:'new',img:'https://images.unsplash.com/photo-1446776899648-aa78eefe8ed0?w=420&q=85',bg:'linear-gradient(160deg,#0a0e2e 0%,#1e2f6e 100%)',stripe:'#6366f1',provider:'UrbanBet',players:412,link:'#'},
    {id:'balloon',name:'Balloon',cat:'crash',badge:null,img:'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?w=420&q=85',bg:'linear-gradient(160deg,#1f0808 0%,#7f1d1d 100%)',stripe:'#ef4444',provider:'UrbanBet',players:298,link:'#'},
  ],
  quick:[
    {id:'jetx',name:'JetX',cat:'crash',badge:'hot',img:'https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?w=420&q=85',bg:'linear-gradient(160deg,#0a1a2e 0%,#0c2954 100%)',stripe:'#0ea5e9',provider:'SmartSoft',players:3102,link:'#'},
    {id:'astronaut',name:'Astronaut',cat:'crash',badge:null,img:'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=420&q=85',bg:'linear-gradient(160deg,#040817 0%,#0f172a 100%)',stripe:'#8b5cf6',provider:'Smartsoft',players:621,link:'#'},
    {id:'luckyjet',name:'Lucky Jet',cat:'crash',badge:'live',img:'https://images.unsplash.com/photo-1559628233-100c798642d4?w=420&q=85',bg:'linear-gradient(160deg,#3f0404 0%,#991b1b 100%)',stripe:'#f43f5e',provider:'1Win',players:1456,link:'#'},
    {id:'crosschicken',name:'Crossfire X5000',cat:'quick',badge:'new',img:'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=420&q=85',bg:'linear-gradient(160deg,#1a0a00 0%,#7c2d12 100%)',stripe:'#f97316',provider:'Onlyplay',players:788,link:'#'},
    {id:'aviatrix',name:'Aviatrix',cat:'crash',badge:null,img:'https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=420&q=85',bg:'linear-gradient(160deg,#05192d 0%,#0c3559 100%)',stripe:'#0ea5e9',provider:'BGaming',players:534,link:'#'},
    {id:'minesquick',name:'Mines Rush',cat:'quick',badge:null,img:'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=420&q=85',bg:'linear-gradient(160deg,#042e1a 0%,#065f3a 100%)',stripe:'#10b981',provider:'UrbanBet',players:241,link:'#'},
  ],
  popular:[
    {id:'roulette',name:'Live Roulette',cat:'live',badge:'live',img:'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=420&q=85',bg:'linear-gradient(160deg,#1a0a00 0%,#7c2d12 100%)',stripe:'#ef4444',provider:'Evolution',players:4210,link:'#'},
    {id:'sweetbonanza',name:'Sweet Bonanza',cat:'slots',badge:'top',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=420&q=85',bg:'linear-gradient(160deg,#2d0a3d 0%,#6d28d9 100%)',stripe:'#a855f7',provider:'Pragmatic',players:2087,link:'#'},
    {id:'bigbass',name:'Big Bass Bonanza',cat:'slots',badge:null,img:'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=420&q=85',bg:'linear-gradient(160deg,#042e3a 0%,#0c607a 100%)',stripe:'#06b6d4',provider:'Pragmatic',players:1023,link:'#'},
    {id:'crazytime',name:'Crazy Time',cat:'live',badge:'live',img:'https://images.unsplash.com/photo-1593341646782-e0b495cff86d?w=420&q=85',bg:'linear-gradient(160deg,#1a0533 0%,#7e22ce 100%)',stripe:'#c026d3',provider:'Evolution',players:5670,link:'#'},
    {id:'olympus',name:'Gates of Olympus',cat:'slots',badge:'hot',img:'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=420&q=85',bg:'linear-gradient(160deg,#070a20 0%,#1e2154 100%)',stripe:'#6366f1',provider:'Pragmatic',players:3401,link:'#'},
    {id:'blackjack',name:'Blackjack VIP',cat:'live',badge:null,img:'https://images.unsplash.com/photo-1529480897590-3a4dffa24a6e?w=420&q=85',bg:'linear-gradient(160deg,#111111 0%,#1c1c1c 100%)',stripe:'#f59e0b',provider:'Evolution',players:987,link:'#'},
    {id:'poker',name:"Texas Hold'em",cat:'poker',badge:null,img:'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=420&q=85',bg:'linear-gradient(160deg,#1a0a0a 0%,#450a0a 100%)',stripe:'#dc2626',provider:'GGPoker',players:1654,link:'#'},
    {id:'forex',name:'Binary Trade',cat:'forex',badge:'new',img:'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=420&q=85',bg:'linear-gradient(160deg,#042318 0%,#065f46 100%)',stripe:'#10b981',provider:'UrbanBet',players:432,link:'#'},
  ],
};
const ALL_GAMES=[...GAMES.urbanbet,...GAMES.quick,...GAMES.popular];
const TICK_NAMES=['Wanjiku K.','Kamau M.','Akinyi A.','Omondi J.','Mwangi P.','Njeri W.','Otieno D.','Chebet R.','Kipchoge B.','Mutua S.','Waweru T.','Adhiambo L.','Koech F.','Ndungu C.'];
const TICK_GAMES=['Aviator','Live Roulette','Sweet Bonanza','JetX','Mines','CoinFlip','Lucky Jet','Gates of Olympus','Crazy Time','Blackjack VIP'];
const TICK_MULTS=['2.34×','5.10×','12.0×','78.5×','3.77×','240×','1.90×','999×','4.20×','50.0×','8.88×','33.3×'];

/* ═════════════════════════
   LIVE BACKEND AUTHENTICATION
═════════════════════════ */
const Auth = {
  SESSION_KEY: 'ub_session',
  getSession() { 
      try { return JSON.parse(localStorage.getItem(this.SESSION_KEY)); } 
      catch(e) { return null; } 
  },
  getUser() { 
      return this.getSession()?.user || null; 
  },
  logout() { 
      localStorage.removeItem(this.SESSION_KEY); 
      window.location.href = 'index.html'; 
  }
};

function showToast(msg,type='info'){
  let t=document.getElementById('ub-toast');
  if(!t){t=document.createElement('div');t.id='ub-toast';document.body.appendChild(t);}
  t.textContent=msg;
  t.style.borderColor=type==='success'?'rgba(9,146,104,.5)':type==='error'?'rgba(224,49,49,.5)':'';
  t.classList.add('visible');clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.remove('visible'),2600);
}

/* ═════════════════════════
   HEADER & SILENT BALANCE SYNC
═════════════════════════ */
async function initHeader(){
  const user = Auth.getUser();
  const loginBtn    = document.getElementById('btnLogin');
  const registerBtn = document.getElementById('btnRegister');
  const balWrap     = document.getElementById('balWrap');
  const balAmount   = document.getElementById('balAmount');
  const drawerAuth  = document.getElementById('drawerAuthGroup');
  const drawerUser  = document.getElementById('drawerUserGroup');
  const drawerName  = document.getElementById('drawerUsername');
  const drawerAvIcon= document.getElementById('drawerAvatarIcon'); // Optional fallback icon

  if(user){
    if(loginBtn) loginBtn.classList.add('hidden');
    if(registerBtn) registerBtn.classList.add('hidden');
    if(balWrap) { balWrap.classList.remove('hidden'); balWrap.style.display='flex'; }
    if(balAmount) balAmount.textContent='KES '+fmtMoney(user.balance);
    
    if(drawerAuth) drawerAuth.classList.add('hidden');
    if(drawerUser) drawerUser.classList.remove('hidden');
    if(drawerName) drawerName.textContent = user.username || user.name || user.phone;
    if(drawerAvIcon) drawerAvIcon.style.display = 'none';

    // Secretly fetch latest balance from Render backend to ensure 100% accuracy
    try {
        const res = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: user.phone, password: user.password }) // Relies on session storing password
        });
        if (res.ok) {
            const data = await res.json();
            const session = Auth.getSession();
            session.user.balance = parseFloat(data.user.balance);
            localStorage.setItem(Auth.SESSION_KEY, JSON.stringify(session));
            if(balAmount) balAmount.textContent = 'KES ' + fmtMoney(session.user.balance);
        }
    } catch(e) { console.error("Silent sync failed"); }

  }else{
    if(balWrap) balWrap.classList.add('hidden');
    if(drawerAuth) drawerAuth.classList.remove('hidden');
    if(drawerUser) drawerUser.classList.add('hidden');
  }
}

function openDrawer(){
  document.getElementById('drawer')?.classList.add('open');
  document.getElementById('drawerMask')?.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeDrawer(){
  document.getElementById('drawer')?.classList.remove('open');
  document.getElementById('drawerMask')?.classList.remove('open');
  document.body.style.overflow='';
}

/* Swipe gesture */
(function(){
  let sx=0,sy=0,drag=false,cx=0;
  const EDGE=32,OT=80,CT=-60;
  const dw=()=>document.getElementById('drawer');
  const mk=()=>document.getElementById('drawerMask');
  document.addEventListener('touchstart',e=>{
    const t=e.touches[0];sx=t.clientX;sy=t.clientY;drag=false;cx=sx;
    const o=dw()?.classList.contains('open');
    if((!o&&sx<=EDGE)||o){drag=true;if(dw())dw().style.transition='none';}
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!drag)return;
    const t=e.touches[0];const dx=t.clientX-sx;const dy=t.clientY-sy;
    if(Math.abs(dy)>Math.abs(dx)*1.5){drag=false;return;}
    e.preventDefault();cx=t.clientX;
    const o=dw()?.classList.contains('open');
    const DW=dw()?.offsetWidth||280;
    if(!o){const p=Math.min(dx/DW,1);dw().style.left=`${-DW*(1-p)}px`;const m=mk();if(m){m.style.display='block';m.style.opacity=String(p*.8);}}
    else if(dx<0){dw().style.left=`${dx}px`;const m=mk();if(m)m.style.opacity=String((1+dx/DW)*.8);}
  },{passive:false});
  document.addEventListener('touchend',()=>{
    if(!drag)return;drag=false;
    const d=dw();if(!d)return;
    const o=d.classList.contains('open');const dx=cx-sx;
    d.style.transition='';d.style.left='';
    const m=mk();if(m){m.style.opacity='';m.style.display='';}
    if(!o&&dx>OT)openDrawer();
    else if(o&&dx<CT)closeDrawer();
  },{passive:true});
})();
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});

/* Game card builder — Font Awesome play icon */
function buildGameCard(game){
  const div=document.createElement('div');
  div.className='gc';div.dataset.cat=game.cat;div.dataset.name=game.name.toLowerCase();
    const _badgeLbl = { hot:'<i class="fa-solid fa-fire"></i> HOT', new:'<i class="fa-solid fa-star"></i> NEW', live:'<i class="fa-solid fa-circle" style="font-size:7px"></i> LIVE', top:'<i class="fa-solid fa-trophy"></i> TOP' };
  const badge=game.badge
    ?`<span class="gc-badge gb-${game.badge}">${_badgeLbl[game.badge]||game.badge.toUpperCase()}</span>`:'';
  const players=game.players?`<div class="gc-players" id="gcp-${game.id}">${fmtCount(game.players)}</div>`:'';
  const multBadge=game.liveMult?`<div class="gc-live-mult" id="gc-mult-${game.id}">1.00×</div>`:'';
  const stripe=game.stripe?`<div class="gc-stripe" style="background:${game.stripe}"></div>`:'';
  div.innerHTML=`
    <div class="gc-bg" style="background:${game.bg||'var(--surface3)'}"></div>
    <img class="gc-thumb" src="${game.img}" alt="${game.name}" loading="lazy" onerror="this.style.display='none'">
    <div class="gc-shade"></div>
    ${stripe}${badge}${players}${multBadge}
    <div class="gc-overlay">
      <div class="gc-play-btn"><i class="fa-solid fa-play" style="margin-left:2px"></i></div>
      <div class="gc-play-lbl">Play Now</div>
    </div>
    <div class="gc-info">
      <div class="gc-name">${game.name}</div>
      <div class="gc-prov">${game.provider}</div>
    </div>`;
  div.addEventListener('click',()=>{
    if(game.link&&game.link!=='#')window.location.href=game.link;
    else showToast(`${game.name} — Coming soon!`);
  });
  return div;
}

let _mv=1.00;
function startLiveMult(){
  const ids=ALL_GAMES.filter(g=>g.liveMult).map(g=>`gc-mult-${g.id}`);
  if(!ids.length)return;
  setInterval(()=>{
    _mv+=Math.random()*0.19;
    if(_mv>14||Math.random()<0.04)_mv=1.00;
    ids.forEach(id=>{const el=document.getElementById(id);if(!el)return;el.textContent=_mv.toFixed(2)+'×';el.style.color=_mv>5?'#0ca678':'#fcc419';});
  },260);
}
function startLivePlayerCounts(){
  setInterval(()=>{
    ALL_GAMES.forEach(g=>{
      if(!g.players)return;
      const el=document.getElementById(`gcp-${g.id}`);if(!el)return;
      g.players=Math.max(50,g.players+(Math.floor(Math.random()*7)-3));
      el.textContent=fmtCount(g.players);
    });
  },3600);
}

function populateGames(){
  ['urbanbet-row','quick-row','popular-row'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='';});
  [['urbanbet','urbanbet-row'],['quick','quick-row'],['popular','popular-row']].forEach(([key,id])=>{
    const c=document.getElementById(id);if(!c)return;
    GAMES[key].forEach(g=>c.appendChild(buildGameCard(g)));
  });
  startLiveMult();startLivePlayerCounts();
}

function scrollRow(id,dir){const el=document.getElementById(id);if(el)el.scrollBy({left:dir*360,behavior:'smooth'});}

function searchGames(q){
  q=q.trim().toLowerCase();
  if(!q){document.querySelectorAll('.gc').forEach(c=>c.style.display='');document.querySelectorAll('.game-section').forEach(s=>s.style.display='');return;}
  document.querySelectorAll('.game-section').forEach(s=>s.style.display='none');
  document.querySelectorAll('.gc').forEach(c=>{
    const m=c.dataset.name?.includes(q);c.style.display=m?'':'none';
    if(m)c.closest?.('.game-section')&&(c.closest('.game-section').style.display='');
  });
}

function buildTicker(){
  const wrap=document.getElementById('tickerInner');if(!wrap)return;
  let html='';
  for(let i=0;i<20;i++){
    const name=TICK_NAMES[Math.random()*TICK_NAMES.length|0];
    const game=TICK_GAMES[Math.random()*TICK_GAMES.length|0];
    const mult=TICK_MULTS[Math.random()*TICK_MULTS.length|0];
    const amt=((Math.random()*49800)+200).toFixed(0);
    html+=`<span class="tick-win"><span class="tick-name">${name}</span><span style="color:var(--text2)"> won </span><span class="tick-multi">${mult}</span><span style="color:var(--text2)"> on ${game} — </span><span class="tick-amount">KES ${Number(amt).toLocaleString()}</span></span><span class="tick-sep"> · </span>`;
  }
  wrap.innerHTML=html+html;
}

function startCountdown(elId,totalSeconds){
  const el=document.getElementById(elId);if(!el)return;
  let t=totalSeconds;
  const tick=()=>{if(t<=0)t=86400;el.textContent=`${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor((t%3600)/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;t--;};
  tick();setInterval(tick,1000);
}

function fmtMoney(n){if(!n&&n!==0)return'0.00';return Number(n).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtCount(n){return n>=1000?(n/1000).toFixed(1)+'k':String(n);}
function fmtDate(iso){if(!iso)return'';return new Date(iso).toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'});}
function fmtTime(iso){if(!iso)return'';return new Date(iso).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'});}