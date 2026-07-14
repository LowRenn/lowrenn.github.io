/* ============================================================
   PLAYER — ses çalma motoru
   Bu bölüm ne yapıyor? audioEl (<audio> öğesi) üzerinden şarkı
   çalma/durdurma/sonraki-önceki, alt player bar'ının güncellenmesi
   ve ilerleme çubuğu (scrub) senkronizasyonunu yönetir.
   Hangi sistemlerle bağlantılı? ui.js (tracks, queue, getTrack,
   render, currentTab), database.js (dbPut favori güncellemesi için).
   Dikkat: queue/queueIndex global state'i ui.js'te tanımlı, burada
   sadece okunup güncelleniyor — playFromQueue çağrılmadan bu
   fonksiyonlar anlamlı çalışmaz.
============================================================ */
/* ============================================================
   ÇALAR (PLAYER)
============================================================ */
const audioEl = document.getElementById('audioEl');
function updatePlayerBarVisibility(){
  const bar=document.getElementById('playerBar');
  const app=document.getElementById('app');
  const active = queueIndex>=0 && queue[queueIndex];
  bar.classList.toggle('hidden', !active);
  app.classList.toggle('no-player', !active);
}
function playFromQueue(idList, startIndex){
  queue=idList.slice();
  queueIndex=startIndex;
  loadAndPlayCurrent();
}
function loadAndPlayCurrent(){
  const id=queue[queueIndex];
  const t=getTrack(id);
  if(!t) return;
  if(currentObjectUrls.audio) URL.revokeObjectURL(currentObjectUrls.audio);
  currentObjectUrls.audio = URL.createObjectURL(t.audioBlob);
  audioEl.src = currentObjectUrls.audio;
  audioEl.play().catch(()=>{});
  updatePlayerBarInfo(t);
  updatePlayerBarVisibility();
  render();
}
function updatePlayerBarInfo(t){
  document.getElementById('pbTitle').textContent=t.title;
  document.getElementById('pbArtist').textContent=t.artist||'Bilinmeyen Sanatçı';
  document.getElementById('pbHeart').classList.toggle('active', !!t.favorite);
  const cu=coverUrl(t);
  const img=document.getElementById('pbCoverImg');
  if(cu){ img.src=cu; img.style.display='block'; } else { img.style.display='none'; }
}
document.getElementById('pbPlay').addEventListener('click', ()=>{
  if(!queue[queueIndex]) return;
  if(audioEl.paused) audioEl.play(); else audioEl.pause();
});
document.getElementById('pbNext').addEventListener('click', ()=> stepQueue(1));
document.getElementById('pbPrev').addEventListener('click', ()=>{
  if(audioEl.currentTime>3){ audioEl.currentTime=0; return; }
  stepQueue(-1);
});
function stepQueue(dir){
  if(queue.length===0) return;
  queueIndex = (queueIndex+dir+queue.length)%queue.length;
  loadAndPlayCurrent();
}
audioEl.addEventListener('ended', ()=> stepQueue(1));
audioEl.addEventListener('play', ()=>{
  document.getElementById('pbPlayIcon').innerHTML='<path d="M7 5h3v14H7zm7 0h3v14h-3z"/>';
  document.getElementById('pbDisc').classList.add('spin');
  render();
});
audioEl.addEventListener('pause', ()=>{
  document.getElementById('pbPlayIcon').innerHTML='<path d="M8 5v14l11-7z"/>';
  document.getElementById('pbDisc').classList.remove('spin');
  render();
});
audioEl.addEventListener('timeupdate', ()=>{
  const scrub=document.getElementById('pbScrub');
  if(!scrub.matches(':active')){
    scrub.value = audioEl.duration ? (audioEl.currentTime/audioEl.duration*100) : 0;
  }
  document.getElementById('pbCur').textContent=fmtTime(audioEl.currentTime);
  document.getElementById('pbDur').textContent=fmtTime(audioEl.duration);
});
document.getElementById('pbScrub').addEventListener('input', e=>{
  if(audioEl.duration) audioEl.currentTime = e.target.value/100*audioEl.duration;
});
document.getElementById('pbHeart').addEventListener('click', async ()=>{
  const t=getTrack(queue[queueIndex]);
  if(!t) return;
  t.favorite=!t.favorite;
  await dbPut('tracks', t);
  document.getElementById('pbHeart').classList.toggle('active', t.favorite);
  if(currentTab==='favorites'||currentTab==='library') render();
});
document.getElementById('pbInfo').addEventListener('click', ()=>{
  const id=queue[queueIndex]; if(id) openTrackSheet(id);
});

