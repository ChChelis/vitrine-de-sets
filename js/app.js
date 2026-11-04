import * as db from './store.js';
import * as cat from './catalog.js';
import * as bk from './backup.js';
import * as lands from './lands.js';
import * as report from './report.js';
import * as arch from './archetypes.js';
import * as arqview from './arqview.js';

const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let SETS=[];            // siglas visíveis (não arquivadas), na ordem das abas
let ROWS=[];            // todas as edições salvas no aparelho (inclui arquivadas)
const iconUrl=r=>r&&r.icon?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(r.icon):'';
const RAR={mythic:'Mítica',rare:'Rara',uncommon:'Incomum',common:'Comum',special:'Especial',bonus:'Bônus'};
const RL={mythic:'M',rare:'R',uncommon:'U',common:'C'};
const IGN=new Set(['legendary','enchantment','universesbeyond','boosterfun','snow','devoid','saga','vehicle','miracle','spree','mutate','nyxtouched','draft','companion','tombstone','etched','glossy','compasslanddfc','nyxborn']);
const VLBL={borderless:'Borderless',showcase:'Showcase',extendedart:'Arte estendida',fullart:'Full art',inverted:'Invertida',japanshowcase:'Japão',headliner:'Headliner',surgefoil:'Surge foil',fracturefoil:'Fracture foil',facetfoil:'Facet foil',retro:'Retrô'};
const S={set:'fra',data:{},view:'car',idx:0,q:'',cols:new Set(),vr:'all',rar:'all',mode:'n',list:{},votes:{},undo:[],tf:'p',ti:0,busy:false,tag:'',qual:'NM',lang:'EN',flip:0};
const tags=c=>c.tags.filter(t=>!IGN.has(t));
const isVar=c=>tags(c).length>0;
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
let toastT; function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2200)}

/* ---------- dados ---------- */
async function load(code){
  if(S.data[code])return S.data[code];
  const row=ROWS.find(r=>r.code===code); if(!row)throw new Error(code);
  const cards=await cat.loadCards(code); if(!cards.length)throw new Error(code);
  const d={...row,cards,byId:new Map(cards.map(c=>[c.id,c]))}; S.data[code]=d; return d;
}
async function refreshRows(){
  ROWS=await cat.listSets(); SETS=ROWS.filter(r=>!r.archived).map(r=>r.code);
  for(const code in S.data){const r=ROWS.find(x=>x.code===code); if(r)Object.assign(S.data[code],r)}
}
/* ---------- etiquetas e arquétipos (por edição, calculados no aparelho) ---------- */
const ARQ={}, upgrading=new Set(); let ARR=null;
async function ensureAnalysis(code){
  if(ARQ[code])return ARQ[code];
  const d=S.data[code]; if(!d)return null;
  if(d.cards.some(c=>c.ci===undefined)){      // cartas baixadas antes das etiquetas: falta identidade de cor e tipo completo
    if(!upgrading.has(code)&&navigator.onLine!==false){
      upgrading.add(code); toast('Atualizando '+code.toUpperCase()+' para ativar as etiquetas…');
      try{await cat.syncSet(code); delete S.data[code]; await refreshRows(); await load(code)}catch(e){toast('Não consegui atualizar '+code.toUpperCase()+': '+e.message)}
      finally{upgrading.delete(code)}
    }
    if(!S.data[code]||S.data[code].cards.some(c=>c.ci===undefined))return null;
  }
  ARR=ARR||await arch.loadRules();
  ARQ[code]=arch.analyze(S.data[code].cards,ARR); return ARQ[code];
}
function fillTagSelect(){
  const a=ARQ[S.set], sel=$('#selTag'); if(!a||!ARR){sel.innerHTML='<option value="">Qualquer etiqueta</option>';return}
  const cnt={}; for(const n in a.etiquetas)for(const t of a.etiquetas[n])cnt[t]=(cnt[t]||0)+1;
  const ts=Object.keys(cnt).sort((x,y)=>cnt[y]-cnt[x]);
  sel.innerHTML='<option value="">Qualquer etiqueta</option>'+ts.map(t=>`<option value="${esc(t)}">${esc(arch.label(ARR,t))} (${cnt[t]})</option>`).join('');
  sel.value=ts.includes(S.tag)?S.tag:''; if(sel.value!==S.tag)S.tag=sel.value;
}
const tagsOf=c=>{const a=ARQ[S.set];return a?a.etiquetas[c.name]||[]:[]};
const tagChips=c=>ARR?tagsOf(c).map(t=>`<span class="tag">${esc(arch.label(ARR,t))}</span>`).join(''):'';
function voteOfName(code){   // melhor voto entre as impressões do nome (Bomba > Sim > Meh > Não)
  const d=S.data[code], best={}; if(!d)return()=>undefined;
  for(const c of d.cards){const v=S.votes[code+'|'+c.id]; if(!v||v==='x')continue; const cur=best[c.name]; if(!cur||'symn'.indexOf(v)<'symn'.indexOf(cur))best[c.name]=v}
  return n=>best[n];
}
function filtered(){
  const d=S.data[S.set]; if(!d)return [];
  const q=S.q.trim().toLowerCase();
  return d.cards.filter(c=>{
    if(q&&!c.name.toLowerCase().includes(q)&&c.num!==q&&!c.type.toLowerCase().includes(q))return false;
    if(S.cols.size){const k=c.col.length>1?'M':(c.col||'C'); if(!S.cols.has(k))return false}
    if(S.vr==='main'&&isVar(c))return false;
    if(S.vr==='var'&&!isVar(c))return false;
    if(S.rar!=='all'&&c.rar!==S.rar)return false;
    if(S.tag){const a=ARQ[S.set],t=a&&a.etiquetas[c.name]; if(!t||!t.includes(S.tag))return false}
    return true;
  });
}
let F=[];

/* ---------- lista ---------- */
const key=(s,id,f)=>s+'|'+id+'|'+f;
const qty=(s,id,f)=>(S.list[key(s,id,f)]||{q:0}).q;
const totalQty=()=>Object.values(S.list).reduce((a,x)=>a+x.q,0);
function add(c,f,n){
  if(!c)return;
  const fins=c.fin; if(f==='f'&&!fins.includes('foil')&&!fins.includes('etched'))f='n';
  if(f==='n'&&!fins.includes('nonfoil'))f='f';
  const k=key(S.set,c.id,f), cur=S.list[k]?S.list[k].q:0, nq=Math.max(0,cur+n);
  if(nq===0)delete S.list[k]; else S.list[k]={s:S.set,id:c.id,f,q:nq};
  save(); refreshCounts();
}
/* votos e lista ficam no IndexedDB (kv "user"); gravação com pequeno atraso para juntar cliques seguidos */
let saveT;
const userDoc=()=>({list:S.list,votes:S.votes,qual:S.qual,lang:S.lang});
function save(){
  clearTimeout(saveT); saveT=setTimeout(flushSave,300);
}
function flushSave(){clearTimeout(saveT); return db.kv.set('user',JSON.parse(JSON.stringify(userDoc()))).catch(e=>toast('Não consegui salvar: '+e.message))}
addEventListener('pagehide',flushSave);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave()});
function restore(p){ if(!p)return; S.list=p.list||{}; S.votes=p.votes||{}; S.qual=p.qual||'NM'; S.lang=p.lang||'EN'; $('#dQ').value=S.qual; $('#dL').value=S.lang; refreshCounts(); if($('#drawer').classList.contains('open'))renderDrawer(); renderStage(true) }

/* ---------- topo ---------- */
function renderTabs(){
  $('#tabs').innerHTML=SETS.map(c=>{const d=S.data[c];return `<button class="tab" role="tab" data-s="${c}" aria-selected="${S.set===c}">${iconUrl(ROWS.find(r=>r.code===c))?`<img alt="" src="${iconUrl(ROWS.find(r=>r.code===c))}">`:''}<b>${c.toUpperCase()}</b></button>`}).join('');
}
function renderChips(){
  $('#chips').innerHTML=['W','U','B','R','G','M','C'].map(c=>`<button class="chip" data-c="${c}" aria-pressed="${S.cols.has(c)}" aria-label="Cor ${c}">${c}</button>`).join('');
}
function refreshCounts(){
  $('#cnt').textContent=totalQty(); $('#cntV').textContent=realVotes();
  document.querySelectorAll('[data-card]').forEach(updateCardUI);
  if($('#drawer').classList.contains('open'))renderDrawer();
  if(S.view==='car')renderInfo();
}

/* ---------- carrossel ---------- */
const reelEls=new Map();
function mountCarousel(){
  $('#main').innerHTML=`<div class="carousel"><div class="reelwrap"><div class="reel" id="reel" aria-label="Cartas"></div></div><div class="info" id="info"></div></div>`;
  reelEls.clear(); bindReel(); layoutReel(true); renderInfo();
}
/* imagens: miniatura (small) na grade e imagem grande (normal) no carrossel/triagem, direto do Scryfall via cache do service worker */
function mkReelCard(c){
  const el=document.createElement('div'); el.className='rc'; el.dataset.id=c.id;
  el.innerHTML=`<div class="tilt"><div class="face"><img alt="${esc(c.name)}" src="${c.hi||c.img}" draggable="false"><div class="shine"></div></div><div class="face back"><i></i></div></div>`;
  return el;
}
function layoutReel(first){
  const reel=$('#reel'); if(!reel)return;
  if(S.idx>=F.length)S.idx=Math.max(0,F.length-1);
  const keep=new Set();
  for(let d=-3;d<=3;d++){
    const i=S.idx+d; if(i<0||i>=F.length)continue;
    const c=F[i]; keep.add(c.id);
    let el=reelEls.get(c.id);
    if(!el){el=mkReelCard(c);reelEls.set(c.id,el);el.style.opacity=0;el.style.transform=`translateY(${d>0?'110%':'-110%'}) scale(.9)`;reel.appendChild(el);void el.offsetHeight}
    el.classList.toggle('cur',d===0);
    el.style.zIndex=10-Math.abs(d);
    if(d===0){el.style.transform='translateY(0) scale(1)';el.style.opacity=1}
    else if(d>0){el.style.transform=`translateY(calc(var(--ch)*${(1.04*d).toFixed(2)})) scale(${(.93-.02*d).toFixed(2)})`;el.style.opacity=d===1?.55:0}
    else{el.style.transform=`translateY(calc(var(--ch)*${(1.04*d).toFixed(2)})) scale(.9)`;el.style.opacity=0}
    el.style.pointerEvents=Math.abs(d)<=1?'auto':'none';
  }
  for(const [id,el] of reelEls) if(!keep.has(id)){el.remove();reelEls.delete(id)}
  const cur=reelEls.get(F[S.idx]&&F[S.idx].id); if(cur)cur.querySelector('.tilt').style.setProperty('--flip',S.flip+'deg');
  setBg();
}
function bindReel(){
  const reel=$('#reel');
  reel.addEventListener('click',e=>{
    const el=e.target.closest('.rc'); if(!el)return;
    const i=F.findIndex(c=>c.id===el.dataset.id);
    if(i!==S.idx){go(i-S.idx);return}
    addCur(S.mode==='f'?'f':'n',1);
  });
  reel.addEventListener('mousemove',e=>{
    if(matchMedia('(hover:none)').matches)return;
    const el=reel.querySelector('.rc.cur'); if(!el)return; const t=el.querySelector('.tilt'), r=el.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    t.style.transition='transform .08s';t.style.setProperty('--ry',(x*16)+'deg');t.style.setProperty('--rx',(-y*14)+'deg');
    el.querySelector('.shine').style.setProperty('--sx',(100-(x+.5)*100)+'%');
  });
  reel.addEventListener('mouseleave',()=>{const t=reel.querySelector('.rc.cur .tilt'); if(t){t.style.transition='';t.style.setProperty('--ry','0deg');t.style.setProperty('--rx','0deg')}});
  let wl=0; reel.addEventListener('wheel',e=>{e.preventDefault();const n=Date.now();if(n-wl<260)return;wl=n;go(e.deltaY>0?1:-1)},{passive:false});
  let ty=null; reel.addEventListener('touchstart',e=>{ty=e.touches[0].clientY},{passive:true});
  reel.addEventListener('touchend',e=>{if(ty==null)return;const dy=e.changedTouches[0].clientY-ty;ty=null;if(Math.abs(dy)>40)go(dy<0?1:-1)},{passive:true});
}
function go(n){ if(!F.length)return; const i=Math.min(F.length-1,Math.max(0,S.idx+n)); if(i===S.idx)return; S.idx=i;S.flip=0;layoutReel();renderInfo() }
function curCard(){return F[S.idx]}
function addCur(f,n){
  const c=curCard(); if(!c)return; add(c,f,n);
  const el=reelEls.get(c.id); if(el&&n>0){const t=el.querySelector('.face');t.classList.remove('pop');void t.offsetWidth;t.classList.add('pop')}
}
function renderInfo(){
  const box=$('#info'); if(!box)return; const c=curCard();
  if(!c){box.innerHTML='<div class="empty">Nenhuma carta com esses filtros.</div>';return}
  const d=S.data[S.set];
  const hasN=c.fin.includes('nonfoil'),hasF=c.fin.includes('foil')||c.fin.includes('etched');
  const row=(f,lbl,on)=>`<div class="row ${f==='f'?'foil':''} ${on?'':'off'}"><span class="lbl">${lbl}</span><div class="step"><button data-a="${f}" data-n="-1" aria-label="Remover ${lbl}" ${on?'':'disabled'}>−</button><output>${qty(S.set,c.id,f)}</output><button data-a="${f}" data-n="1" aria-label="Adicionar ${lbl}" ${on?'':'disabled'}>+</button></div></div>`;
  box.innerHTML=`<div class="meta" style="margin-bottom:8px">${d.name.toUpperCase()} · ${F.indexOf(c)+1} / ${F.length}</div>
   <h1>${esc(c.name)}</h1><div class="type">${esc(c.type)}</div>
   <div class="tags"><span class="tag">#${esc(c.num)}</span><span class="tag r-${c.rar}">${RAR[c.rar]||c.rar}</span>${tags(c).map(t=>`<span class="tag">${esc(VLBL[t]||t)}</span>`).join('')}</div>
   <div class="rows">${row('n','Normal',hasN)}${row('f','Foil',hasF)}</div>
   ${simHtml(c)}
   <div class="nav"><button class="btn" data-g="-1">↑ Anterior</button><button class="btn" data-g="1">Próxima ↓</button><button class="btn" id="bFlip">Virar</button><button class="btn" id="bToGrid">Ver grade</button></div>
   <div class="keys"><kbd>↑</kbd> <kbd>↓</kbd> navegar · <kbd>Enter</kbd> +1 · <kbd>Backspace</kbd> −1 · <kbd>F</kbd> foil · <kbd>Espaço</kbd> virar · <kbd>G</kbd> grade · <kbd>L</kbd> lista</div>`;
}
function simHtml(c){
  const a=ARQ[S.set]; if(!a||!ARR)return '';
  const tg=a.etiquetas[c.name]||[], sims=a.parecidas[c.name]||[];
  return `<div class="simil">${tg.length?`<div class="chips-tag">${tg.map(t=>`<button class="chip-tag ${S.tag===t?'on':''}" data-tag="${esc(t)}">${esc(arch.label(ARR,t))}</button>`).join('')}</div>`:''}
    ${sims.length?`<h4>Cartas parecidas</h4>${sims.map(x=>`<button class="sim" data-sim="${esc(x.nome)}">${esc(x.nome)}<span class="why">em comum: ${esc(x.comuns.map(t=>arch.label(ARR,t)).join(', '))}</span></button>`).join('')}`:''}</div>`;
}
function setBg(){const c=curCard(); $('#bgart').style.backgroundImage=c?`url(${c.img})`:''}

/* ---------- grade ---------- */
function mountGrid(){
  const main=$('#main');
  if(!F.length){main.innerHTML='<div class="empty">Nenhuma carta com esses filtros.</div>';return}
  const PAGE=60, gcHtml=(c,i)=>`<div class="gc" data-card="${c.id}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(c.name)} #${esc(c.num)}"><img loading="lazy" decoding="async" alt="${esc(c.name)}" src="${c.img}" draggable="false"><div class="shine"></div><div class="bd"></div><span class="num">#${esc(c.num)}</span><div class="ov"><button data-x="-1" aria-label="Remover">−</button><button class="exp" data-x="open" aria-label="Abrir no carrossel">⤢</button><button data-x="1" aria-label="Adicionar">+</button></div></div>`;
  let shown=Math.min(PAGE,F.length);
  main.innerHTML=`<div class="gridwrap"><div class="grid" id="grid">${F.slice(0,shown).map(gcHtml).join('')}</div><button class="btn more" id="gMore" hidden></button></div>`;
  const g=$('#grid'), more=$('#gMore');
  // paginação: 554 cartas de uma vez pesam no celular; carrega mais ao chegar ao fim
  const showMore=()=>{
    if(shown>=F.length)return; const to=Math.min(F.length,shown+PAGE);
    g.insertAdjacentHTML('beforeend',F.slice(shown,to).map((c,k)=>gcHtml(c,shown+k)).join(''));
    g.querySelectorAll('[data-card]').forEach(updateCardUI); shown=to; syncMore();
  };
  const syncMore=()=>{more.hidden=shown>=F.length; more.textContent=`Mostrar mais (${F.length-shown})`};
  more.onclick=showMore; syncMore();
  if('IntersectionObserver' in window){new IntersectionObserver(es=>{if(es.some(x=>x.isIntersecting))showMore()},{rootMargin:'600px'}).observe(more)}
  let gl=0; const gridAct=e=>{
    if(e.type==='click'&&Date.now()-gl<500)return; gl=Date.now();
    const el=e.target.closest('.gc'); if(!el)return; const c=F[+el.dataset.i], x=e.target.closest('button')?.dataset.x;
    if(x==='open'){S.idx=+el.dataset.i;setView('car');return}
    try{add(c,S.mode,x==='-1'?-1:1)}catch(err){toast('Erro: '+err.message)}
  };
  g.addEventListener('click',gridAct); g.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')gridAct(e)});
  g.addEventListener('keydown',e=>{const el=e.target.closest('.gc'); if(!el)return; if(e.key==='Enter'||e.key===' '){e.preventDefault();add(F[+el.dataset.i],S.mode,1)}else if(e.key==='Backspace'){e.preventDefault();add(F[+el.dataset.i],S.mode,-1)}});
  g.addEventListener('contextmenu',e=>{const el=e.target.closest('.gc'); if(!el)return; e.preventDefault(); add(F[+el.dataset.i],S.mode,-1)});
  g.addEventListener('mousemove',e=>{if(matchMedia('(hover:none)').matches)return;const el=e.target.closest('.gc'); if(!el)return; const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.setProperty('--ry',(x*14)+'deg');el.style.setProperty('--rx',(-y*12)+'deg');el.querySelector('.shine').style.setProperty('--sx',(100-(x+.5)*100)+'%')});
  g.addEventListener('mouseout',e=>{const el=e.target.closest('.gc'); if(el&&!el.contains(e.relatedTarget)){el.style.setProperty('--ry','0deg');el.style.setProperty('--rx','0deg')}});
  document.querySelectorAll('[data-card]').forEach(updateCardUI);
  $('#bgart').style.backgroundImage=F[0]?`url(${F[0].img})`:'';
}
function updateCardUI(el){
  const id=el.dataset.card, n=qty(S.set,id,'n'), f=qty(S.set,id,'f');
  el.classList.toggle('sel',n+f>0); el.classList.toggle('foilcard',f>0);
  el.querySelector('.bd').innerHTML=(n?`<span>${n}</span>`:'')+(f?`<span class="f">${f}✦</span>`:'');
}

/* ---------- render geral ---------- */
function renderStage(keepIdx){
  document.body.classList.toggle('focus',S.view==='tri'); if(S.view!=='tri')document.body.classList.remove('menu');
  F=filtered(); if(!keepIdx){S.idx=0;S.ti=0}
  $('#resCount').textContent=F.length+' de '+(S.data[S.set]?S.data[S.set].cards.length:0)+' cartas';
  $('#vCar').setAttribute('aria-pressed',S.view==='car');$('#vGrid').setAttribute('aria-pressed',S.view==='grid');$('#vTri').setAttribute('aria-pressed',S.view==='tri');
  if(S.view==='car')mountCarousel(); else if(S.view==='tri')mountTri(); else mountGrid();
}
function setView(v){
  S.view=v;store.set('vitrine-view',v);
  if(v==='tri')mainOnly();   // triagem sempre abre só nas versões principais
  renderStage(true)
}
function mainOnly(){S.vr='main';$('#selVar').value='main'}
async function setSet(code){
  if(!code){renderTabs();renderBoot();return}
  S.set=code; store.set('vitrine-set',code); renderTabs();
  $('#main').innerHTML='<div class="loading"><div class="spin"></div>Carregando '+code.toUpperCase()+'…</div>';
  try{await load(code)}catch(e){$('#main').innerHTML='<div class="empty">Não consegui carregar '+code.toUpperCase()+'.</div>';return}
  renderTabs(); S.idx=0; S.ti=0; renderStage();
  ensureAnalysis(code).then(a=>{if(a&&S.set===code){fillTagSelect();renderStage(true)}});
}

/* ---------- gaveta ---------- */
function fmtDate(s){const t=new Date(s);return isNaN(t)?String(s||'?'):t.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
async function renderDrawer(){
  const items=Object.values(S.list), sets=[...new Set(items.map(x=>x.s))];
  await Promise.all(sets.map(s=>load(s).catch(()=>null)));
  const by={}; items.forEach(x=>{(by[x.s]=by[x.s]||[]).push(x)});
  let h='';
  if(!items.length)h='<div class="empty">Lista vazia.<br>Clique nas cartas para somar.</div>';
  for(const s of Object.keys(by)){
    const d=S.data[s]; if(!d)continue;
    h+=`<div class="dh">${esc(d.name)}</div>`;
    by[s].map(x=>({x,c:d.byId.get(x.id)})).filter(o=>o.c).sort((a,b)=>numKey(a.c.num)-numKey(b.c.num)||a.x.f.localeCompare(b.x.f)).forEach(({x,c})=>{
      h+=`<div class="it"><img alt="" src="${c.img}"><div style="min-width:0"><div class="n">${esc(c.name)}</div><div class="s ${x.f==='f'?'f':''}">#${esc(c.num)} · ${x.f==='f'?'foil':'normal'}${isVar(c)?' · '+esc(tags(c).map(t=>VLBL[t]||t).join(', ')):''}</div></div><div class="step"><button data-d="-1" data-k="${esc(key(x.s,x.id,x.f))}" aria-label="Remover">−</button><output>${x.q}</output><button data-d="1" data-k="${esc(key(x.s,x.id,x.f))}" aria-label="Adicionar">+</button></div></div>`;
    });
  }
  $('#dList').innerHTML=h;
  $('#upd').innerHTML=SETS.map(s=>{const d=S.data[s];return d?`<b>${s.toUpperCase()}</b>: ${d.cards.length} de ${Math.max(d.total,d.cards.length)} cartas, dados de ${fmtDate(d.updated)}`:''}).filter(Boolean).join('<br>')+'<br>Para buscar cartas novas, use <b>Edições</b> no topo.';
  $('#bExp').disabled=$('#bCopy').disabled=!items.length;
}
const numKey=n=>parseInt(String(n).replace(/\D/g,''),10)||0;
function openDrawer(o){ $('#drawer').classList.toggle('open',o); $('#scrim').classList.toggle('on',o); if(o)renderDrawer(); $('#bClear').textContent='Limpar lista'; S.confirm=false }

/* ---------- CSV Liga ---------- */
const HEAD=['Edicao (PTBR)','Edicao (EN)','Edicao (Sigla)','Card (PT)','Card (EN)','Quantidade','Qualidade (M NM SP MP HP D)','Idioma (BR EN DE ES FR IT JP KO RU TW)','Raridade (M R U C)','Cor (W U B R G M A L)','Extras','Card #','Comentario'];
const csvCell=v=>{v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
async function buildCsv(){
  const items=Object.values(S.list); await Promise.all([...new Set(items.map(x=>x.s))].map(load));
  const rows=items.map(x=>({x,c:S.data[x.s].byId.get(x.id),d:S.data[x.s]})).filter(o=>o.c)
    .sort((a,b)=>a.x.s.localeCompare(b.x.s)||numKey(a.c.num)-numKey(b.c.num)||a.x.f.localeCompare(b.x.f));
  const out=[HEAD.join(',')];
  for(const {x,c,d} of rows){
    const cor=c.col.length>1?'M':(c.col||(/Land/.test(c.type)?'L':'A'));
    const v=tags(c); const com=v.length?`VERIFICAR: sigla da Liga para versão ${v.map(t=>VLBL[t]||t).join('/')} (Scryfall ${x.s} #${c.num})`:'';
    out.push([ '',d.name,x.s,'',c.name,x.q,S.qual,S.lang,RL[c.rar]||'',cor,x.f==='f'?'Foil':'',c.num,com].map(csvCell).join(','));
  }
  return out.join('\r\n')+'\r\n';
}
async function exportCsv(){
  const csv=await buildCsv(), name='vitrine_'+new Date().toISOString().slice(0,10)+'.csv';
  await saveFile(name,'﻿'+csv,'text/csv;charset=utf-8');
}
async function copyCsv(csv){
  csv=csv||await buildCsv();
  try{await navigator.clipboard.writeText(csv);toast('CSV copiado')}
  catch(e){const t=document.createElement('textarea');t.value=csv;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();try{document.execCommand('copy');toast('CSV copiado')}catch(_){toast('Não consegui copiar')}t.remove()}
}

/* ---------- votos / triagem ---------- */
const VK={s:'Bomba',y:'Sim',m:'Meh',n:'Não',x:'Ignorada'}, VC={s:[.36,.55,1],y:[.18,.72,.4],m:[.95,.65,.1],n:[.86,.22,.22]}, VCSS={s:'#5b8cff',y:'#2db865',m:'#f2a61a',n:'#db3838'}, VP={s:'BOMBA',y:'SIM',m:'MEH',n:'NÃO'};
const vkey=(s,id)=>s+'|'+id;
const szP=o=>Object.keys(o.list||{}).length+Object.keys(o.votes||{}).length;
const isBasic=c=>/Basic Land/.test(c.type);
const realVotes=()=>Object.values(S.votes).filter(v=>v!=='x').length;
const eligible=d=>d.cards.filter(c=>!isBasic(c)).length;
function voteCounts(set){const r={s:0,y:0,m:0,n:0,x:0};for(const k in S.votes){if(!set||k.startsWith(set+'|'))r[S.votes[k]]++}return r}
let TQ=[],drag=null;
function triQ(){return F.filter(c=>{if(isBasic(c)&&S.tf!=='x')return false;const v=S.votes[vkey(S.set,c.id)];return S.tf==='all'||(S.tf==='p'?!v:v===S.tf)})}
function mountTri(){
  $('#main').innerHTML=`<div class="tri"><div class="tri-top"><select id="triF" aria-label="Fila"><option value="p">Não votadas</option><option value="all">Todas</option><option value="y">Só Sim</option><option value="s">Só Bomba</option><option value="m">Só Meh</option><option value="n">Só Não</option><option value="x">Só ignoradas</option></select><span class="meta" id="triMeta"></span></div>
  <div class="tri-stage" id="triStage"></div><div class="tri-info" id="triInfo"></div>
  <div class="tri-bar"><button class="tb no" data-v="n" aria-label="Não (seta esquerda)">✕<small>Não</small></button><button class="tb meh" data-v="m" aria-label="Meh (seta para baixo)">~<small>Meh</small></button><button class="tb sup" data-v="s" aria-label="Bomba (seta para cima)">★<small>Bomba</small></button><button class="tb yes" data-v="y" aria-label="Sim (seta direita)">♥<small>Sim</small></button></div>
  <div class="tri-bar2"><button class="btn" id="triUndo">↶ Desfazer</button><button class="btn" data-v="x" title="Tirar da votação sem dar nota (tecla X)">⊘ Pular sem votar</button><button class="btn" id="triVotes">Votos e impressão</button></div>
  <div class="keys"><kbd>←</kbd> não · <kbd>→</kbd> sim · <kbd>↑</kbd> ou <kbd>B</kbd> bomba · <kbd>↓</kbd> ou <kbd>M</kbd> meh · <kbd>X</kbd> pular sem votar · <kbd>Z</kbd> desfazer · arraste a carta: esquerda = não, direita = sim, cima = bomba, baixo = meh · botão direito do mouse = meh</div></div>`;
  $('#triF').value=S.tf; $('#triF').onchange=e=>{S.tf=e.target.value;S.ti=0;renderTri()};
  bindTri(); renderTri();
}
function triCardHtml(c,d){return `<div class="tc" data-d="${d}" data-id="${c.id}"><img alt="${esc(c.name)}" draggable="false" src="${c.hi||c.img}">${d===0?'<span class="st y">SIM</span><span class="st n">NÃO</span><span class="st m">MEH</span><span class="st s">★ BOMBA</span>':''}</div>`}
function renderTri(){
  const st=$('#triStage'); if(!st)return;
  TQ=triQ(); if(S.ti>=TQ.length)S.ti=Math.max(0,TQ.length-1);
  const cs=TQ.slice(S.ti,S.ti+3), cnt=voteCounts(S.set), tot=eligible(S.data[S.set]);
  $('#triMeta').textContent=`Bomba ${cnt.s} · Sim ${cnt.y} · Meh ${cnt.m} · Não ${cnt.n} · sem voto ${Math.max(0,tot-cnt.s-cnt.y-cnt.m-cnt.n-cnt.x)}${cnt.x?` · ignoradas ${cnt.x}`:''}`;
  const bar=document.querySelector('.tri-bar');
  if(!cs.length){st.innerHTML='';st.style.display='none';bar.style.visibility='hidden';
    $('#triInfo').innerHTML=`<div class="empty" style="padding:20px">${S.tf==='p'?'Todas as cartas desta seleção já foram votadas.':'Nenhuma carta nesta fila.'}<br><button class="btn pri" style="margin-top:12px" id="triVotes2">Votos e impressão</button></div>`;return}
  st.style.display='';bar.style.visibility='';
  st.innerHTML=cs.map((c,i)=>triCardHtml(c,i)).reverse().join('');
  const c=cs[0], v=S.votes[vkey(S.set,c.id)], tg=tags(c);
  $('#triInfo').innerHTML=`<div class="tn">${esc(c.name)}</div><div class="meta">#${esc(c.num)} · ${RAR[c.rar]||c.rar}${tg.length?' · '+esc(tg.map(t=>VLBL[t]||t).join(', ')):''}${v?' · voto atual: '+VK[v]:''}</div><div class="tri-tags">${tagChips(c)}</div>`;
  $('#bgart').style.backgroundImage=`url(${c.img})`;
}
function bindTri(){
  const st=$('#triStage'), T=Math.min(110,innerWidth*.22);
  const dec=(dx,dy)=>dx>T&&dx>Math.abs(dy)?'y':dx<-T&&-dx>Math.abs(dy)?'n':dy<-T&&-dy>Math.abs(dx)?'s':dy>T&&dy>Math.abs(dx)?'m':null;
  st.addEventListener('pointerdown',e=>{
    if(e.button!==0||S.busy)return; const el=e.target.closest('.tc[data-d="0"]'); if(!el)return;
    drag={el,x:e.clientX,y:e.clientY,id:e.pointerId,dx:0,dy:0};
    try{el.setPointerCapture(e.pointerId)}catch(_){} el.style.transition='none'; el.style.cursor='grabbing';
  });
  st.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return; drag.dx=e.clientX-drag.x; drag.dy=e.clientY-drag.y;
    const {el,dx,dy}=drag, k=v=>Math.max(0,Math.min(1,v/T));
    el.style.transform=`translate(${dx}px,${dy}px) rotate(${dx*.05}deg)`;
    el.querySelector('.st.y').style.opacity=k(dx); el.querySelector('.st.n').style.opacity=k(-dx); el.querySelector('.st.s').style.opacity=-dy>Math.abs(dx)?k(-dy):0; el.querySelector('.st.m').style.opacity=dy>Math.abs(dx)?k(dy):0;
  });
  const end=e=>{
    if(!drag||e.pointerId!==drag.id)return; const {el,dx,dy}=drag; drag=null; el.style.cursor='';
    const v=e.type==='pointercancel'?null:dec(dx,dy);
    if(v)flyOut(v); else{el.style.transition='';el.style.transform='';el.querySelectorAll('.st').forEach(x=>x.style.opacity=0)}
  };
  st.addEventListener('pointerup',end); st.addEventListener('pointercancel',end);
  st.addEventListener('contextmenu',e=>{e.preventDefault(); if(matchMedia('(hover:none)').matches)return; if(e.target.closest('.tc[data-d="0"]'))flyOut('m')});
}
function flyOut(v){
  if(S.busy||S.view!=='tri')return; const c=TQ[S.ti]; if(!c)return;
  const el=document.querySelector('#triStage .tc[data-d="0"]'); if(!el)return; S.busy=true;
  const W=innerWidth,H=innerHeight, dx=v==='y'?W:v==='n'?-W:0, dy=v==='s'?-H:v==='m'?H:0, ign=v==='x';
  const stamp=el.querySelector('.st.'+v); if(stamp)stamp.style.opacity=1;
  el.style.transition='transform .28s ease-in,opacity .28s'; el.style.transform=ign?'scale(.85)':`translate(${dx}px,${dy}px) rotate(${v==='y'?22:v==='n'?-22:0}deg)`; el.style.opacity=0;
  setTimeout(()=>{S.busy=false;commitVote(c,v)},270);
}
function commitVote(c,v){
  const k=vkey(S.set,c.id); S.votes[k]=v; S.undo.push(k); save();
  const Q2=triQ(); if(Q2[S.ti]&&Q2[S.ti].id===c.id)S.ti++;
  refreshCounts(); renderTri();
}
async function triUndo(){
  if(S.busy)return; const k=S.undo.pop(); if(!k){toast('Nada para desfazer');return}
  const [s,id]=k.split('|'); delete S.votes[k]; save(); refreshCounts();
  if(s!==S.set)await setSet(s);
  S.ti=Math.max(0,triQ().findIndex(c=>c.id===id)); renderTri(); toast('Voto desfeito');
}

/* ---------- votos: CSV e PDF ---------- */
const VM={inc:{s:true,y:true,m:true,n:true},ed:'all',pp:18,names:true,mark:true,hi:false,pg:0,items:[]};
try{const p=JSON.parse(store.get('vitrine-pp')||'null'); if(p){VM.pp=Math.min(48,Math.max(9,+p.pp||18));VM.names=p.names!==false;VM.mark=p.mark!==false;VM.hi=!!p.hi}}catch(e){}
const saveVm=()=>store.set('vitrine-pp',JSON.stringify({pp:VM.pp,names:VM.names,mark:VM.mark,hi:VM.hi}));
async function voteItems(){
  await Promise.all(SETS.map(s=>load(s).catch(()=>null)));
  const out=[];
  for(const k in S.votes){
    const [s,id]=k.split('|'), v=S.votes[k]; if(!VM.inc[v])continue; if(VM.ed!=='all'&&s!==VM.ed)continue;
    const d=S.data[s], c=d&&d.byId.get(id); if(c)out.push({s,c,v,d});
  }
  out.sort((a,b)=>SETS.indexOf(a.s)-SETS.indexOf(b.s)||numKey(a.c.num)-numKey(b.c.num)||String(a.c.num).localeCompare(String(b.c.num)));
  return out;
}
async function votesCsv(){
  const items=await voteItems(), out=[HEAD.concat(['Voto']).join(',')];
  for(const {s,c,v,d} of items){
    const cor=c.col.length>1?'M':(c.col||(/Land/.test(c.type)?'L':'A')), tg=tags(c);
    const com=tg.length?`VERIFICAR: sigla da Liga para versão ${tg.map(t=>VLBL[t]||t).join('/')} (Scryfall ${s} #${c.num})`:'';
    out.push(['',d.name,s,'',c.name,1,S.qual,S.lang,RL[c.rar]||'',cor,'',c.num,com,VK[v]].map(csvCell).join(','));
  }
  return out.join('\r\n')+'\r\n';
}
async function saveFile(name,data,type){
  try{bk.download(name,data,type);toast('Arquivo pronto');return true}catch(e){return false}
}
async function exportVotesCsv(){
  if(!VM.items.length){toast('Nenhum voto nesta seleção');return}
  const csv=await votesCsv(), name='vitrine_votos_'+new Date().toISOString().slice(0,10)+'.csv';
  if(!await saveFile(name,'﻿'+csv,'text/csv;charset=utf-8'))await copyCsv(csv);
}
/* layout A4: 63x88 mm e a carta em tamanho natural */
function pdfLayout(n,names){
  const W=210,H=297,m=6,g=names?2.5:2,cap=names?4:0,foot=7; let best=null;
  for(let c=1;c<=n;c++){
    const r=Math.ceil(n/c), wA=(W-2*m-(c-1)*g)/c, hA=(H-2*m-foot-(r-1)*g)/r-cap, cw=Math.min(wA,hA*63/88);
    if(cw>0&&(!best||cw>best.cw+1e-6))best={c,r,cw};
  }
  const cw=best.cw, ch=cw*88/63, th=best.r*(ch+cap)+(best.r-1)*g;
  return {cols:best.c,rows:best.r,cw,ch,cap,g,m,foot,W,H,scale:cw/63,y0:m+((H-2*m-foot)-th)/2};
}
function cellPos(L,i){
  const col=i%L.cols,row=Math.floor(i/L.cols), tw=L.cols*L.cw+(L.cols-1)*L.g;
  return {x:(L.W-tw)/2+col*(L.cw+L.g),y:L.y0+row*(L.ch+L.cap+L.g)};
}
function renderPrev(){
  const n=VM.pp, L=pdfLayout(n,VM.names), items=VM.items, pages=Math.max(1,Math.ceil(items.length/n));
  VM.pg=Math.min(VM.pg,pages-1);
  const dpi=Math.round((VM.hi?488:146)/(L.cw/25.4)), nat=Math.round(L.scale*100);
  $('#ppOut').textContent=n+' por página';
  $('#ppInfo').innerHTML=`<b>${L.cols} × ${L.rows}</b> · carta de <b>${L.cw.toFixed(0)} × ${L.ch.toFixed(0)} mm</b> (${nat}% do natural)<br><b>${items.length}</b> cartas · <b>${pages}</b> página${pages>1?'s':''} · cerca de <b>${dpi} dpi</b>${dpi<150?' <span class="warn">— baixa para impressão, ative alta resolução</span>':''}`;
  const PW=innerWidth<=820?120:Math.min(340,innerWidth-40), k=PW/210, pg=$('#pg');
  pg.style.width=PW+'px'; pg.style.height=(297*k)+'px';
  const sl=items.slice(VM.pg*n,(VM.pg+1)*n), fs=Math.max(4.5,Math.min(7,L.cw*2.8346*.085))*.3528;
  pg.innerHTML=sl.map((it,i)=>{
    const p=cellPos(L,i);
    return `<div class="pc" style="left:${p.x*k}px;top:${p.y*k}px;width:${L.cw*k}px;${VM.mark?`outline:${Math.max(1,.55*k)}px solid ${VCSS[it.v]};`:''}"><img alt="" src="${it.c.img}">${VM.names?`<i style="top:${(L.ch+.4)*k}px;font-size:${fs*k}px">${esc('#'+it.c.num+' '+it.c.name)}</i>`:''}</div>`;
  }).join('')+(items.length?'':`<div style="position:absolute;inset:0;display:grid;place-items:center;color:#888;font:13px var(--f-disp);text-align:center;padding:20px">Nenhum voto nesta seleção.<br>Vote na Triagem e volte aqui.</div>`)+`<div class="ft" style="top:${(297-6)*k}px;font-size:${2.2*k}px">${sl.length?'Vitrine de Sets':''}</div>`;
  $('#pgN').textContent=`Página ${VM.pg+1} de ${pages}`;
  $('#pgPrev').disabled=VM.pg<=0; $('#pgNext').disabled=VM.pg>=pages-1;
}
async function vmRefresh(){
  await Promise.all(SETS.map(s=>load(s).catch(()=>null)));
  $('#vmSum').innerHTML=SETS.map(s=>{const d=S.data[s]; if(!d)return ''; const c=voteCounts(s); return `<tr><td><b>${s.toUpperCase()}</b></td><td>Bomba ${c.s}</td><td>Sim ${c.y}</td><td>Meh ${c.m}</td><td>Não ${c.n}</td><td>sem voto ${Math.max(0,eligible(d)-c.s-c.y-c.m-c.n-c.x)}</td></tr>`}).join('');
  const ed=$('#vmEd'); if(!ed.options.length)ed.innerHTML='<option value="all">Todas</option>'+SETS.map(s=>`<option value="${s}">${s.toUpperCase()}</option>`).join('');
  VM.items=await voteItems(); $('#vmCount').textContent=VM.items.length+' cartas na seleção';
  $('#pp').value=VM.pp; $('#ppNames').checked=VM.names; $('#ppMark').checked=VM.mark; $('#ppHi').checked=VM.hi;
  renderPrev();
}
function openVm(o){$('#vm').classList.toggle('open',o); if(o){VM.pg=0;$('#ppStat').textContent='';vmRefresh()}}
const lat=s=>{const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i)&255;return a};
function ptxt(s){
  let o=''; for(const ch of String(s).normalize('NFC')){
    const c=ch.codePointAt(0);
    if(c<128||(c>=160&&c<256))o+=ch;
    else{const b=ch.normalize('NFD')[0]; o+=(b&&b.charCodeAt(0)<128)?b:(/[–—]/.test(ch)?'-':/[‘’]/.test(ch)?"'":/[“”]/.test(ch)?'"':'?')}
  }
  return o.replace(/[\\()]/g,m=>'\\'+m);
}
async function toJpeg(src){
  const im=new Image(); im.crossOrigin='anonymous'; im.src=src; await im.decode();
  const cv=document.createElement('canvas'); cv.width=im.naturalWidth; cv.height=im.naturalHeight;
  const x=cv.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,cv.width,cv.height); x.drawImage(im,0,0);
  const b=atob(cv.toDataURL('image/jpeg',.92).split(',')[1]), a=new Uint8Array(b.length);
  for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);
  return {a,w:cv.width,h:cv.height};
}
function buildPdf(items,imgs,L){
  const n=VM.pp, N=items.length, P=Math.ceil(N/n), mm=v=>v*72/25.4, f=v=>(+v).toFixed(2), total=5+N+2*P;
  const parts=[], offs=[]; let len=0;
  const push=b=>{if(typeof b==='string')b=lat(b);parts.push(b);len+=b.length};
  const obj=(id,dict,stream)=>{
    offs[id]=len; push(id+' 0 obj\n');
    if(stream){push('<< '+dict+' /Length '+stream.length+' >>\nstream\n');push(stream);push('\nendstream\n')}else push(dict+'\n');
    push('endobj\n');
  };
  push('%PDF-1.4\n'); push(new Uint8Array([37,226,227,207,211,10]));
  const kids=[]; for(let p=0;p<P;p++)kids.push((5+N+2*p+1)+' 0 R');
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Count '+P+' /Kids ['+kids.join(' ')+'] >>');
  obj(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  imgs.forEach((im,i)=>obj(5+i,'/Type /XObject /Subtype /Image /Width '+im.w+' /Height '+im.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',im.a));
  const sets=[...new Set(items.map(i=>i.s.toUpperCase()))].join(', ');
  for(let p=0;p<P;p++){
    const sl=items.slice(p*n,(p+1)*n), used=[]; let cs='';
    sl.forEach((it,i)=>{
      const idx=p*n+i, pos=cellPos(L,i), X=mm(pos.x), Y=mm(L.H-pos.y-L.ch), w=mm(L.cw), h=mm(L.ch); used.push(idx);
      cs+=`q ${f(w)} 0 0 ${f(h)} ${f(X)} ${f(Y)} cm /I${idx} Do Q\n`;
      if(VM.mark){
        const c=VC[it.v].map(f).join(' ');
        cs+=`q ${c} RG 1.6 w ${f(X)} ${f(Y)} ${f(w)} ${f(h)} re S Q\n`;
        cs+=`q ${c} rg ${f(X)} ${f(Y+h-9)} 34 9 re f Q\n`;
        cs+=`BT /F2 6 Tf 1 g ${f(X+3)} ${f(Y+h-6.8)} Td (${ptxt(VP[it.v])}) Tj ET\n`;
      }
      if(VM.names){
        const fs=Math.max(4.5,Math.min(7,w*.085)), mx=Math.floor(w/(fs*.52)); let t='#'+it.c.num+' '+it.c.name; if(t.length>mx)t=t.slice(0,Math.max(1,mx-2))+'..';
        cs+=`BT /F1 ${f(fs)} Tf 0.1 g ${f(X)} ${f(Y-fs-1.5)} Td (${ptxt(t)}) Tj ET\n`;
      }
    });
    cs+=`BT /F1 6 Tf 0.4 g ${f(mm(L.m))} ${f(mm(4))} Td (${ptxt('Vitrine de Sets - '+sets+' - pagina '+(p+1)+'/'+P+' - azul = bomba, verde = sim, amarelo = meh, vermelho = nao')}) Tj ET\n`;
    const cid=5+N+2*p, pid=cid+1;
    obj(cid,'',lat(cs));
    obj(pid,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents '+cid+' 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << '+used.map(i=>'/I'+i+' '+(5+i)+' 0 R').join(' ')+' >> >> >>');
  }
  const xo=len; let x='xref\n0 '+total+'\n0000000000 65535 f \n';
  for(let i=1;i<total;i++)x+=String(offs[i]).padStart(10,'0')+' 00000 n \n';
  push(x+'trailer\n<< /Size '+total+' /Root 1 0 R >>\nstartxref\n'+xo+'\n%%EOF\n');
  const out=new Uint8Array(len); let o=0; for(const b of parts){out.set(b,o);o+=b.length} return out;
}
async function makePdf(){
  if(!VM.items.length){toast('Nenhum voto para imprimir');return}
  const btn=$('#vPdf'), stt=$('#ppStat'), items=VM.items.slice(); btn.disabled=true;
  try{
    const L=pdfLayout(VM.pp,VM.names);
    const imgs=[];
    for(let i=0;i<items.length;i++){stt.textContent=`Preparando imagens ${i+1}/${items.length}`; imgs.push(await toJpeg(VM.hi?(items[i].c.hi||items[i].c.img):items[i].c.img))}
    stt.textContent='Montando PDF…';
    const bytes=buildPdf(items,imgs,L);
    const ok=await saveFile('vitrine_triagem_'+new Date().toISOString().slice(0,10)+'.pdf',new Blob([bytes],{type:'application/pdf'}),'application/pdf');
    stt.textContent=ok?'':'Não consegui baixar o PDF.';
  }catch(e){stt.textContent='Erro: '+e.message}
  finally{btn.disabled=false}
}
$('#bVotes').onclick=()=>openVm(true); $('#vmClose').onclick=()=>openVm(false);
document.querySelectorAll('[data-inc]').forEach(el=>el.onchange=async()=>{VM.inc[el.dataset.inc]=el.checked;VM.pg=0;VM.items=await voteItems();$('#vmCount').textContent=VM.items.length+' cartas na seleção';renderPrev()});
$('#vmEd').onchange=async e=>{VM.ed=e.target.value;VM.pg=0;VM.items=await voteItems();$('#vmCount').textContent=VM.items.length+' cartas na seleção';renderPrev()};
$('#pp').oninput=e=>{VM.pp=+e.target.value;VM.pg=0;saveVm();renderPrev()};
$('#ppNames').onchange=e=>{VM.names=e.target.checked;saveVm();renderPrev()};
$('#ppMark').onchange=e=>{VM.mark=e.target.checked;saveVm();renderPrev()};
$('#ppHi').onchange=e=>{VM.hi=e.target.checked;saveVm();renderPrev()};
$('#pgPrev').onclick=()=>{VM.pg=Math.max(0,VM.pg-1);renderPrev()}; $('#pgNext').onclick=()=>{VM.pg++;renderPrev()};
$('#vCsv').onclick=exportVotesCsv; $('#vCsvCopy').onclick=async()=>{if(!VM.items.length){toast('Nenhum voto nesta seleção');return}copyCsv(await votesCsv())};
$('#vPdf').onclick=makePdf;

/* ---------- eventos ---------- */
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('.tab');if(b&&b.dataset.s!==S.set)setSet(b.dataset.s)});
$('#vCar').onclick=()=>setView('car'); $('#vGrid').onclick=()=>setView('grid'); $('#vTri').onclick=()=>setView('tri');
$('#chips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;const c=b.dataset.c;S.cols.has(c)?S.cols.delete(c):S.cols.add(c);renderChips();renderStage()});
let qt; $('#q').addEventListener('input',e=>{clearTimeout(qt);qt=setTimeout(()=>{S.q=e.target.value;renderStage()},180)});
$('#selTag').onchange=e=>{S.tag=e.target.value;renderStage()};
$('#selVar').onchange=e=>{S.vr=e.target.value;renderStage()}; $('#selRar').onchange=e=>{S.rar=e.target.value;renderStage()};
$('#modeSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setMode(b.dataset.m)});
function setMode(m){S.mode=m;document.querySelectorAll('#modeSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m))}
let lastAct=0;
function stepAct(e){const a=e.target.closest('[data-a]'); if(!a)return false; if(e.type==='click'&&Date.now()-lastAct<500)return true; lastAct=Date.now(); try{addCur(a.dataset.a,+a.dataset.n)}catch(err){toast('Erro: '+err.message)} return true}
$('#main').addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')stepAct(e)});
$('#main').addEventListener('click',e=>{
  if(stepAct(e))return;
  const tg=e.target.closest('[data-tag]'); if(tg){S.tag=S.tag===tg.dataset.tag?'':tg.dataset.tag;$('#selTag').value=S.tag;renderStage();return}
  const sm=e.target.closest('[data-sim]'); if(sm){jumpTo(sm.dataset.sim);return}
  const g=e.target.closest('[data-g]'); if(g){go(+g.dataset.g);return}
  const tv=e.target.closest('[data-v]'); if(tv){flyOut(tv.dataset.v);return}
  if(e.target.closest('#triUndo')){triUndo();return}
  if(e.target.closest('#triVotes,#triVotes2')){openVm(true);return}
  if(e.target.closest('#bFlip')){flip();return}
  if(e.target.closest('#bToGrid')){setView('grid')}
});
function jumpTo(name){
  let i=F.findIndex(c=>c.name===name);
  if(i<0){S.q='';S.cols.clear();S.vr='all';S.rar='all';S.tag='';$('#q').value='';$('#selVar').value='all';$('#selRar').value='all';$('#selTag').value='';renderChips();F=filtered();i=F.findIndex(c=>c.name===name)}
  if(i>=0){S.idx=i;S.flip=0;renderStage(true)}
}
function flip(){S.flip=S.flip?0:180;const c=curCard();const el=c&&reelEls.get(c.id);if(el)el.querySelector('.tilt').style.setProperty('--flip',S.flip+'deg')}
$('#focusMenu').onclick=()=>document.body.classList.toggle('menu'); $('#bList').onclick=()=>openDrawer(true); $('#dClose').onclick=$('#scrim').onclick=()=>openDrawer(false);
$('#dList').addEventListener('click',e=>{const b=e.target.closest('[data-k]');if(!b)return;const [s,id,f]=b.dataset.k.split('|');const x=S.list[b.dataset.k];if(!x)return;const nq=x.q+(+b.dataset.d);if(nq<=0)delete S.list[b.dataset.k];else x.q=nq;save();refreshCounts()});
$('#dQ').onchange=e=>{S.qual=e.target.value;save()}; $('#dL').onchange=e=>{S.lang=e.target.value;save()};
$('#bExp').onclick=exportCsv; $('#bCopy').onclick=()=>copyCsv();
$('#bClear').onclick=async()=>{ if(!S.confirm){S.confirm=true;$('#bClear').textContent='Confirmar: esvaziar (guarda cópia)';return}
  await db.kv.set('list-backup',{at:new Date().toISOString(),list:S.list}); S.list={};S.confirm=false;$('#bClear').textContent='Limpar lista';save();refreshCounts();renderStage(true) };
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')||e.metaKey||e.ctrlKey)return;
  const k=e.key.toLowerCase();
  if(k==='escape'){openDrawer(false);openVm(false);openEd(false);openPage('lands',false);openPage('rep',false);openPage('arq',false);return}
  if($('#vm').classList.contains('open')||document.querySelector('.page.open'))return;
  if(k==='l'){openDrawer(!$('#drawer').classList.contains('open'));return}
  if(k==='g'){setView(S.view==='car'?'grid':'car');return}
  if(S.view==='tri'){
    if(k==='arrowright'||k==='d'){e.preventDefault();flyOut('y')}
    else if(k==='arrowleft'||k==='a'){e.preventDefault();flyOut('n')}
    else if(k==='arrowup'||k==='w'||k==='b'){e.preventDefault();flyOut('s')}
    else if(k==='arrowdown'||k==='s'||k==='m'){e.preventDefault();flyOut('m')}
    else if(k==='x'||k==='delete'){e.preventDefault();flyOut('x')}
    else if(k==='z'||k==='backspace'){e.preventDefault();triUndo()}
    return;
  }
  if(S.view!=='car')return;
  if(['arrowdown','arrowright','s','d'].includes(k)){e.preventDefault();go(1)}
  else if(['arrowup','arrowleft','w','a'].includes(k)){e.preventDefault();go(-1)}
  else if(k===' '){e.preventDefault();flip()}
  else if(k==='enter'||k==='+'||k==='='){e.preventDefault();addCur(S.mode,1)}
  else if(k==='backspace'||k==='-'){e.preventDefault();addCur(S.mode,-1)}
  else if(k==='f'){setMode(S.mode==='f'?'n':'f');toast(S.mode==='f'?'Modo foil':'Modo normal')}
});

/* ---------- edições: adicionar, atualizar, arquivar ---------- */
const edBusy=new Set();
function openEd(o){$('#ed').classList.toggle('open',o); if(o){$('#edStat').textContent='';$('#bkStat').textContent='';renderEd()}}
function renderEd(){
  const h=ROWS.map(r=>{
    const have=S.data[r.code]?S.data[r.code].cards.length:(r.have||0), busy=edBusy.has(r.code);
    return `<div class="edrow ${r.archived?'arch':''}" data-code="${esc(r.code)}">${r.icon?`<img alt="" src="${iconUrl(r)}">`:'<span class="ic"></span>'}
      <div><div class="nm">${esc(r.name)} <span class="meta">${esc(r.code.toUpperCase())}</span></div><div class="meta">${have} de ${Math.max(r.total,have)} cartas · lançamento ${esc(r.released||'?')} · atualizada ${esc(fmtDate(r.updated))}${r.archived?' · arquivada':''}</div></div>
      <div class="acts">${r.archived?`<button class="btn" data-ea="restore">Restaurar</button>`:`<button class="btn pri" data-ea="update" ${busy?'disabled':''}>${busy?'Atualizando…':'Atualizar'}</button><button class="btn" data-ea="archive">Arquivar</button>`}</div></div>`;
  }).join('');
  $('#edList').innerHTML=h||'<div class="vm-info">Nenhuma edição ainda.</div>';
  $('#edAll').disabled=!ROWS.some(r=>!r.archived);
}
async function syncOne(code){
  if(edBusy.has(code))return null;
  edBusy.add(code); renderEd();
  const stat=m=>{$('#edStat').textContent=code.toUpperCase()+': '+m};
  try{
    const r=await cat.syncSet(code,stat);
    delete S.data[code]; await refreshRows();
    stat(r.isNew?`adicionada, ${r.total} de ${Math.max(r.total,r.row.total)} cartas.`:`${r.added} nova${r.added===1?'':'s'}, ${r.changed} atualizada${r.changed===1?'':'s'}. Agora ${r.total} de ${Math.max(r.total,r.row.total)}.`);
    return r;
  }catch(e){stat('erro — '+e.message); return null}
  finally{edBusy.delete(code); renderEd()}
}
async function afterSync(code){
  renderTabs();
  if(!S.data[code]&&(code===S.set||!SETS.includes(S.set)||!S.data[S.set])){await setSet(code)}
  else if(code===S.set){await load(code); renderStage(true)}
  if($('#drawer').classList.contains('open'))renderDrawer();
}
$('#bEd').onclick=()=>openEd(true); $('#edClose').onclick=()=>openEd(false);
$('#edAddForm').addEventListener('submit',async e=>{
  e.preventDefault(); const code=$('#edCode').value.trim().toLowerCase(); if(!code)return;
  if(ROWS.some(r=>r.code===code)){$('#edStat').textContent=code.toUpperCase()+': já existe'+(ROWS.find(r=>r.code===code).archived?' (arquivada — use Restaurar)':' — use Atualizar');return}
  const r=await syncOne(code); if(r){$('#edCode').value='';await afterSync(code)}
});
$('#edList').addEventListener('click',async e=>{
  const b=e.target.closest('[data-ea]'); if(!b)return; const code=b.closest('.edrow').dataset.code, a=b.dataset.ea;
  if(a==='update'){const r=await syncOne(code); if(r)await afterSync(code)}
  else if(a==='archive'){
    const votes=Object.keys(S.votes).filter(k=>k.startsWith(code+'|')).length, list=Object.values(S.list).filter(x=>x.s===code).reduce((n,x)=>n+x.q,0);
    if(!confirm(`Arquivar ${code.toUpperCase()}?\n\nA aba some, mas ${votes} voto(s) e ${list} carta(s) da lista continuam guardados e voltam ao restaurar. Nada é apagado.\n\nOK para arquivar. (Dica: exporte o backup antes, na seção abaixo.)`))return;
    await cat.setArchived(code,true); await refreshRows();
    if(S.set===code){await setSet(SETS[0]||null)} else renderTabs();
    renderEd();
  }
  else if(a==='restore'){await cat.setArchived(code,false); await refreshRows(); renderTabs(); renderEd(); if(!S.data[S.set])await setSet(code)}
});
$('#edAll').onclick=async()=>{
  const btn=$('#edAll'); btn.disabled=true;
  for(const code of SETS.slice()){const r=await syncOne(code); if(r)await afterSync(code)}
  btn.disabled=false; $('#edStat').textContent='Todas atualizadas.';
};

/* backup JSON */
const PREF_KEYS=['vitrine-view','vitrine-set','vitrine-pp'];
$('#bkExp').onclick=async()=>{
  await flushSave();
  const prefs={}; PREF_KEYS.forEach(k=>{const v=store.get(k);if(v!=null)prefs[k]=v});
  bk.download('vitrine_backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(bk.build(userDoc(),prefs,ROWS),null,1),'application/json');
  $('#bkStat').textContent=`Backup salvo: ${Object.keys(S.votes).length} votos, ${totalQty()} cartas na lista.`;
};
$('#bkImp').onclick=()=>$('#bkFile').click();
$('#bkFile').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f)return; const st=$('#bkStat');
  try{
    const d=bk.parse(await f.text()), m=bk.merge(userDoc(),d);
    await db.kv.set('list-backup-pre-import',{at:new Date().toISOString(),...JSON.parse(JSON.stringify(userDoc()))});
    S.list=m.user.list; S.votes=m.user.votes; S.qual=m.user.qual; S.lang=m.user.lang; $('#dQ').value=S.qual; $('#dL').value=S.lang;
    for(const k in d.prefs||{})if(PREF_KEYS.includes(k))store.set(k,d.prefs[k]);
    await flushSave(); st.textContent=`Importado: ${m.votes} voto(s) e ${m.list} item(ns) da lista novos ou alterados.`;
    const miss=(d.sets||[]).filter(s=>!ROWS.some(r=>r.code===s.code));
    for(const s of miss){st.textContent=`Baixando edição ${s.code.toUpperCase()}…`; const r=await syncOne(s.code); if(r&&s.archived)await cat.setArchived(s.code,true)}
    await refreshRows(); renderTabs(); refreshCounts(); renderEd();
    if(!S.data[S.set]&&SETS.length)await setSet(SETS[0]); else renderStage(true);
    if(miss.length)st.textContent=`Importado e ${miss.length} edição(ões) baixada(s).`;
  }catch(err){st.textContent='Erro: '+err.message}
};

/* ---------- tela Arquétipos ---------- */
async function openArq(){
  openPage('arq',true); const body=$('#arqBody');
  if(!S.set||!S.data[S.set]){body.innerHTML='<div class="vm-box">Baixe uma edição primeiro.</div>';return}
  body.innerHTML='<div class="vm-box"><div class="vm-info">Analisando '+esc(S.data[S.set].name)+'…</div></div>';
  const a=await ensureAnalysis(S.set);
  if(!a){body.innerHTML='<div class="vm-box"><h3>Sem dados suficientes</h3><div class="vm-info">As cartas desta edição foram baixadas numa versão antiga e é preciso atualizá-las (precisa de internet). Abra Edições e toque em Atualizar.</div></div>';return}
  fillTagSelect();
  const vn=voteOfName(S.set), scores={};
  for(const x of a.arquetipos)scores[x.cores]=arch.pontuar(x,a.etiquetas,vn);
  body.innerHTML=arqview.renderArq(a,ARR,scores,S.data[S.set].name+' ('+S.set.toUpperCase()+')',Object.keys(S.votes).some(k=>k.startsWith(S.set+'|')&&S.votes[k]!=='x'));
}
$('#bArq').onclick=openArq;
$('#arqBody').addEventListener('click',e=>{
  const b=e.target.closest('[data-tag]'); if(!b)return;
  S.tag=b.dataset.tag; fillTagSelect(); $('#selTag').value=S.tag; openPage('arq',false); setView('grid');
});

/* ---------- lands por cor e pré-release vs votos ---------- */
const openPage=(id,o)=>$('#'+id).classList.toggle('open',o);
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>openPage(b.dataset.close,false));
let landsUi=null;
function openLands(p,total){
  if(!landsUi)landsUi=lands.mountLands($('#landsBox'));
  if(p)landsUi.fill(p,total);
  openPage('lands',true);
}
$('#bLands').onclick=()=>openLands();
let REP=null;
async function openRep(){
  await Promise.all(SETS.map(s=>load(s).catch(()=>null)));
  await Promise.all(SETS.map(s=>ensureAnalysis(s).catch(()=>null)));
  $('#repSet').innerHTML=SETS.map(s=>`<option value="${s}">${esc(S.data[s]?S.data[s].name:s)} (${s.toUpperCase()})</option>`).join('');
  if(SETS.includes(S.set))$('#repSet').value=S.set;
  $('#repDemo').hidden=!location.hostname.match(/^(localhost|127\.0\.0\.1)$/);
  openPage('rep',true);
}
$('#bRep').onclick=openRep;
$('#repPick').onclick=()=>$('#repFile').click();
$('#repFile').onchange=async e=>{const f=e.target.files[0]; e.target.value=''; if(f)runReport(await f.text())};
$('#repDemo').onclick=async()=>runReport(await (await fetch('samples/manabox_sample.csv')).text());
$('#repSet').onchange=()=>REP&&runReport(REP.text);
function runReport(text){
  const st=$('#repStat'), code=$('#repSet').value;
  try{
    const rows=report.parseCsv(text); if(!rows.length)throw new Error('CSV vazio');
    const cardsBySet={}; SETS.forEach(s=>{if(S.data[s])cardsBySet[s]=S.data[s].cards});
    const res=report.analyze(rows,S.votes,cardsBySet), cards=S.data[code].cards;
    const pr=report.pullReport(res,code,cards,S.votes), dk=report.deckOverview(res,code,3,ARQ[code]&&ARR?{etiquetas:ARQ[code].etiquetas,label:t=>arch.label(ARR,t)}:null);
    REP={text,res,dk};
    const outside=Object.entries(res.fora).map(([k,n])=>`${k.toUpperCase()}: ${n}`).join(', ');
    st.innerHTML=`${rows.length} linhas lidas.${outside?` Fora das edições carregadas: ${esc(outside)}.`:''}${Object.keys(S.votes).length?'':' <span class="warn">Você ainda não votou nada neste aparelho.</span>'}`;
    $('#repOut').innerHTML=report.renderPull(pr,code)+report.renderDecks(dk,code);
  }catch(err){st.textContent='Erro: '+err.message}
}
$('#repOut').addEventListener('click',e=>{
  const b=e.target.closest('[data-lands]'); if(!b||!REP)return;
  const d=REP.dk.ranking.find(x=>x.pair===b.dataset.lands); if(d)openLands(d.pips,17);
});

/* ---------- primeira execução ---------- */
function renderBoot(){
  $('#main').innerHTML=`<div class="boot"><h1>Vitrine de Sets</h1><p>Ainda não há edições neste aparelho. As cartas vêm do Scryfall e ficam guardadas aqui para uso offline.</p><button class="btn pri" id="bootGo">Baixar FRA e TRK</button><button class="btn" id="bootEd">Escolher outra edição</button><p class="meta" id="bootStat"></p></div>`;
  $('#bootEd').onclick=()=>openEd(true);
  $('#bootGo').onclick=async()=>{
    $('#bootGo').disabled=true;
    for(const code of cat.DEFAULT_SETS){
      const r=await cat.syncSet(code,m=>{$('#bootStat').textContent=code.toUpperCase()+': '+m}).catch(e=>{$('#bootStat').textContent=code.toUpperCase()+': erro — '+e.message;return null});
      if(!r){$('#bootGo').disabled=false;await refreshRows();if(SETS.length)break;return}
      await refreshRows(); renderTabs();
    }
    await setSet(SETS[0]||null);
  };
}

/* ---------- atualização do app (service worker) ---------- */
function watchSw(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('sw.js').then(reg=>{
    const ready=w=>{ $('#upBar').hidden=false; $('#upGo').onclick=()=>w.postMessage({type:'SKIP_WAITING'}) };
    if(reg.waiting&&navigator.serviceWorker.controller)ready(reg.waiting);
    reg.addEventListener('updatefound',()=>{const w=reg.installing; w&&w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)ready(w)})});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{})});
  }).catch(()=>{});
  let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded)return;reloaded=true;location.reload()});
}

/* ---------- início ---------- */
(async function init(){
  renderChips(); watchSw();
  db.persist();
  await refreshRows();
  // migração: versão antiga guardava votos/lista no localStorage
  let u=await db.kv.get('user');
  if(!u){try{u=JSON.parse(store.get('vitrine')||'null')}catch(e){} if(u)await db.kv.set('user',u)}
  if(u){S.list=u.list||{};S.votes=u.votes||{};S.qual=u.qual||'NM';S.lang=u.lang||'EN';$('#dQ').value=S.qual;$('#dL').value=S.lang}
  const v=store.get('vitrine-view'); if(v==='grid'||v==='tri')S.view=v; if(S.view==='tri')mainOnly();
  const st=store.get('vitrine-set'); S.set=SETS.includes(st)?st:(SETS[0]||null);
  $('#cnt').textContent=totalQty(); $('#cntV').textContent=realVotes();
  await setSet(S.set);
  SETS.filter(s=>s!==S.set).forEach(s=>load(s).then(renderTabs).catch(()=>{}));
})();
