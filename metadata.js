/* ============================================================
   METADATA — dosya adı / ID3 etiketi ayrıştırma sistemi
   Bu bölüm ne yapıyor? Ses dosyasının adından ve/veya ID3
   etiketinden sanatçı/başlık/kapak/söz bilgisini otomatik çıkarır
   ('Sanatçı X Sanatçı2 - Başlık' formatı, büyük harf düzeltme,
   #etiket ayıklama, jsmediatags okuma).
   Hangi sistemlerle bağlantılı? import.js (toplu ekleme) burayı
   çağırır. jsmediatags (harici CDN kütüphanesi) burada kullanılır.
   Dikkat: burası çok sayıda regex içerir ve önceki oturumlarda
   birkaç kez hatalı davranış (yanlış sanatçı/başlık ayrımı) tespit
   edilip düzeltildi — değişiklik yapılırken gerçek dosya adlarıyla
   test edilmeli.
============================================================ */
function cleanTrackName(filename){
  let name = filename.replace(/\.[a-z0-9]{2,5}$/i, '');
  name = name.replace(/[\(\[][^\)\]]*[\)\]]/g, ' ');
  const junk = /\b(official\s*(music\s*)?video|official\s*audio|lyrics?\s*video|animation|mv|hd|4k|full\s*video|video\s*klip|klip)\b/gi;
  name = name.replace(junk, ' ');
  name = name.replace(/\s+[-–—]{1,3}\s+/g, ' ');
  name = name.replace(/\s{2,}/g, ' ').trim();
  name = name.replace(/^[-–—\s]+|[-–—\s]+$/g, '');
  return name || filename.replace(/\.[a-z0-9]{2,5}$/i, '');
}

function isValidArtistText(s){
  return !!(s && s.trim() && !/^#\S+$/.test(s.trim()));
}

function parseFilenameMeta(filename){
  let base = filename.replace(/\.[a-z0-9]{2,5}$/i, '');
  base = base.replace(/[\(\[][^\)\]]*[\)\]]/g, ' ');
  const junk = /\b(official\s*(music\s*)?video|official\s*audio|lyrics?\s*video|animation|mv|hd|4k|full\s*video|video\s*klip|klip)\b/gi;
  base = base.replace(junk, ' ').replace(/\s{2,}/g, ' ').trim();

  const extractFeat = t => {
    const m = t.match(/^(.*?)\s+(ft\.?|feat\.?|featuring)\s+(.+)$/i);
    return m ? {main:m[1].trim(), extra:m[3].trim(), connector:m[2]} : {main:t.trim(), extra:'', connector:''};
  };
  const extractX = t => {
    const m = t.match(/^(.*?)\s+(x)\s+(.+)$/i);
    return m ? {main:m[1].trim(), extra:m[3].trim(), connector:m[2]} : {main:t.trim(), extra:'', connector:''};
  };

  const parts = base.split(/\s+[-–—]+\s+/);
  const hasDash = parts.length>=2;
  let artistSide = hasDash ? parts[0].trim() : '';
  let titleSide = hasDash ? parts.slice(1).join(' - ').trim() : base;

  const artists=[];
  let connector='';
  if(artistSide){
    let r = extractFeat(artistSide);
    if(!r.extra) r = extractX(artistSide);
    if(r.extra){ artists.push(r.main, r.extra); artistSide=r.main; connector=r.connector; }
    else artists.push(artistSide);
  } else {
    const r = extractX(base);
    if(r.extra){ artists.push(r.main, r.extra); titleSide=''; connector=r.connector; }
  }

  const tf = extractFeat(titleSide);
  if(tf.extra){ artists.push(tf.extra); titleSide = tf.main; connector=tf.connector; }

  let finalTitle;
  if(artists.length===2 && connector){
    finalTitle = `${artists[0]} X ${artists[1]} - ${(titleSide||base).trim()}`;
  } else {
    finalTitle = cleanTrackName(filename);
  }

  return {
    artist: artists.filter(isValidArtistText).join(', '),
    title: finalTitle
  };
}

function fixTitleCase(title){
  if(title.trim().startsWith('#')) return title;
  return title.split(/(\s+)/).map(tok=>{
    if(tok.startsWith('#')) return tok;
    if(tok.length<=1) return tok;
    const isWordAllUpper = tok === tok.toLocaleUpperCase('tr') && tok !== tok.toLocaleLowerCase('tr') && /\p{L}/u.test(tok);
    if(!isWordAllUpper) return tok;
    const lower = tok.toLocaleLowerCase('tr');
    return lower.charAt(0).toLocaleUpperCase('tr') + lower.slice(1);
  }).join('');
}

function extractHashtags(text){
  const tags = text.match(/#\S+/g) || [];
  if(tags.length===0) return { text, tags: [] };
  const cleaned = text.replace(/#\S+/g, '').replace(/\s{2,}/g, ' ').trim();
  if(!cleaned) return { text, tags: [] }; // tamamı hashtag ise dokunma
  return { text: cleaned, tags };
}

function autoBuildTrack(file){
  return new Promise((resolve)=>{
    const meta = parseFilenameMeta(file.name);
    const draft = {
      id: uid(), title: meta.title || cleanTrackName(file.name), artist: meta.artist, album:'', description:'', lyrics:'',
      favorite:false, audioBlob:file, coverBlob:null, duration:0, addedAt:Date.now()
    };
    let settled=false;
    const finish=()=>{
      if(settled) return; settled=true;
      const h = extractHashtags(draft.title);
      if(h.tags.length){
        draft.title = h.text;
        draft.description = (draft.description ? draft.description+' ' : '') + h.tags.join(' ');
      }
      draft.title = fixTitleCase(draft.title);
      resolve(draft);
    };
    const safetyTimer=setTimeout(finish, 6000);
    const tmp=document.createElement('audio');
    tmp.preload='metadata';
    tmp.src=URL.createObjectURL(file);
    tmp.onloadedmetadata=()=>{
      draft.duration=tmp.duration;
      URL.revokeObjectURL(tmp.src);
      try{
        window.jsmediatags.read(file, {
          onSuccess: tag=>{
            const t=tag.tags||{};
            if(t.title) draft.title=t.title;
            if(t.artist && isValidArtistText(t.artist)) draft.artist=t.artist;
            if(t.album) draft.album=t.album;
            if(t.lyrics){
              if(typeof t.lyrics === 'string') draft.lyrics=t.lyrics;
              else if(t.lyrics.lyrics) draft.lyrics=t.lyrics.lyrics;
            }
            if(t.picture){
              const {data, format}=t.picture;
              draft.coverBlob=new Blob([new Uint8Array(data)], {type:format});
            }
            clearTimeout(safetyTimer);
            finish();
          },
          onError: ()=>{ clearTimeout(safetyTimer); finish(); }
        });
      }catch(e){ clearTimeout(safetyTimer); finish(); }
    };
    tmp.onerror=()=>{ clearTimeout(safetyTimer); finish(); };
  });
}

