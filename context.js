/* ============================================================
   CONTEXT MENÜ SİSTEMİ
   Bu dosya ne yapıyor? Herhangi bir liste satırında (bugün şarkı,
   ileride playlist/albüm/sanatçı/klasör) uzun basmayı algılayıp,
   basılan noktaya yakın açılan, uygulama genelinde tekil (singleton)
   bir context menü sunar. Menüdeki seçeneklerin NE yaptığını bilmez —
   bunu çağıran taraf belirler (bkz. attachLongPress ve openContextMenu
   parametreleri). Bu yüzden herhangi bir liste türüne bağlanabilir.
   Hangi sistemlerle bağlantılı? #app (position:fixed'in referans
   çerçevesi olarak), escapeHtml (ui.js, sadece çağrı anında kullanılır).
   Sheet sisteminden (openSheet/closeSheet) tamamen bağımsızdır; ayrı
   bir overlay katmanı (#ctxBackdrop) ve ayrı bir geri tuşu/history
   mekanizması kullanır.
============================================================ */

const LONG_PRESS_MS = 600;
const LONG_PRESS_MOVE_TOLERANCE = 10;

let ctxOpen = false;
let lastLongPressAt = 0;

const ctxBackdrop = document.getElementById('ctxBackdrop');
const ctxMenuEl = document.getElementById('ctxMenu');

/* ----------------------------------------------------------
   UZUN BASMA ALGILAMA
   Bir satır elemanına takılır. 1.5sn dolup parmak/imleç kalkınca
   onLongPress(x,y) çağrılır. 1.5sn dolmadan bırakılırsa hiçbir şey
   yapılmaz — satırın kendi 'click' listener'ı (varsa) normal
   akışında çalışmaya devam eder. Bu yüzden mevcut tıklama davranışı
   bozulmaz; sadece o davranışın kısa dokunmaya özgü kaldığından emin
   olmak isteyen click handler'lar en başta wasLongPress() kontrolü
   yapmalı (bkz. ui.js bindViewEvents).
---------------------------------------------------------- */
function attachLongPress(row, onLongPress){
  let timer=null, startX=0, startY=0, longPressFired=false, active=false;

  row.addEventListener('pointerdown', e=>{
    if(ctxOpen) return;                              // kural 3: context açıkken yeni long press yok
    if(e.target.closest('[data-heart]')) return;      // kalp butonu kendi tekil davranışını korur
    active=true; longPressFired=false;
    startX=e.clientX; startY=e.clientY;
    timer=setTimeout(()=>{ longPressFired=true; }, LONG_PRESS_MS);
  });

  row.addEventListener('pointermove', e=>{
    if(!active) return;
    if(Math.abs(e.clientX-startX)>LONG_PRESS_MOVE_TOLERANCE || Math.abs(e.clientY-startY)>LONG_PRESS_MOVE_TOLERANCE){
      clearTimeout(timer); active=false;               // scroll/sürükleme — long press iptal
    }
  });

  row.addEventListener('pointerup', ()=>{
    if(!active) return;
    active=false; clearTimeout(timer);
    if(longPressFired){
      lastLongPressAt=Date.now();
      onLongPress(startX, startY);
    }
    // longPressFired false: hiçbir şey yapılmaz, kısa dokunma kendi click'ine bırakılır.
  });

  row.addEventListener('pointercancel', ()=>{ active=false; clearTimeout(timer); });
  row.addEventListener('contextmenu', e=>e.preventDefault()); // tarayıcının kendi context menüsü açılmasın
}

/* Bir click handler'ın en başında çağrılır. Az önceki dokunuş uzun
   basmaya dönüştüyse true döner — çağıran taraf o click'in normal
   işini yapmadan return etmelidir. */
function wasLongPress(){
  return Date.now()-lastLongPressAt < 400;
}

/* ----------------------------------------------------------
   TEKİL (SINGLETON) CONTEXT MENÜ
---------------------------------------------------------- */
function openContextMenu(x, y, options){
  if(ctxOpen) return;                                  // kural 3
  ctxOpen=true;

  ctxMenuEl.innerHTML = options.map((opt,i)=>
    `<button class="ctx-item" data-ctx-idx="${i}">${escapeHtml(opt.label)}</button>`
  ).join('');
  ctxMenuEl.querySelectorAll('.ctx-item').forEach((btn,i)=>{
    btn.addEventListener('click', ()=>{
      closeContextMenu();
      if(options[i].onSelect) options[i].onSelect();
    });
  });

  ctxBackdrop.classList.add('show');
  ctxMenuEl.style.visibility='hidden';
  ctxMenuEl.style.left='0px'; ctxMenuEl.style.top='0px';
  requestAnimationFrame(()=>{
    positionContextMenu(x, y);
    ctxMenuEl.style.visibility='visible';
  });

  history.pushState({ctxMenu:true}, '');
}

function positionContextMenu(x, y){
  const app=document.getElementById('app');
  const appRect=app.getBoundingClientRect();
  const menuRect=ctxMenuEl.getBoundingClientRect();
  const margin=8;

  let left=x-appRect.left;
  let top=y-appRect.top;

  if(left+menuRect.width > appRect.width-margin) left=appRect.width-menuRect.width-margin;
  if(left < margin) left=margin;

  if(top+menuRect.height > appRect.height-margin) top=(y-appRect.top)-menuRect.height; // basılan noktanın üstünde aç
  if(top < margin) top=margin;

  ctxMenuEl.style.left=left+'px';
  ctxMenuEl.style.top=top+'px';
}

function closeContextMenu(fromPopstate){
  if(!ctxOpen) return;
  ctxOpen=false;
  ctxBackdrop.classList.remove('show');
  if(!fromPopstate) history.back();
}

ctxBackdrop.addEventListener('click', e=>{
  if(e.target===ctxBackdrop) closeContextMenu();        // kural 5: boş alana dokunma
});
window.addEventListener('popstate', ()=>{
  if(ctxOpen) closeContextMenu(true);                    // kural 5: Android geri tuşu
});
