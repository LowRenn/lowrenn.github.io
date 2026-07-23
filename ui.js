/* ============================================================
   UI — ortak durum (state), render motoru, sheet sistemi, başlangıç
   Bu bölüm ne yapıyor? Uygulamanın paylaşılan global durumunu
   (tracks, playlists, currentTab, queue vb.), tüm ekranların
   render edilmesini, alttan açılan pencere (sheet) sistemini ve
   uygulamanın başlangıç (bootstrap) akışını içerir.
   Hangi sistemlerle bağlantılı? Diğer TÜM dosyalar (database.js,
   metadata.js, import.js, player.js, playlist.js) buradaki global
   değişkenleri (tracks, playlists, currentTab...) okur/yazar.
   Dikkat: Bu dosya en son yüklenmeli (script sırası index.html'de
   ayarlı) çünkü init() burada başlar ve diğer tüm dosyaların
   tanımlanmış olmasını bekler.
============================================================ */
/* ============================================================
   İSTASYONUM — kişisel müzik istasyonu / çalar
   IndexedDB tabanlı, tek dosya, offline çalışır.
============================================================ */

/* ---------- Mobil gerçek yükseklik düzeltmesi ---------- */
function setRealVh(){
  document.documentElement.style.setProperty('--vh', (window.innerHeight*0.01)+'px');
}
setRealVh();
window.addEventListener('resize', setRealVh);
window.addEventListener('orientationchange', setRealVh);


/* ---------- Durum ---------- */
let tracks=[];        // {id,title,artist,album,description,lyrics,favorite,audioBlob,coverBlob,duration,addedAt}
let playlists=[];     // {id,name,trackIds:[],createdAt}
let currentTab='library';
let currentPlaylistId=null;
let queue=[];          // çalma sırası (track id listesi)
let queueIndex=-1;
let currentObjectUrls={audio:null, covers:{}};

const uid = ()=> 't'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

function fmtTime(sec){
  if(!sec || isNaN(sec)) return '0:00';
  sec=Math.floor(sec);
  const m=Math.floor(sec/60), s=sec%60;
  return m+':'+String(s).padStart(2,'0');
}
function fmtDurationLong(totalSec){
  totalSec=Math.floor(totalSec||0);
  const h=Math.floor(totalSec/3600), m=Math.floor((totalSec%3600)/60), s=totalSec%60;
  if(h>0) return `${h} sa ${m} dk`;
  if(m>0) return `${m} dk ${s} sn`;
  return `${s} sn`;
}
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),1800);
}
function coverUrl(track){
  if(!track || !track.coverBlob) return null;
  if(!currentObjectUrls.covers[track.id]) currentObjectUrls.covers[track.id]=URL.createObjectURL(track.coverBlob);
  return currentObjectUrls.covers[track.id];
}
function getTrack(id){ return tracks.find(t=>t.id===id); }
function getPlaylist(id){ return playlists.find(p=>p.id===id); }

const svgNote = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

/* ============================================================
   RENDER
============================================================ */
function render(){
  const view=document.getElementById('view');
  if(currentTab==='library') view.innerHTML = renderLibrary();
  else if(currentTab==='favorites') view.innerHTML = renderFavorites();
  else if(currentTab==='playlists') view.innerHTML = renderPlaylists();
  else if(currentTab==='playlistDetail') view.innerHTML = renderPlaylistDetail();
  bindViewEvents();
  updatePlayerBarVisibility();
}

function renderTrackRow(t, opts={}){
  const cu = coverUrl(t);
  const isPlaying = queue[queueIndex]===t.id && !audioEl.paused;
  return `
  <div class="track-row ${isPlaying?'playing':''}" data-id="${t.id}">
    <div class="tr-cover">${cu?`<img src="${cu}">`:svgNote}</div>
    <div class="tr-info">
      <div class="tr-title">${escapeHtml(t.title||'İsimsiz Parça')}</div>
      <div class="tr-sub">${escapeHtml(t.artist||'Bilinmeyen Sanatçı')}${t.album?' · '+escapeHtml(t.album):''}</div>
    </div>
    <div class="tr-dur mono">${fmtTime(t.duration)}</div>
    <button class="tr-heart ${t.favorite?'active':''}" data-heart="${t.id}">
      <svg viewBox="0 0 24 24" fill="${t.favorite?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
    </button>
  </div>`;
}

function renderLibrary(){
  const sorted=[...tracks].sort((a,b)=>b.addedAt-a.addedAt);
  return `
  <div class="section-head"><h2>Müziklerim</h2><span class="count mono">${tracks.length} parça</span></div>
  ${tracks.length===0 ? `
    <div class="empty">
      <div class="glyph">♪</div>
      <b>Müzik İstasyonun Henüz Boş</b>
      <p>Sağ alttaki dosya butonuyla ilk müziğini ekle.<br>Etiketleri otomatik okumayı deneriz, sonrasında hepsini elinle düzenleyebilirsin.</p>
    </div>` : `<div class="track-list">${sorted.map(t=>renderTrackRow(t)).join('')}</div>`}
  `;
}
function renderFavorites(){
  const favs=tracks.filter(t=>t.favorite).sort((a,b)=>b.addedAt-a.addedAt);
  return `
  <div class="section-head"><h2>Favoriler</h2><span class="count mono">${favs.length} parça</span></div>
  ${favs.length===0 ? `
    <div class="empty">
      <div class="glyph">♥</div>
      <b>Henüz favori yok</b>
      <p>Bir parçanın kalp ikonuna dokunarak favorilere ekleyebilirsin.</p>
    </div>` : `<div class="track-list">${favs.map(t=>renderTrackRow(t)).join('')}</div>`}
  `;
}

function renderPlaylists(){
  return `
  <div class="section-head"><h2>Listelerim</h2><span class="count mono">${playlists.length} liste</span></div>
  <div class="pl-grid">
    <button class="pl-card pl-new-card" id="btnNewPlaylist">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      Yeni Liste
    </button>
    ${playlists.slice().sort((a,b)=>b.createdAt-a.createdAt).map(pl=>`
      <button class="pl-card" data-playlist="${pl.id}">
        ${playlistCoverStack(pl)}
        <div class="pl-name">${escapeHtml(pl.name)}</div>
        <div class="pl-meta mono">${pl.trackIds.length} parça · ${fmtDurationLong(playlistDurationSec(pl))}</div>
      </button>
    `).join('')}
  </div>`;
}
function renderPlaylistDetail(){
  const pl=getPlaylist(currentPlaylistId);
  if(!pl){ currentTab='playlists'; return renderPlaylists(); }
  const plTracks = pl.trackIds.map(id=>getTrack(id)).filter(Boolean);
  return `
  <div class="pl-header">
    <div class="back" id="btnBackToPlaylists">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>
      Listelerim
    </div>
    ${playlistCoverStack(pl).replace('pl-stack','pl-stack pl-hero-cover')}
    <div class="pl-title-big">${escapeHtml(pl.name)}</div>
    <div class="pl-stats mono">${plTracks.length} parça · ${fmtDurationLong(playlistDurationSec(pl))}</div>
    <div class="pl-actions">
      <button class="btn btn-gold" id="btnPlayPlaylist">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Çal
      </button>
      <button class="btn btn-ghost" id="btnAddToThisPlaylist">Parça Ekle</button>
      <button class="btn btn-ghost" id="btnDeletePlaylist">Sil</button>
    </div>
  </div>
  ${plTracks.length===0 ? `
    <div class="empty">
      <div class="glyph">☰</div>
      <b>Liste boş</b>
      <p>"Parça Ekle" ile kütüphanenden şarkı seç.</p>
    </div>` : `<div class="track-list">${plTracks.map(t=>renderTrackRow(t)).join('')}</div>`}
  `;
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s??''; return d.innerHTML; }

/* ============================================================
   OLAY BAĞLAMA
============================================================ */
function bindViewEvents(){
  document.querySelectorAll('.track-row').forEach(row=>{
    row.addEventListener('click', e=>{
      if(wasLongPress()) return;
      if(e.target.closest('[data-heart]')) return;
      const id=row.dataset.id;
      const ids=[...row.parentElement.querySelectorAll('.track-row')].map(r=>r.dataset.id);
      playFromQueue(ids, ids.indexOf(id));
    });
    attachLongPress(row, (x,y)=>{
      const id=row.dataset.id;
      openContextMenu(x, y, [
        {label:'Düzenle', onSelect:()=>{
          const t=getTrack(id);
          if(t) openTrackEditSheet(t, false);
        }},
        {label:'Şarkı Bilgileri', onSelect:()=> openTrackSheet(id)},
        {label:'Çalma Listesine Ekle'},
        {label:'Çoklu Seçim'},
        {label:'Şarkıyı Sil'},
      ]);
    });
  });
  document.querySelectorAll('[data-heart]').forEach(btn=>{
    btn.addEventListener('click', async e=>{
      e.stopPropagation();
      const id=btn.dataset.heart;
      const t=getTrack(id); t.favorite=!t.favorite;
      await dbPut('tracks', t);
      render();
    });
  });
  document.querySelectorAll('[data-playlist]').forEach(card=>{
    card.addEventListener('click', ()=>{
      currentPlaylistId=card.dataset.playlist;
      currentTab='playlistDetail';
      render();
    });
  });
  const btnNew=document.getElementById('btnNewPlaylist');
  if(btnNew) btnNew.addEventListener('click', openNewPlaylistSheet);
  const btnBack=document.getElementById('btnBackToPlaylists');
  if(btnBack) btnBack.addEventListener('click', ()=>{ currentTab='playlists'; render(); });
  const btnPlayPl=document.getElementById('btnPlayPlaylist');
  if(btnPlayPl) btnPlayPl.addEventListener('click', ()=>{
    const pl=getPlaylist(currentPlaylistId);
    if(pl.trackIds.length) playFromQueue(pl.trackIds, 0);
  });
  const btnAddToThis=document.getElementById('btnAddToThisPlaylist');
  if(btnAddToThis) btnAddToThis.addEventListener('click', ()=>openAddTracksToPlaylistSheet(currentPlaylistId));
  const btnDelPl=document.getElementById('btnDeletePlaylist');
  if(btnDelPl) btnDelPl.addEventListener('click', async ()=>{
    if(!confirm('Bu listeyi silmek istediğine emin misin?')) return;
    await dbDelete('playlists', currentPlaylistId);
    playlists=playlists.filter(p=>p.id!==currentPlaylistId);
    currentTab='playlists'; render(); toast('Liste silindi');
  });
}

document.querySelectorAll('.tab').forEach(tabBtn=>{
  tabBtn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    tabBtn.classList.add('active');
    currentTab=tabBtn.dataset.tab;
    render();
  });
});

/* ============================================================
   SHEET (MODAL) SİSTEMİ
============================================================ */
const overlay=document.getElementById('overlay');
const sheetEl=document.getElementById('sheet');
function openSheet(html, opts={}){
  sheetEl.className = 'sheet' + (opts.full ? ' sheet-full' : '');
  sheetEl.style.transform='';
  sheetEl.innerHTML = `<div class="sheet-grip"></div><button class="sheet-close" id="sheetCloseBtn" aria-label="Kapat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` + html;
  overlay.classList.add('show');
  document.getElementById('sheetCloseBtn').addEventListener('click', closeSheet);
  enableSheetSwipeClose();
}
function enableSheetSwipeClose(){
  const grip=sheetEl.querySelector('.sheet-grip');
  if(!grip) return;
  let startY=0, dragging=false;
  grip.addEventListener('touchstart', e=>{
    dragging=true; startY=e.touches[0].clientY; sheetEl.style.transition='none';
  }, {passive:true});
  grip.addEventListener('touchmove', e=>{
    if(!dragging) return;
    const delta=e.touches[0].clientY-startY;
    if(delta>0) sheetEl.style.transform=`translateY(${delta}px)`;
  }, {passive:true});
  grip.addEventListener('touchend', e=>{
    if(!dragging) return;
    dragging=false;
    sheetEl.style.transition='';
    const delta=e.changedTouches[0].clientY-startY;
    sheetEl.style.transform='';
    if(delta>90) closeSheet();
  });
}
function closeSheet(){ overlay.classList.remove('show'); }
overlay.addEventListener('click', e=>{ if(e.target===overlay) closeSheet(); });


function openTrackEditSheet(draft, isNew){
  pendingTrack=draft;
  const coverU = draft.coverBlob ? URL.createObjectURL(draft.coverBlob) : null;
  openSheet(`
    <h3>${isNew?'Parça Ekle':'Parçayı Düzenle'}</h3>
    <div class="sheet-scroll">
      <div class="cover-picker" id="coverPickerBtn">
        <img id="coverPreviewImg" src="${coverU||''}" style="display:${coverU?'block':'none'}">
        ${coverU?'':`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg><span>Görsel Ekle</span>`}
      </div>
      <div class="field"><label>İsim</label><input type="text" id="fTitle" value="${escapeHtml(draft.title)}"></div>
      <div class="field"><label>Sanatçı</label><input type="text" id="fArtist" value="${escapeHtml(draft.artist)}"></div>
      <div class="field"><label>Albüm</label><input type="text" id="fAlbum" value="${escapeHtml(draft.album)}"></div>
      <div class="field"><label>Açıklama</label><div class="ta-wrap"><textarea id="fDesc" maxlength="75" rows="5" placeholder="Henüz açıklama eklenmedi.">${escapeHtml(draft.description)}</textarea><span class="ta-count" id="fDescCount">0/75</span></div></div>
      <div class="field"><label>Şarkı Sözleri</label><div class="ta-wrap"><textarea id="fLyrics" maxlength="1000" rows="20" placeholder="Henüz şarkı sözü eklenmedi.">${escapeHtml(draft.lyrics)}</textarea><span class="ta-count" id="fLyricsCount">0/1000</span></div></div>
    </div>
    <div class="sheet-footer">
      <div class="scroll-fade"></div>
      <div class="sheet-actions" style="margin-top:0;">
        <button class="btn btn-ghost" id="btnCancelTrack" style="flex:1;">Vazgeç</button>
        <button class="btn btn-gold" id="btnSaveTrack" style="flex:2;">Kaydet</button>
      </div>
      ${!isNew?`<button class="btn btn-wine btn-block" id="btnDeleteTrack" style="margin-top:10px;">Parçayı Sil</button>`:''}
    </div>
  `);
  function wireGrowingTextarea(ta, counter, max){
    let mirror=document.querySelector(`[data-caret-mirror="${ta.id}"]`);
    let textNode, marker;
    if(mirror){
      textNode=mirror.firstChild; marker=mirror.lastChild;
    } else {
      mirror=document.createElement('div');
      mirror.dataset.caretMirror=ta.id;
      mirror.style.position='absolute'; mirror.style.visibility='hidden';
      mirror.style.top='0'; mirror.style.left='-9999px';
      mirror.style.whiteSpace='pre-wrap'; mirror.style.wordWrap='break-word';
      mirror.style.boxSizing='border-box';
      textNode=document.createTextNode('');
      marker=document.createElement('span');
      marker.textContent='.';
      mirror.appendChild(textNode);
      mirror.appendChild(marker);
      document.body.appendChild(mirror);
    }
    // Font/padding/border bu oturum boyunca sabit -- her tuş vuruşunda değil,
    // yalnızca sheet açıldığında bir kez kopyalanır.
    const cs=getComputedStyle(ta);
    ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight',
     'paddingTop','paddingRight','paddingBottom','paddingLeft',
     'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'
    ].forEach(p=>{ mirror.style[p]=cs[p]; });
    function caretOffsetTop(){
      mirror.style.width=ta.getBoundingClientRect().width+'px';
      textNode.data=ta.value.substring(0, ta.selectionStart);
      return marker.offsetTop;
    }
    function followCaret(){
      const scroller=ta.closest('.sheet-scroll');
      if(!scroller) return;
      const taRect=ta.getBoundingClientRect();
      const scRect=scroller.getBoundingClientRect();
      const lineH=parseFloat(getComputedStyle(ta).lineHeight)||20;
      const caretY=taRect.top+caretOffsetTop();
      if(caretY < scRect.top){
        scroller.scrollTop -= (scRect.top-caretY)+12;
      } else if(caretY+lineH > scRect.bottom){
        scroller.scrollTop += (caretY+lineH-scRect.bottom)+12;
      }
    }
    const resize=()=>{
      ta.style.height='auto';
      ta.style.height=ta.scrollHeight+'px';
      counter.textContent=ta.value.length+'/'+max;
    };
    ta.addEventListener('input', ()=>{ resize(); followCaret(); });
    resize(); // İlk açılışta sadece boyut/sayaç ayarlanır -- scroll konumuna hiç dokunulmaz
  }
  wireGrowingTextarea(document.getElementById('fDesc'), document.getElementById('fDescCount'), 75);
  wireGrowingTextarea(document.getElementById('fLyrics'), document.getElementById('fLyricsCount'), 1000);
  document.getElementById('coverPickerBtn').addEventListener('click', ()=>{
    document.getElementById('fileCover').value='';
    document.getElementById('fileCover').click();
  });
  document.getElementById('btnCancelTrack').addEventListener('click', ()=>{ pendingTrack=null; closeSheet(); });
  document.getElementById('btnSaveTrack').addEventListener('click', async ()=>{
    draft.title=document.getElementById('fTitle').value.trim()||'İsimsiz Parça';
    draft.artist=document.getElementById('fArtist').value.trim();
    draft.album=document.getElementById('fAlbum').value.trim();
    draft.description=document.getElementById('fDesc').value;
    draft.lyrics=document.getElementById('fLyrics').value;
    await dbPut('tracks', draft);
    const idx=tracks.findIndex(t=>t.id===draft.id);
    if(idx>=0) tracks[idx]=draft; else tracks.push(draft);
    delete currentObjectUrls.covers[draft.id];
    pendingTrack=null;
    closeSheet();
    render();
    toast(isNew?'Parça istasyona eklendi':'Değişiklikler kaydedildi');
  });
  const delBtn=document.getElementById('btnDeleteTrack');
  if(delBtn) delBtn.addEventListener('click', async ()=>{
    if(!confirm('Bu parçayı istasyondan silmek istediğine emin misin?')) return;
    await dbDelete('tracks', draft.id);
    tracks=tracks.filter(t=>t.id!==draft.id);
    playlists.forEach(pl=>{ pl.trackIds=pl.trackIds.filter(id=>id!==draft.id); });
    for(const pl of playlists) await dbPut('playlists', pl);
    closeSheet(); render();
    toast('Parça silindi');
  });
}

function openTrackSheet(id){
  const t=getTrack(id);
  if(!t) return;
  const cu=coverUrl(t);
  document.getElementById('infoScroll').innerHTML = `
    <div style="display:flex; gap:14px; align-items:center; margin-bottom:24px;">
      <div class="tr-cover" style="width:64px;height:64px;">${cu?`<img src="${cu}">`:svgNote}</div>
      <div style="min-width:0;">
        <div class="display" style="font-size:18px; font-weight:600;">${escapeHtml(t.title)}</div>
        <div style="font-size:13px; color:var(--text-mute);">${escapeHtml(t.artist||'Bilinmeyen Sanatçı')}${t.album?' · '+escapeHtml(t.album):''}</div>
      </div>
    </div>
    <div style="font-size:11.5px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:.6px; margin-bottom:6px;">Açıklama</div>
    <div class="lyrics-view" style="margin-bottom:22px;">${t.description?escapeHtml(t.description):'<span style="color:var(--text-mute)">Açıklama eklenmemiş.</span>'}</div>
    <div style="font-size:11.5px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:.6px; margin-bottom:6px;">Şarkı Sözleri</div>
    <div class="lyrics-view">${t.lyrics?escapeHtml(t.lyrics):'<span style="color:var(--text-mute)">Söz eklenmemiş.</span>'}</div>
  `;
  const reveal=()=>{
    document.getElementById('infoScreen').classList.add('show');
    history.pushState({infoScreen:true}, '');
  };
  if(history.state && history.state.ctxMenu){
    // Context menü kendi kapanış navigasyonunu (history.back()) zaten
    // kuyruğa aldı ama henüz sonuçlanmadı. O navigasyonun kendisi olan
    // popstate'i bekleyip ondan SONRA açıyoruz; aksi hâlde bu ekran
    // context'in gecikmeli temizliğiyle aynı ana denk gelip anında kapanırdı.
    window.addEventListener('popstate', reveal, {once:true});
  } else {
    reveal();
  }
}
function closeTrackInfoScreen(fromPopstate){
  const el=document.getElementById('infoScreen');
  if(!el.classList.contains('show')) return;
  el.classList.remove('show');
  if(!fromPopstate) history.back();
}
document.getElementById('infoCloseBtn').addEventListener('click', ()=>closeTrackInfoScreen());
window.addEventListener('popstate', ()=>{
  if(document.getElementById('infoScreen').classList.contains('show')) closeTrackInfoScreen(true);
});


/* ============================================================
   BAŞLANGIÇ
============================================================ */
document.getElementById('fabAdd').addEventListener('click', openAddMenuSheet);
// Profil butonu şimdilik dokunulabilir ama işlevsiz — hesap sistemi eklenince buraya bağlanacak

(async function init(){
  await openDB();
  tracks = await dbGetAll('tracks');
  playlists = await dbGetAll('playlists');
  render();
})();

if('serviceWorker' in navigator && location.protocol!=='file:'){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
