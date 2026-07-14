/* ============================================================
   PLAYLIST — liste oluşturma, süre hesaplama, parça ekleme
   Bu bölüm ne yapıyor? Bir listenin toplam süresini/kapak
   mozaiğini hesaplar; yeni liste oluşturma, bir parçayı listelere
   ekleme ve bir listeye kütüphaneden toplu parça ekleme
   pencerelerini yönetir.
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

/* ---- Bir parçayı listelere ekleme (çoklu seçim) ---- */
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
    <div>${playlists.map(pl=>`
      <label class="pl-pick-row">
        <input type="checkbox" data-pl="${pl.id}" ${pl.trackIds.includes(trackId)?'checked':''}>
        <span class="plr-name">${escapeHtml(pl.name)}</span>
        <span class="plr-meta mono">${pl.trackIds.length} parça</span>
      </label>
    `).join('')}</div>
    <button class="btn btn-gold btn-block" id="btnDoneChoose" style="margin-top:16px;">Tamam</button>
  `);
  document.getElementById('btnDoneChoose').addEventListener('click', async ()=>{
    const boxes=document.querySelectorAll('[data-pl]');
    for(const box of boxes){
      const pl=getPlaylist(box.dataset.pl);
      const has=pl.trackIds.includes(trackId);
      if(box.checked && !has) pl.trackIds.push(trackId);
      if(!box.checked && has) pl.trackIds=pl.trackIds.filter(id=>id!==trackId);
      await dbPut('playlists', pl);
    }
    closeSheet(); render(); toast('Listeler güncellendi');
  });
}

/* ---- Belirli bir listeye toplu parça ekleme (kütüphaneden çoklu seçim) ---- */
function openAddTracksToPlaylistSheet(playlistId){
  const pl=getPlaylist(playlistId);
  if(tracks.length===0){ toast('Önce kütüphanene parça eklemelisin'); return; }
  openSheet(`
    <h3>${escapeHtml(pl.name)} — Parça Ekle</h3>
    <div>${tracks.slice().sort((a,b)=>b.addedAt-a.addedAt).map(t=>`
      <label class="pl-pick-row">
        <input type="checkbox" data-tid="${t.id}" ${pl.trackIds.includes(t.id)?'checked':''}>
        <span class="plr-name">${escapeHtml(t.title)}</span>
        <span class="plr-meta mono">${fmtTime(t.duration)}</span>
      </label>
    `).join('')}</div>
    <button class="btn btn-gold btn-block" id="btnDoneAddTracks" style="margin-top:16px;">Tamam</button>
  `);
  document.getElementById('btnDoneAddTracks').addEventListener('click', async ()=>{
    const boxes=document.querySelectorAll('[data-tid]');
    boxes.forEach(box=>{
      const has=pl.trackIds.includes(box.dataset.tid);
      if(box.checked && !has) pl.trackIds.push(box.dataset.tid);
      if(!box.checked && has) pl.trackIds=pl.trackIds.filter(id=>id!==box.dataset.tid);
    });
    await dbPut('playlists', pl);
    closeSheet(); render(); toast('Liste güncellendi');
  });
}

