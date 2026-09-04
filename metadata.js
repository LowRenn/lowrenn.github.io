/* ============================================================
   METADATA — dosya adı / ID3 etiketi ayrıştırma sistemi
   Bu bölüm ne yapıyor? Ses dosyasının adından ve/veya ID3
   etiketinden sanatçı/başlık/kapak/söz bilgisini otomatik çıkarır
   ('Sanatçı X Sanatçı2 - Başlık' formatı, büyük harf düzeltme,
   #etiket ayıklama, jsmediatags okuma). Süre okuma (readAudioDuration)
   ve ID3 okuma (readId3Tags→normalizeId3Tags) birbirinden BAĞIMSIZ,
   PARALEL çalışır — biri diğerini bloklamaz. Gerçek ID3 verisi
   bulunduğunda dosya adı tahminini her zaman ezer; fixTitleCase/
   extractHashtags gibi dosya-adı odaklı sezgisel kurallar yalnızca
   başlık dosya adından geldiğinde uygulanır.
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

/* Süre okuma ile ID3 okuma için ortak, bağımsız zaman aşımı. İkisi de
   PARALEL çalıştığı için toplam bekleme bu değerin TOPLAMI değil,
   en kötü ihtimalle bu değerin KENDİSİ kadardır. */
const METADATA_STEP_TIMEOUT_MS = 6000;

/* Bir ID3 alanının kullanılabilir (boş olmayan, gerçek bir metin
   olan) sayılıp sayılmayacağını belirler. parseFilenameMeta'nın
   kendi dosya-adı sezgisel kuralı olan isValidArtistText'ten
   BİLEREK ayrı tutulur — o, "#etiket" gibi dosya-adı ayrıştırma
   artefaktlarını eleyen özel bir kural; ID3'ten gelen gerçek veriye
   uygulanması anlamlı değildir. */
function isUsableText(s){
  return typeof s === 'string' && s.trim().length > 0;
}

/* Ses dosyasının süresini okur. jsmediatags'ten TAMAMEN bağımsızdır —
   biri diğerini beklemez, biri başarısız olsa da diğeri etkilenmez.
   Hiçbir zaman reddetmez (reject); başarısızlık/timeout durumunda 0
   ile çözülür. Object URL, başarı/hata/timeout hangi yoldan gelirse
   gelsin garanti şekilde serbest bırakılır. */
function readAudioDuration(file){
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file);
    const tmp=document.createElement('audio');
    tmp.preload='metadata';
    let settled=false;
    const finish=(value)=>{
      if(settled) return; settled=true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer=setTimeout(()=>finish(0), METADATA_STEP_TIMEOUT_MS);
    tmp.onloadedmetadata=()=>finish(tmp.duration||0);
    tmp.onerror=()=>finish(0);
    tmp.src=url;
  });
}

/* jsmediatags'in callback API'sini Promise'e çevirir. audio elemanına
   veya onun herhangi bir olayına hiç bağımlı değildir — dosyayı
   doğrudan okur. Hiçbir zaman reddetmez; başarısızlık/timeout
   durumunda null ile çözülür, ham (henüz normalize edilmemiş)
   tag.tags nesnesiyle veya null ile sonuçlanır. */
function readId3Tags(file){
  return new Promise(resolve=>{
    let settled=false;
    const finish=(value)=>{
      if(settled) return; settled=true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer=setTimeout(()=>finish(null), METADATA_STEP_TIMEOUT_MS);
    try{
      window.jsmediatags.read(file, {
        onSuccess: tag=> finish((tag && tag.tags) || null),
        onError: ()=> finish(null)
      });
    }catch(e){
      finish(null);
    }
  });
}

/* Ham ID3 tag nesnesini, uygulamanın gerçekten kullandığı 5 alana
   (title/artist/album/lyrics/coverBlob) indirger ve doğrular. Her
   alan KENDİ try/catch'i içinde işlenir — biri (örn. beklenmedik
   picture.data şekli) bozuksa yalnızca o alan atlanır, diğerleri
   etkilenmez. Dönen nesnede yalnızca gerçekten geçerli bulunan
   alanlar bulunur; eksik alan hiç yazılmaz (undefined kalır). */
function normalizeId3Tags(rawTags){
  if(!rawTags) return null;
  const out = {};
  try{
    if(isUsableText(rawTags.title)) out.title = rawTags.title.trim();
  }catch(e){}
  try{
    if(isUsableText(rawTags.artist)) out.artist = rawTags.artist.trim();
  }catch(e){}
  try{
    if(isUsableText(rawTags.album)) out.album = rawTags.album.trim();
  }catch(e){}
  try{
    const ly = rawTags.lyrics;
    if(isUsableText(ly)) out.lyrics = ly;
    else if(ly && isUsableText(ly.lyrics)) out.lyrics = ly.lyrics;
    else if(Array.isArray(ly) && ly.length){
      const first = ly[0];
      if(isUsableText(first)) out.lyrics = first;
      else if(first && isUsableText(first.lyrics)) out.lyrics = first.lyrics;
    }
  }catch(e){}
  try{
    const pic = rawTags.picture;
    if(pic && pic.data && pic.data.length && isUsableText(pic.format)){
      out.coverBlob = new Blob([new Uint8Array(pic.data)], {type: pic.format});
    }
  }catch(e){}
  return out;
}

/* ORKESTRATÖR. Dosya adı ayrıştırması senkron/anında çalışır. Süre ve
   ID3 okuma birbirinden BAĞIMSIZ, PARALEL başlar (Promise.all) —
   biri diğerini bloklamaz, biri başarısız olsa da diğeri kullanılır.
   Gerçek ID3 verisi varsa dosya adı tahminini KESİNLİKLE ezmez;
   yalnızca ID3'te olmayan alanlar için dosya adı/fallback kullanılır.
   fixTitleCase/extractHashtags (dosya-adı odaklı sezgisel kurallar)
   yalnızca başlık dosya adından geldiğinde çalışır — gerçek ID3
   başlığına asla uygulanmaz. */
function autoBuildTrack(file){
  const meta = parseFilenameMeta(file.name);
  return Promise.all([
    readAudioDuration(file),
    readId3Tags(file).then(normalizeId3Tags)
  ]).then(([duration, id3])=>{
    let title, titleSource, description='';
    if(id3 && id3.title){
      title = id3.title;
      titleSource = 'id3';
    } else {
      title = meta.title || cleanTrackName(file.name);
      titleSource = 'filename';
    }
    if(titleSource==='filename'){
      const h = extractHashtags(title);
      title = fixTitleCase(h.text);
      if(h.tags.length) description = h.tags.join(' ');
    }
    return {
      id: uid(), title,
      artist: (id3 && id3.artist) || meta.artist || '',
      album: (id3 && id3.album) || '',
      description, lyrics: (id3 && id3.lyrics) || '',
      favorite:false, audioBlob:file, coverBlob: (id3 && id3.coverBlob) || null,
      duration, addedAt:Date.now()
    };
  });
}

