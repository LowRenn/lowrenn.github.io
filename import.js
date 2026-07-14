/* ============================================================
   İÇE AKTARMA — tekli ve toplu müzik ekleme akışı
   Bu bölüm ne yapıyor? Sağ alttaki dosya butonuna basılınca açılan
   menüyü, klasör tarama + çoklu seçim ekranını, 5'li paralel
   yükleme mantığını ve tekli dosya ekleme akışını yönetir.
   Hangi sistemlerle bağlantılı? metadata.js (autoBuildTrack vb.),
   database.js (dbPut), ui.js (render, openTrackEditSheet, toast).
   Dikkat: openAddMenuSheet ve openAddTrackFlow iki farklı noktadan
   (menü + doğrudan) çağrılabilir, ikisini de birlikte test et.
============================================================ */
/* ---- Yeni parça ekleme akışı ---- */
let pendingTrack=null; // eklenmekte olan yeni parça taslağı

function openAddMenuSheet(){
  openSheet(`
    <h3>Müzik Ekle</h3>
    <div class="add-menu-grid">
      <button class="add-menu-option" id="optFolderScan">
        <div class="add-menu-icon-wrap">
          <svg viewBox="0 0 48 48" fill="none">
            <defs>
              <linearGradient id="folderGradMenu" x1="6" y1="10" x2="42" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#FBC868"/>
                <stop offset="1" stop-color="#E8A33D"/>
              </linearGradient>
            </defs>
            <path d="M6 15a4 4 0 0 1 4-4h8.5l4 4H38a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V15Z" fill="url(#folderGradMenu)"/>
            <path d="M6 15a4 4 0 0 1 4-4h8.5l4 4H6Z" fill="#FDE0A0" opacity=".55"/>
          </svg>
        </div>
        <div class="add-menu-label">Dosya Tarama</div>
      </button>
      <button class="add-menu-option" id="optSingleSelect">
        <div class="add-menu-icon-wrap note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.3 19V6.5L17.5 5v9.5" fill="none"/>
            <circle cx="6.1" cy="19" r="2.3" fill="currentColor" stroke="none"/>
            <circle cx="15.3" cy="14.5" r="2.3" fill="currentColor" stroke="none"/>
          </svg>
        </div>
        <div class="add-menu-label">Tekli Seçim</div>
      </button>
    </div>
  `);
  document.getElementById('optSingleSelect').addEventListener('click', ()=>{
    closeSheet();
    openAddTrackFlow();
  });
  document.getElementById('optFolderScan').addEventListener('click', ()=>{
    closeSheet();
    document.getElementById('folderPicker').value='';
    document.getElementById('folderPicker').click();
  });
}

function openFolderScanResultsSheet(files){
  openSheet(`
    <h3>${files.length} Müzik Bulundu</h3>
    <div class="sheet-info">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7.5h.01M11 11h1.5v6"/></svg>
      <span>Yalnızca gerçek şarkı/müzik dosyalarını işaretli bırakarak farklı türde dosyaların yanlışlıkla eklenmesini önleyebilirsiniz.</span>
    </div>
    <div class="sheet-actions" style="margin-top:0; margin-bottom:14px;">
      <button class="btn btn-ghost" id="btnSelectAll" style="flex:1;">Tümünü Seç</button>
      <button class="btn btn-ghost" id="btnSelectNone" style="flex:1;">Tümünü Kaldır</button>
    </div>
    <div>${files.map((f,i)=>`
      <label class="pl-pick-row">
        <input type="checkbox" data-scan-idx="${i}" checked>
        <span class="plr-name">${escapeHtml(f.name)}</span>
      </label>
    `).join('')}</div>
    <button class="btn btn-gold btn-block" id="btnImportSelected" style="margin-top:18px;">Seçilenleri Ekle</button>
  `, {full:true});

  document.getElementById('btnSelectAll').addEventListener('click', ()=>{
    document.querySelectorAll('[data-scan-idx]').forEach(cb=>cb.checked=true);
  });
  document.getElementById('btnSelectNone').addEventListener('click', ()=>{
    document.querySelectorAll('[data-scan-idx]').forEach(cb=>cb.checked=false);
  });
  document.getElementById('btnImportSelected').addEventListener('click', async ()=>{
    const boxes=[...document.querySelectorAll('[data-scan-idx]')];
    const selected=boxes.filter(b=>b.checked).map(b=>files[+b.dataset.scanIdx]);
    if(selected.length===0){ toast('Hiç dosya seçilmedi'); return; }
    closeSheet();
    await importFilesBulk(selected);
  });
}

async function importFilesBulk(files){
  const total=files.length;
  const CONCURRENCY=Math.min(5, total);
  let added=0, done=0, idx=0;
  openImportProgressSheet(CONCURRENCY, total);
  async function worker(lane){
    while(idx<files.length){
      const myIdx=idx++;
      const file=files[myIdx];
      const shownName=cleanTrackName(file.name);
      updateImportSlot(lane, shownName, 12);
      try{
        updateImportSlot(lane, shownName, 45);
        const track=await autoBuildTrack(file);
        updateImportSlot(lane, shownName, 85);
        await dbPut('tracks', track);
        tracks.push(track);
        added++;
        updateImportSlot(lane, shownName, 100);
      }catch(err){
        updateImportSlot(lane, shownName, 100);
      }
      done++;
      updateImportOverall(done, total);
    }
  }
  const workers=[];
  for(let l=0;l<CONCURRENCY;l++) workers.push(worker(l));
  await Promise.all(workers);
  render();
  closeSheet();
  toast(`${added} şarkı eklendi`);
}

function openImportProgressSheet(laneCount, total){
  openSheet(`
    <h3>Müzikler Ekleniyor</h3>
    <div class="import-overall" id="importOverall">0 / ${total} tamamlandı</div>
    <div id="importSlots">
      ${Array.from({length:laneCount}).map((_,i)=>`
        <div class="import-slot" id="importSlot${i}">
          <div class="import-slot-icon">${svgNote}</div>
          <div class="import-slot-info">
            <div class="import-slot-name" id="importSlotName${i}">Bekleniyor…</div>
            <div class="import-slot-bar"><div class="import-slot-fill" id="importSlotFill${i}"></div></div>
          </div>
        </div>
      `).join('')}
    </div>
  `);
}
function updateImportSlot(lane, name, pct){
  const nameEl=document.getElementById(`importSlotName${lane}`);
  const fillEl=document.getElementById(`importSlotFill${lane}`);
  if(nameEl) nameEl.textContent=name;
  if(fillEl) fillEl.style.width=pct+'%';
}
function updateImportOverall(done, total){
  const el=document.getElementById('importOverall');
  if(el) el.textContent=`${done} / ${total} tamamlandı`;
}


function openAddTrackFlow(){
  document.getElementById('fileAudio').value='';
  document.getElementById('fileAudio').click();
}
document.getElementById('fileAudio').addEventListener('change', async e=>{
  const file=e.target.files[0];
  if(!file) return;
  toast('Etiketler okunuyor…');
  const draft = {
    id: uid(), title: file.name.replace(/\.[^.]+$/,''), artist:'', album:'', description:'', lyrics:'',
    favorite:false, audioBlob:file, coverBlob:null, duration:0, addedAt:Date.now()
  };
  // süreyi öğren
  await new Promise(res=>{
    const tmp=document.createElement('audio');
    tmp.preload='metadata';
    tmp.src=URL.createObjectURL(file);
    tmp.onloadedmetadata=()=>{ draft.duration=tmp.duration; URL.revokeObjectURL(tmp.src); res(); };
    tmp.onerror=()=>res();
  });
  // ID3 etiketlerini otomatik oku
  try{
    await new Promise(res=>{
      window.jsmediatags.read(file, {
        onSuccess: tag=>{
          const t=tag.tags||{};
          if(t.title) draft.title=t.title;
          if(t.artist) draft.artist=t.artist;
          if(t.album) draft.album=t.album;
          if(t.picture){
            const {data, format} = t.picture;
            const arr=new Uint8Array(data);
            draft.coverBlob = new Blob([arr], {type:format});
          }
          res();
        },
        onError: ()=>res()
      });
    });
  }catch(err){ /* etiket okunamadı, sorun değil */ }
  pendingTrack=draft;
  openTrackEditSheet(draft, true);
});

document.getElementById('fileCover').addEventListener('change', e=>{
  const file=e.target.files[0];
  if(!file || !pendingTrack) return;
  pendingTrack.coverBlob=file;
  const img=document.getElementById('coverPreviewImg');
  if(img){ img.src=URL.createObjectURL(file); img.style.display='block'; }
});

document.getElementById('folderPicker').addEventListener('change', e=>{
  const files=Array.from(e.target.files||[]);
  if(files.length===0) return;
  openFolderScanResultsSheet(files);
});


