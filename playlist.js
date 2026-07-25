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

  async function finalize(toRemove, toAddNew, extra){
    pl.trackIds=pl.trackIds.filter(id=>!toRemove.includes(id));
    pl.trackIds.push(...toAddNew);
    if(extra) pl.trackIds.push(...extra);
    await dbPut('playlists', pl);
    closeSheet(); render(); toast('Liste güncellendi');
  }

  function openDuplicateReviewSheet(dupIds, toRemove, toAddNew){
    openSheet(`
      <h3>Zaten Listede</h3>
      <div class="sheet-info">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7.5h.01M11 11h1.5v6"/></svg>
        <span>Seçtiğin şarkılardan bazıları "${escapeHtml(pl.name)}" listesinde zaten var. İstersen tekrar ekleyebilirsin.</span>
      </div>
      <div class="sheet-actions" style="margin-top:0; margin-bottom:14px;">
        <button class="btn btn-ghost" id="btnDupSelectAll" style="flex:1;">Hepsini Seç</button>
        <button class="btn btn-ghost" id="btnDupSelectNone" style="flex:1;">Seçimi Kaldır</button>
      </div>
      <div class="sheet-scroll">${dupIds.map(id=>{
        const t=getTrack(id); if(!t) return '';
        const cu=coverUrl(t);
        return `
        <label class="pl-pick-row">
          <input type="checkbox" data-dup="${t.id}" checked>
          <div class="tr-cover" style="width:38px;height:38px;">${cu?`<img src="${cu}">`:svgNote}</div>
          <div style="min-width:0; flex:1;">
            <div class="plr-name">${escapeHtml(t.title)}</div>
            <div style="font-size:11px; color:var(--text-mute);">${escapeHtml(t.artist||'Bilinmeyen Sanatçı')}</div>
          </div>
        </label>`;
      }).join('')}</div>
      <div class="sheet-footer">
        <div class="scroll-fade"></div>
        <div class="sheet-actions" style="margin-top:0;">
          <button class="btn btn-ghost" id="btnDupCancel" style="flex:1;">Vazgeç</button>
          <button class="btn btn-gold" id="btnDupAddNewOnly" style="flex:2;">Sadece Listede Olmayanları Ekle</button>
        </div>
        <button class="btn btn-wine btn-block" id="btnDupReAdd" style="margin-top:10px;">Seçilenleri Tekrar Ekle</button>
      </div>
    `);
    document.getElementById('btnDupSelectAll').addEventListener('click', ()=>{
      document.querySelectorAll('[data-dup]').forEach(cb=>cb.checked=true);
    });
    document.getElementById('btnDupSelectNone').addEventListener('click', ()=>{
      document.querySelectorAll('[data-dup]').forEach(cb=>cb.checked=false);
    });
    document.getElementById('btnDupCancel').addEventListener('click', closeSheet);
    document.getElementById('btnDupAddNewOnly').addEventListener('click', ()=> finalize(toRemove, toAddNew));
    document.getElementById('btnDupReAdd').addEventListener('click', ()=>{
      const reAdd=[...document.querySelectorAll('[data-dup]')].filter(cb=>cb.checked).map(cb=>cb.dataset.dup);
      finalize(toRemove, toAddNew, reAdd);
    });
  }

  document.getElementById('btnDoneAddTracks').addEventListener('click', ()=>{
    const boxes=[...document.querySelectorAll('[data-tid]')];
    const toRemove=[], toAddNew=[], duplicates=[];
    boxes.forEach(box=>{
      const tid=box.dataset.tid;
      const has=pl.trackIds.includes(tid);
      if(box.checked && !has) toAddNew.push(tid);
      else if(box.checked && has) duplicates.push(tid);
      else if(!box.checked && has) toRemove.push(tid);
    });
    if(duplicates.length===0) finalize(toRemove, toAddNew);
    else openDuplicateReviewSheet(duplicates, toRemove, toAddNew);
  });
}

