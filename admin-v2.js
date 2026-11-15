// Administration Awar n'Arrif — interface unique. Toutes les données passent par l'API protégée /api/admin/* (session par cookie HttpOnly).
(()=>{
 const $=id=>document.getElementById(id);
 const S={contribs:[],packets:[],all:false,packet:null,cid:null,audio:null,btn:null,gen:0};
 const PLAY='<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M6 4l14 8-14 8z"/></svg>';
 const PAUSE='<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
 const DL='<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>';
 const QUALITY={ok:['OK','ok'],low:['Faible','warn'],clipped:['Saturé','warn'],silent:['Silence','bad']};

 const pad=n=>String(n).padStart(2,'0');
 const idLabel=c=>'#'+String(c.n).padStart(5,'0');
 const plural=(n,a,b)=>n>1?b:a;
 const fdur=t=>`${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;
 const fcur=t=>`${Math.floor(t/60)}:${pad(Math.floor(t%60))}`;
 function fdate(raw){if(!raw)return '—';const d=new Date(raw.replace(' ','T')+(/[zZ]|[+-]\d\d:?\d\d$/.test(raw)?'':'Z'));return Number.isNaN(d.getTime())?raw:d.toLocaleString('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
 function el(tag,cls,text,html){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;if(html)e.innerHTML=html;return e}
 function msg(t,type){const m=$('ad-msg');m.textContent=t||'';m.className='ad-msg'+(t?' on':'')+(type?' '+type:'')}

 async function api(path,opts={}){
  const r=await fetch('/api/admin/'+path,{credentials:'same-origin',cache:'no-store',...opts});
  const type=r.headers.get('Content-Type')||'';
  if(!r.ok){let e={};if(type.includes('json')){try{e=await r.json()}catch{}}const err=Error(e.error||'Erreur '+r.status);err.status=r.status;throw err}
  return type.includes('json')?r.json():r.blob();
 }
 async function download(path,name,label){
  msg(label||'Préparation du téléchargement…');
  try{const b=await api(path),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),20000);msg('')}
  catch(e){guard(e)}
 }
 function guard(e){if(e.status===401||e.status===403)showLogin('Session expirée. Reconnectez-vous.');else msg(e.message,'err')}
 function stopAudio(){if(S.audio){S.audio.pause();S.audio=null}if(S.btn){S.btn.innerHTML=PLAY;S.btn=null}}

 function showLogin(m){stopAudio();$('ad-dash').hidden=true;$('ad-login').hidden=false;msg(m||'',m?'err':'')}
 function showDash(){$('ad-login').hidden=true;$('ad-dash').hidden=false}

 /* ---------- rendu ---------- */
 function renderKpis(stats){
  const packets=S.packets,counts=packets.map(p=>p.contributions),low=counts.length?Math.min(...counts):0,lows=packets.filter(p=>p.contributions===low);
  $('ad-k1').textContent=packets.length;$('ad-k2').textContent=stats.total_contributions;$('ad-k3').textContent=stats.total_recordings;
  $('ad-k4').textContent=lows.length?lows[0].id:'—';
  $('ad-k4s').textContent=lows.length?`(${low} ${plural(low,'contribution','contributions')})`+(lows.length>1?` · ${lows.length} ex æquo`:''):'Aucun paquet';
 }
 function renderChart(){
  const P=S.packets,vals=P.map(p=>p.contributions),max=Math.max(5,...vals),step=max>10?Math.ceil(max/5):1,top=Math.ceil(max/step)*step,low=Math.min(...vals);
  const W=560,H=250,L=58,R=12,T=26,B=52,pw=W-L-R,ph=H-T-B,slot=pw/Math.max(1,P.length),bw=Math.min(slot*.72,70),y=v=>T+ph-v/top*ph;let g='';
  for(let v=0;v<=top;v+=step)g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#e4d3bc"/><text x="${L-12}" y="${y(v)+5}" text-anchor="end" font-size="15">${v}</text>`;
  P.forEach((p,i)=>{const x=L+i*slot+(slot-bw)/2,hot=p.contributions===low;
   g+=`<rect x="${x}" y="${y(p.contributions)}" width="${bw}" height="${T+ph-y(p.contributions)}" fill="${hot?'#ee9a4d':'var(--teal)'}"><title>Paquet ${p.id} : ${p.contributions} ${plural(p.contributions,'contribution','contributions')}</title></rect>
      <text x="${x+bw/2}" y="${y(p.contributions)-8}" text-anchor="middle" font-size="17" font-weight="700">${p.contributions}</text>
      <text x="${x+bw/2}" y="${T+ph+22}" text-anchor="middle" font-size="15">P${p.id}</text>`});
  g+=`<line x1="${L}" x2="${L}" y1="${T}" y2="${T+ph}" stroke="#444"/><line x1="${L}" x2="${W-R}" y1="${T+ph}" y2="${T+ph}" stroke="#444"/><text transform="translate(16 ${T+ph/2}) rotate(-90)" text-anchor="middle" font-size="15">Contributions</text><text x="${L+pw/2}" y="${H-6}" text-anchor="middle" font-size="15">Paquets</text>`;
  $('ad-chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Contributions par paquet">${g}</svg>`;
 }
 function renderRecent(){
  const rows=S.all?S.contribs:S.contribs.slice(0,3),body=$('ad-recent');body.replaceChildren();
  for(const c of rows){const tr=el('tr');[idLabel(c),'P'+c.packet,fdate(c.created_at),String(c.audio_count)].forEach(v=>tr.append(el('td','',v)));
   const td=el('td','r'),b=el('button','ad-vbtn','',PLAY+'Voir');b.onclick=()=>{pick(c.packet,c.id);$('ad-explorer').scrollIntoView({behavior:'smooth',block:'start'})};td.append(b);tr.append(td);body.append(tr)}
  if(!rows.length){const tr=el('tr'),td=el('td','','Aucune contribution enregistrée pour le moment.');td.colSpan=5;tr.append(td);body.append(tr)}
  $('ad-all').firstChild.textContent=S.all?'Voir moins ':'Voir tout ';$('ad-recent-wrap').classList.toggle('long',S.all);
 }
 function fillSelects(){
  const ps=$('ad-packet');ps.replaceChildren();
  S.packets.forEach(p=>{const o=el('option','',`Paquet ${p.id} (${p.contributions} ${plural(p.contributions,'contribution','contributions')})`);o.value=p.id;if(p.id===S.packet)o.selected=true;ps.append(o)});
  const cs=$('ad-contrib');cs.replaceChildren();const list=S.contribs.filter(c=>c.packet===S.packet);
  if(!list.length){const o=el('option','','Aucune contribution');o.value='';cs.append(o)}
  list.forEach(c=>{const o=el('option','',`${idLabel(c)} – ${fdate(c.created_at)}`);o.value=c.id;if(c.id===S.cid)o.selected=true;cs.append(o)});
  $('ad-zip-packet').disabled=!S.packet||!list.length;$('ad-zip-one').disabled=!S.cid;
 }
 async function renderExplorer(){
  stopAudio();const gen=++S.gen,box=$('ad-ex'),info=$('ad-info');box.replaceChildren();
  if(!S.cid){info.textContent='Aucune contribution à afficher pour ce paquet.';return}
  info.textContent='Chargement des audios…';
  try{
   const d=await api('contributions/'+encodeURIComponent(S.cid));if(gen!==S.gen)return;
   const c=d.contribution,recs=d.recordings,bad=recs.filter(r=>r.quality&&r.quality!=='ok').length,rate=[...new Set(recs.filter(r=>r.sample_rate).map(r=>r.sample_rate/1000))].join(' / ');
   info.textContent=`Contribution ${idLabel(c)} · Paquet ${c.packet} · ${fdate(c.created_at)}`+(rate?` · WAV ${rate} kHz`:'')+(bad?` · ${bad} ${plural(bad,'audio à vérifier','audios à vérifier')}`:' · qualité audio conforme');
   const half=Math.ceil(recs.length/2);
   [recs.slice(0,half),recs.slice(half)].forEach(part=>{
    const wrap=el('div','ad-tw'),t=el('table','ad-t ex'),hd=el('thead');hd.innerHTML='<tr><th>#</th><th>Phrase (transcription)</th><th>Écoute</th><th>Durée</th><th>Qualité</th></tr>';t.append(hd);const tb=el('tbody');
    part.forEach(r=>{const tr=el('tr');tr.append(el('td','',pad(r.sentence)));const tx=el('td','',r.text||'—');tx.lang='rif';tr.append(tx);
     const ap=el('td');
     if(r.available){const p=el('div','ad-ap');p.dataset.n=r.sentence;const pl=el('button','pl','',PLAY);pl.setAttribute('aria-label','Écouter la phrase '+r.sentence);const tt=el('span','tt',`0:00 / ${fdur(r.duration)}`),bar=el('div','pg','','<i></i>'),dl=el('button','dl','',DL);dl.title='Télécharger ce WAV';dl.setAttribute('aria-label','Télécharger le WAV '+r.sentence);p.append(pl,tt,bar,dl);ap.append(p)}
     else ap.append(el('span','ad-miss','Fichier manquant'));
     tr.append(ap,el('td','',fdur(r.duration)));
     const q=QUALITY[r.quality],qt=el('td');if(q){const b=el('span','ad-q '+q[1],q[0]);b.title=`Niveau ${r.rms_db} dBFS · crête ${Math.round(r.peak*100)} %`+(r.clip>0?` · saturation ${(r.clip*100).toFixed(1)} %`:'');qt.append(b)}tr.append(qt);tb.append(tr)});
    t.append(tb);wrap.append(t);box.append(wrap)});
  }catch(e){if(gen===S.gen){info.textContent='';guard(e)}}
 }
 function pick(packet,cid){S.packet=packet;S.cid=cid||null;fillSelects();renderExplorer()}

 /* ---------- chargement ---------- */
 async function load(){
  try{
   const [stats,list]=await Promise.all([api('stats'),api('contributions')]);
   S.packets=stats.packets||[];S.contribs=list.contributions||[];showDash();msg('');
   renderKpis(stats);renderChart();renderRecent();
   const keep=S.contribs.find(c=>c.id===S.cid)||S.contribs[0];
   if(keep)pick(keep.packet,keep.id);else{S.packet=S.packets[0]?.id??null;S.cid=null;fillSelects();renderExplorer()}
  }catch(e){guard(e)}
 }
 async function init(){
  msg('Vérification de la session…');
  try{const s=await api('session');if(s.authenticated)await load();else showLogin()}catch(e){showLogin(e.message)}
 }

 /* ---------- événements ---------- */
 $('ad-form').onsubmit=async e=>{e.preventDefault();msg('Connexion…');
  try{await api('login',{method:'POST',headers:{'Content-Type':'application/json','X-Awar-Admin':'1'},body:JSON.stringify({password:$('ad-pass').value})});$('ad-pass').value='';await load()}
  catch(err){msg(err.message,'err')}};
 $('ad-out').onclick=async()=>{try{await api('logout',{method:'POST',headers:{'X-Awar-Admin':'1'}})}catch{}S.cid=null;showLogin('Vous êtes déconnecté.');$('ad-msg').className='ad-msg on'};
 $('ad-refresh').onclick=load;
 $('ad-all').onclick=()=>{S.all=!S.all;renderRecent()};
 $('ad-packet').onchange=e=>{const p=+e.target.value,l=S.contribs.filter(c=>c.packet===p);pick(p,l[0]?.id)};
 $('ad-contrib').onchange=e=>pick(S.packet,e.target.value||null);
 $('ad-zip-packet').onclick=()=>download('zip-packet/'+S.packet,`paquet-${pad(S.packet)}.zip`,'Préparation du ZIP du paquet…');
 $('ad-zip-one').onclick=()=>S.cid&&download('zip/'+S.cid,`contribution-${S.cid}.zip`,'Préparation du ZIP…');
 $('ad-csv').onclick=()=>download('export.csv','awar-corpus.csv','Préparation du CSV…');
 $('ad-ex').onclick=e=>{
  const ap=e.target.closest('.ad-ap');if(!ap||!S.cid)return;const n=pad(+ap.dataset.n),url=`/api/admin/audio/${S.cid}/${n}.wav`;
  if(e.target.closest('.dl')){download(`audio/${S.cid}/${n}.wav?download=1`,`${S.cid.slice(0,8)}-${n}.wav`);return}
  const pl=ap.querySelector('.pl');if(!e.target.closest('.pl'))return;
  const same=S.btn===pl;stopAudio();if(same)return;
  const a=new Audio(url),tt=ap.querySelector('.tt'),bar=ap.querySelector('.pg i'),total=tt.textContent.split(' / ')[1];S.audio=a;S.btn=pl;pl.innerHTML=PAUSE;
  a.ontimeupdate=()=>{tt.textContent=`${fcur(a.currentTime)} / ${total}`;bar.style.width=(a.duration?a.currentTime/a.duration*100:0)+'%'};
  a.onended=()=>{stopAudio();tt.textContent=`0:00 / ${total}`;bar.style.width='0'};
  a.onerror=()=>{stopAudio();msg('Lecture impossible : session expirée ou fichier introuvable.','err')};
  a.play().catch(()=>{});
 };
 document.querySelectorAll('[data-v="admin"]').forEach(b=>b.addEventListener('click',init));
})();
