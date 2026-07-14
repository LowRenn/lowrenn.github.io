/* ============================================================
   VERİTABANI (IndexedDB) KATMANI
   Bu bölüm ne yapıyor? Tarayıcının yerel veritabanına (IndexedDB)
   bağlanır, 'tracks' ve 'playlists' tablolarını okuma/yazma
   işlemlerini sağlar.
   Hangi sistemlerle bağlantılı? metadata.js, import.js, playlist.js,
   player.js ve ui.js — tüm veri okuma/kaydetme işlemleri buradan geçer.
   Dikkat: tablo isimleri ('tracks','playlists') veya DB_VER değişirse
   eski kullanıcıların verileri kaybolabilir, dikkatli değiştirilmeli.
============================================================ */
/* ---------- IndexedDB katmanı ---------- */
const DB_NAME='istasyonum_db', DB_VER=1;
let db;
function openDB(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e=>{
      const d = e.target.result;
      if(!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks',{keyPath:'id'});
      if(!d.objectStoreNames.contains('playlists')) d.createObjectStore('playlists',{keyPath:'id'});
    };
    req.onsuccess = e=>{ db=e.target.result; res(db); };
    req.onerror = e=> rej(e);
  });
}
function tx(store, mode='readonly'){ return db.transaction(store,mode).objectStore(store); }
function dbGetAll(store){ return new Promise((res)=>{ const r=tx(store).getAll(); r.onsuccess=()=>res(r.result||[]); }); }
function dbPut(store,val){ return new Promise((res)=>{ const r=tx(store,'readwrite').put(val); r.onsuccess=()=>res(); }); }
function dbDelete(store,id){ return new Promise((res)=>{ const r=tx(store,'readwrite').delete(id); r.onsuccess=()=>res(); }); }
