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
   çağırır. jsmediatags (harici CDN kütüphanesi) burada kullanılır —
   ID3v1/v1.1/v2.2/v2.3/v2.4 ve M4A/FLAC'i KENDİ İÇİNDE otomatik
   tespit edip aynı title/artist/album/lyrics/picture "shortcut"
   adlarına indiriyor; bu dosya sürüm/format farkını hiç bilmiyor.
   AÇIK RİSK (doğrulanamadı): Bir dosyada hem ID3v1 hem ID3v2 varsa
   jsmediatags'in ikisinden HANGİSİNİ okuduğu, kaynak koduna bakılarak
   doğrulanamadı (Reader'ın iç önceliklendirme algoritması genel
   arama ile bulunamadı). Şu an kütüphanenin kendi seçimine güveniliyor.
   readId3Tags bu yüzden tag.version'ı da taşıyor (Track'e hiç
   girmiyor, yalnızca ileride bu senaryoyu gerçek bir dosyayla
   hata ayıklamak istenirse elde bulunsun diye).
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

/* ID3/kapak okuma süresi dosya boyutuna göre ölçeklenir: küçük bir
   MP3'te birkaç yüz ms yeten bir okuma, büyük bir gömülü kapak
   görseli taşıyan dosyada çok daha uzun sürebilir. Sabit bir sayıyı
   büyütmek (6000->10000 gibi) yerine taban + boyut bazlı ek süre +
   üst sınır modeli kullanılıyor — hem sağlam bir dosyayı gereksiz
   erken fallback'e düşürmüyor hem bozuk bir dosyanın süresiz
   beklemesini engelliyor. Süre okuma (aşağıda) jsmediatags'in
   gömülü kapak/frame işine göre çok daha hafif bir iştir (tarayıcı
   yalnızca başlık/index bilgisine bakar), bu yüzden ayrı ve sabit
   kalıyor — dosya boyutuna göre ölçeklenmeye ihtiyacı yok. */
const ID3_TIMEOUT_MIN_MS = 4000;
const ID3_TIMEOUT_MAX_MS = 15000;
const ID3_TIMEOUT_PER_MB_MS = 500;
const DURATION_TIMEOUT_MS = 5000;
function computeId3TimeoutMs(file){
  const sizeMb = file.size / (1024*1024);
  return Math.min(ID3_TIMEOUT_MAX_MS, ID3_TIMEOUT_MIN_MS + sizeMb*ID3_TIMEOUT_PER_MB_MS);
}

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
    const timer=setTimeout(()=>finish(0), DURATION_TIMEOUT_MS);
    tmp.onloadedmetadata=()=>finish(tmp.duration||0);
    tmp.onerror=()=>finish(0);
    tmp.src=url;
  });
}

/* jsmediatags'in callback API'sini Promise'e çevirir. audio elemanına
   veya onun herhangi bir olayına hiç bağımlı değildir — dosyayı
   doğrudan okur. Hiçbir zaman reddetmez; başarısızlık/timeout
   durumunda null ile çözülür. Başarılı olduğunda ham tag.tags'in
   yanında tag.type/tag.version'ı da taşır (örn. "ID3"/"2.4.0") —
   Track modeline hiç girmez, yalnızca dosya başındaki AÇIK RİSK
   notunda bahsedilen v1/v2 senaryosunu ileride hata ayıklamak
   istenirse elde bulunsun diye taşınıyor. */
function readId3Tags(file){
  return new Promise(resolve=>{
    let settled=false;
    const finish=(value)=>{
      if(settled) return; settled=true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer=setTimeout(()=>finish(null), computeId3TimeoutMs(file));
    try{
      window.jsmediatags.read(file, {
        onSuccess: tag=> finish(tag ? {type:tag.type, version:tag.version, tags:tag.tags||{}} : null),
        onError: ()=> finish(null)
      });
    }catch(e){
      finish(null);
    }
  });
}

/* Ham ID3/M4A tag nesnesini, uygulamanın gerçekten kullandığı 5 alana
   (title/artist/album/lyrics/coverBlob) indirger ve doğrular. Her
   alan KENDİ try/catch'i içinde işlenir — biri (örn. beklenmedik
   picture.data şekli) bozuksa yalnızca o alan atlanır, diğerleri
   etkilenmez. Dönen nesnede yalnızca gerçekten geçerli bulunan
   alanlar bulunur; eksik alan hiç yazılmaz (undefined kalır).
   ID3v1/ID3v1.1/ID3v2.2/ID3v2.3/ID3v2.4/M4A arasındaki fark burada
   hiç görünmez — hepsi jsmediatags'in "shortcut" adı verdiği aynı
   title/artist/album/lyrics/picture alanlarına iniyor; sürüm/format
   tespiti ve eşlemesi tamamen jsmediatags'in sorumluluğunda. */
function normalizeId3Tags(raw){
  if(!raw || !raw.tags) return null;
  const rawTags = raw.tags;
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

