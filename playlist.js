/* ============================================================
   PLAYLIST — liste oluşturma, süre hesaplama, parça ekleme
   Bu bölüm ne yapıyor? Bir listenin toplam süresini/kapak
   mozaiğini hesaplar; yeni liste oluşturma penceresini yönetir.
   Ayrıca playlist'e parça ekleme için TEK bir ortak akış sağlar:
   iki farklı giriş noktası (context menüden liste seçimi, playlist
   içinden şarkı seçimi) farklı ilk ekranla başlar ama aynı
   duplicate kontrolü + inceleme ekranı + kaydetme motorunda
   birleşir (bkz. addPairsToPlaylists).
   Hangi sistemlerle bağlantılı? database.js (dbPut), ui.js
   (render, playlists[], tracks[], closeSheet/openSheet, toast).
   Dikkat: playlistDurationSec ve playlistCoverStack render.js
   tarafında (renderPlaylists/renderPlaylistDetail) doğrudan
   çağrılıyor, imzalarını değiştirme.
============================================================ */
function playlistDurationSec(pl){
  return pl.trackIds.reduce((sum,id)=>{ const t=getTrack(id); return sum + (t?(t.duration||0):0); },0);
}
function playlistCoverStack(pl){
  const covers = pl.trackIds.map(id=>getTrack(id)).filter(t=>t&&t.coverBlob).slice(0,4);
  if(covers.length===0) return `<div class="pl-stack empty-stack">${svgNote}</div>`;
  return `<div class="pl-stack">${covers.map(t=>`<img src="${coverUrl(t)}">`).join('')}</div>`;
}

/* ---- Yeni liste oluşturma ---- */
function openNewPlaylistSheet(){
  openSheet(`
    <h3>Yeni Liste</h3>
    <div class="field"><label>Liste Adı</label><input type="text" id="fPlName" placeholder="ör. Gece Rotası"></div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" id="cancelPl" style="flex:1;">Vazgeç</button>
      <button class="btn btn-gold" id="createPl" style="flex:2;">Oluştur</button>
    </div>
  `);
  document.getElementById('fPlName').focus();
  document.getElementById('cancelPl').addEventListener('click', closeSheet);
  document.getElementById('createPl').addEventListener('click', async ()=>{
    const name=document.getElementById('fPlName').value.trim();
    if(!name){ toast('Bir isim yazmalısın'); return; }
    const pl={ id:uid(), name, trackIds:[], createdAt:Date.now() };
    await dbPut('playlists', pl);
    playlists.push(pl);
    closeSheet();
    currentPlaylistId=pl.id; currentTab='playlistDetail';
    render();
    toast('Liste oluşturuldu');
  });
}

/* Context menüden "Çalma Listesine Ekle": önce hedef liste(ler) seçtirir.
   Buradan sonrasını, playlist içindeki "Parça Ekle" ile paylaşılan ortak
   motor (addPairsToPlaylists) devralır. */
function openChoosePlaylistsSheet(trackId){
  if(playlists.length===0){
    openSheet(`
      <h3>Listeye Ekle</h3>
      <div class="empty" style="margin:0 0 16px;"><b>Henüz liste yok</b><p>Önce bir liste oluşturman gerekiyor.</p></div>
      <button class="btn btn-gold btn-block" id="goCreatePl">Yeni Liste Oluştur</button>
    `);
    document.getElementById('goCreatePl').addEventListener('click', openNewPlaylistSheet);
    return;
  }
  openSheet(`
    <h3>Listeye Ekle</h3>
    <div class="sheet-scroll">${playlists.map(pl=>`
      <label class="pl-pick-row">
        <input type="checkbox" data-pl="${pl.id}">
        <span class="plr-name">${escapeHtml(pl.name)}</span>
        <span class="plr-meta mono">${pl.trackIds.length} parça</span>
      </label>
    `).join('')}</div>
    <div class="sheet-footer">
      <div class="scroll-fade"></div>
      <div class="sheet-actions" style="margin-top:0;">
        <button class="btn btn-ghost" id="btnChooseCancel" style="flex:1;">Vazgeç</button>
        <button class="btn btn-gold" id="btnChooseNext" style="flex:2;">Devam Et</button>
      </div>
    </div>
  `, {full:true});
  document.getElementById('btnChooseCancel').addEventListener('click', closeSheet);
  document.getElementById('btnChooseNext').addEventListener('click', ()=>{
    const selected=[...document.querySelectorAll('[data-pl]')].filter(cb=>cb.checked).map(cb=>cb.dataset.pl);
    if(selected.length===0){ toast('En az bir liste seçmelisin'); return; }
    addPairsToPlaylists(selected.map(pid=>({trackId, playlistId:pid})), 'byTrack');
  });
}

/* Playlist içinden "Parça Ekle": önce hangi şarkıların ekleneceğini
   seçtirir. Aynı ortak motoru kullanır. */
function openAddTracksToPlaylistSheet(playlistId){
  if(tracks.length===0){ toast('Önce kütüphanene parça eklemelisin'); return; }
  const pl=getPlaylist(playlistId);
  openSheet(`
    <h3>${escapeHtml(pl.name)} — Parça Ekle</h3>
    <div class="sheet-scroll">${tracks.slice().sort((a,b)=>b.addedAt-a.addedAt).map(t=>`
      <label class="pl-pick-row">
        <input type="checkbox" data-tid="${t.id}">
        <span class="plr-name">${escapeHtml(t.title)}</span>
        <span class="plr-meta mono">${fmtTime(t.duration)}</span>
      </label>
    `).join('')}</div>
    <div class="sheet-footer">
      <div class="scroll-fade"></div>
      <div class="sheet-actions" style="margin-top:0;">
        <button class="btn btn-ghost" id="btnPickCancel" style="flex:1;">Vazgeç</button>
        <button class="btn btn-gold" id="btnPickNext" style="flex:2;">Devam Et</button>
      </div>
    </div>
  `, {full:true});
  document.getElementById('btnPickCancel').addEventListener('click', closeSheet);
  document.getElementById('btnPickNext').addEventListener('click', ()=>{
    const selected=[...document.querySelectorAll('[data-tid]')].filter(cb=>cb.checked).map(cb=>cb.dataset.tid);
    if(selected.length===0){ toast('En az bir şarkı seçmelisin'); return; }
    addPairsToPlaylists(selected.map(tid=>({trackId:tid, playlistId})), 'byPlaylist');
  });
}

/* ============================================================
   ORTAK EKLEME MOTORU
   Her iki giriş noktası da (context'ten liste seçimi, playlist
   içinden şarkı seçimi) burada birleşir. Aynı engine, farklı
   başlangıç ekranı — paralel bir ikinci sistem yok.
   pairs: [{trackId, playlistId}, ...]
   mode: 'byPlaylist' (playlist sabit, inceleme ekranında satırlar
         parça bilgisi gösterir) veya 'byTrack' (parça sabit,
         satırlar liste bilgisi gösterir) — yalnızca duplicate
         inceleme ekranının GÖRÜNÜMÜNÜ belirler, veri/kaydetme
         mantığını etkilemez.
============================================================ */
function addPairsToPlaylists(pairs, mode){
  const newPairs=[], dupPairs=[];
  pairs.forEach(p=>{
    const pl=getPlaylist(p.playlistId);
    if(pl && pl.trackIds.includes(p.trackId)) dupPairs.push(p);
    else newPairs.push(p);
  });
  if(dupPairs.length===0) finalizeAddPairs(newPairs, []);
  else openDuplicateReviewSheet(newPairs, dupPairs, mode);
}

async function finalizeAddPairs(newPairs, reAddPairs){
  const touched=new Map();
  [...newPairs, ...reAddPairs].forEach(p=>{
    const pl=getPlaylist(p.playlistId);
    if(!pl) return;
    pl.trackIds.push(p.trackId);
    touched.set(pl.id, pl);
  });
  for(const pl of touched.values()) await dbPut('playlists', pl);
  closeSheet(); render();
  toast(newPairs.length+reAddPairs.length>0 ? 'Liste güncellendi' : 'Hiçbir şey eklenmedi');
}

function openDuplicateReviewSheet(newPairs, dupPairs, mode){
  const first=dupPairs[0];
  const firstCount = getPlaylist(first.playlistId) ? getPlaylist(first.playlistId).trackIds.filter(id=>id===first.trackId).length : 0;
  const warnText = mode==='byPlaylist'
    ? `Seçtiğin şarkılardan bazıları "${escapeHtml(getPlaylist(first.playlistId).name)}" listesinde zaten var. İstersen tekrar ekleyebilir, istersen tekrar eklenmesini engelleyebilirsin.`
    : `Seçtiğin "${escapeHtml(getTrack(first.trackId).title)}" parçası "${escapeHtml(getPlaylist(first.playlistId).name)}" çalma listesinde zaten mevcut (${firstCount} adet). İstersen tekrar ekleyebilir, istersen yeniden eklenmesini engelleyebilirsin.`;

  const rows = dupPairs.map((p,i)=>{
    const pl=getPlaylist(p.playlistId);
    const count = pl ? pl.trackIds.filter(id=>id===p.trackId).length : 0;
    if(mode==='byPlaylist'){
      const t=getTrack(p.trackId);
      const cu=t?coverUrl(t):null;
      return `
      <label class="pl-pick-row">
        <input type="checkbox" data-dup-idx="${i}" checked>
        <div class="tr-cover" style="width:38px;height:38px;">${cu?`<img src="${cu}">`:svgNote}</div>
        <div style="min-width:0; flex:1;">
          <div class="plr-name">${t?escapeHtml(t.title):'—'}</div>
          <div style="font-size:11px; color:var(--text-mute);">${t?escapeHtml(t.artist||'Bilinmeyen Sanatçı'):''}</div>
        </div>
        <span class="plr-meta mono">${count}x</span>
      </label>`;
    }
    const t=getTrack(p.trackId);
    return `
    <label class="pl-pick-row">
      <input type="checkbox" data-dup-idx="${i}" checked>
      <div style="min-width:0; flex:1;">
        <div class="plr-name">${t?escapeHtml(t.title):'—'}</div>
        <div style="font-size:11px; color:var(--text-mute);">${pl?escapeHtml(pl.name):'—'}</div>
      </div>
      <span class="plr-meta">${count} adet</span>
    </label>`;
  }).join('');

  openSheet(`
    <h3>Zaten Listede</h3>
    <div class="sheet-info">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7.5h.01M11 11h1.5v6"/></svg>
      <span>${warnText}</span>
    </div>
    <div class="sheet-actions" style="margin-top:0; margin-bottom:14px;">
      <button class="btn btn-ghost" id="btnDupSelectAll" style="flex:1;">Hepsini Seç</button>
      <button class="btn btn-ghost" id="btnDupSelectNone" style="flex:1;">Seçimi Kaldır</button>
    </div>
    <div class="sheet-scroll">${rows}</div>
    <div class="sheet-footer">
      <div class="scroll-fade"></div>
      <div class="sheet-actions" style="margin-top:0;">
        <button class="btn btn-ghost" id="btnDupCancel" style="flex:1;">Vazgeç</button>
        <button class="btn btn-gold" id="btnDupAddNewOnly" style="flex:2;">Sadece Yeni Olanları Ekle</button>
      </div>
      <button class="btn btn-wine btn-block" id="btnDupReAdd" style="margin-top:10px;">Seçilenleri Tekrar Ekle</button>
    </div>
  `, {full:true});

  document.getElementById('btnDupSelectAll').addEventListener('click', ()=>{
    document.querySelectorAll('[data-dup-idx]').forEach(cb=>cb.checked=true);
  });
  document.getElementById('btnDupSelectNone').addEventListener('click', ()=>{
    document.querySelectorAll('[data-dup-idx]').forEach(cb=>cb.checked=false);
  });
  document.getElementById('btnDupCancel').addEventListener('click', closeSheet);
  document.getElementById('btnDupAddNewOnly').addEventListener('click', ()=> finalizeAddPairs(newPairs, []));
  document.getElementById('btnDupReAdd').addEventListener('click', ()=>{
    const chosen=[...document.querySelectorAll('[data-dup-idx]')].filter(cb=>cb.checked).map(cb=>dupPairs[+cb.dataset.dupIdx]);
    finalizeAddPairs(newPairs, chosen);
  });
}

