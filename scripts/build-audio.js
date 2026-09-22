'use strict';
/**
 * 一键产出作品：合成 → 体检 → 转 MP3 → 生成封面 → 写入 data/tracks.json
 * 以后新增作品后再次运行即可刷新（不会覆盖手工编辑的曲目字段）。
 */
const path = require('path');
const fs = require('fs');
const instrumental = require('./compose-instrumental');
const song = require('./compose-song');
const covers = require('./make-covers');
const { toMp3, findFfmpeg } = require('./lib/ffmpeg');
const { report } = require('./lib/analyze');

const ROOT = path.join(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const DATA_FILE = path.join(ROOT, 'data', 'tracks.json');

const SEQ = song.seq;

/** 歌词英文对照 */
const EN_LYRIC = {
  '清晨的风吹过窗台': 'Morning breeze slips across the windowsill',
  '第一缕光照亮未来': 'The first light brightens all that is to come',
  '心跳在远处轻轻回响': 'A heartbeat echoes softly, far away',
  '像海浪拍打胸怀': 'Like ocean waves beating against the heart',
  '越过山海': 'Over the mountains, over the seas',
  '越过星辰': 'On beyond the stars',
  '所有距离': 'Every distance between us',
  '都不算远': 'Is never too far',
  '同一个世界同节拍': 'One world, one single beat',
  '不同语言同样的爱': 'Different tongues, the same love',
  '让音符飞向那云海': 'Let the notes fly into the sea of clouds',
  '我们与世界同频': 'We are in sync with the world',
  '黄昏的雨落在屋檐': 'Dusk rain falls upon the eaves',
  '陌生的城市也温暖': 'Even a stranger’s city feels warm',
  '每一次呼吸都相连': 'Every breath we take is connected',
  '每一双眼里有星海': 'In every pair of eyes, a sea of stars',
  '当黎明升起': 'When the dawn rises',
  '当歌声响起': 'When the song rings out',
  '这颗心跳动': 'This heart is beating',
  '与世界同频': 'In sync with the world',
  '啦啦啦啦啦啦啦啦': 'La la la la la la la la',
  '啦啦啦啦': 'La la la la'
};

function lyricTimeline() {
  return song.LINES.map((line) => {
    let beat = line.beat;
    const chars = [];
    for (let i = 0; i < line.chars.length; i++) {
      chars.push({ c: line.chars[i], t: Math.round(SEQ.t(line.bar, beat) * 100) / 100 });
      beat += line.durs[i];
    }
    return {
      time: chars[0].t,
      zh: line.chars,
      en: EN_LYRIC[line.chars] || '',
      chars: chars.map((x) => `${x.t}|${x.c}`).join(' ')
    };
  });
}

function publish(wavFile, mp3Name, meta) {
  const mp3Path = path.join(AUDIO_DIR, mp3Name);
  const hasFfmpeg = !!findFfmpeg();
  let rel = 'audio/' + mp3Name;
  if (hasFfmpeg) {
    const out = toMp3(wavFile, mp3Path, meta, '192k');
    if (!out) throw new Error('MP3 编码失败：' + wavFile);
  } else {
    const dst = path.join(AUDIO_DIR, mp3Name.replace(/\.mp3$/, '.wav'));
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    fs.copyFileSync(wavFile, dst);
    rel = 'audio/' + path.basename(dst);
    console.warn('[提示] 未找到 ffmpeg，已直接发布 WAV');
  }
  const size = fs.statSync(path.join(ROOT, 'public', rel)).size;
  return { file: rel, bytes: size };
}

function baseTrack(id) {
  return {
    id,
    plays: 0,
    likes: 0,
    featured: false,
    releasedAt: new Date().toISOString().slice(0, 10)
  };
}

function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  console.log('=== 寰宇音乐台 · 作品生成 ===');

  console.log('\n[1/4] 合成《星海序曲》…');
  const a = instrumental.build();
  console.log('\n[2/4] 合成《世界同频》…');
  const b = song.build();
  console.log('\n[3/4] 生成封面…');
  covers.build();
  console.log('\n[4/4] 转码与入库…');

  const reportA = report(a.file);
  const reportB = report(b.file);
  if (!reportA.ok || !reportB.ok) {
    console.warn('[警告] 体检未通过，请检查：', reportA.ok ? '' : '星海序曲', reportB.ok ? '' : '世界同频');
  }

  const lyrics = lyricTimeline();

  const trackA = {
    ...baseTrack('starfield-overture'),
    kind: 'instrumental',
    audio: publish(a.file, 'starfield-overture.mp3', {
      title: '星海序曲 Starfield Overture', artist: '寰宇音乐台', album: '寰宇原创音乐集',
      genre: 'Ambient Cinematic', date: new Date().getFullYear().toString(),
      comment: '由寰宇音乐台 AI 作曲引擎生成的纯音乐',
      cover: path.join(ROOT, 'public', 'img', 'covers', 'starfield-overture.png')
    }).file,
    cover: 'img/covers/starfield-overture.png',
    duration: Math.round(a.duration * 10) / 10,
    bpm: 76,
    musicalKey: 'A 小调',
    genre: { zh: '氛围电子', en: 'Ambient Electronic' },
    moods: { zh: ['辽阔', '宁静', '希望'], en: ['Expansive', 'Tranquil', 'Hopeful'] },
    peaks: a.peaks,
    title: {
      zh: '星海序曲', en: 'Starfield Overture', es: 'Obertura del Campo de Estrellas',
      fr: 'Ouverture du Champ d\'Étoiles', ja: '星原序曲', ar: 'افتتاحية حقل النجوم'
    },
    subtitle: {
      zh: '纯音乐 · 电影感氛围电子', en: 'Instrumental · Cinematic Ambient',
      es: 'Instrumental · Ambiente cinematográfico', fr: 'Instrumental · Ambiance cinématographique',
      ja: 'インストゥルメンタル・シネマティック', ar: 'موسيقى آلات · أجواء سينمائية'
    },
    description: {
      zh: '钢琴琶音像星尘一样洒落，弦乐与钟琴在深邃的空间中层层展开。从静谧的序奏一路推升到辽阔的高潮，最后缓缓归于星海。全曲由代码实时合成，没有一个采样来自别处。',
      en: 'Piano arpeggios fall like stardust while strings and bells unfold through a deep, wide space. It rises from a quiet overture to an expansive climax, then slowly returns to the sea of stars — every note synthesized from code, not a single borrowed sample.',
      es: 'Los arpegios de piano caen como polvo de estrellas mientras cuerdas y campanas se despliegan en un espacio profundo. Todo está sintetizado por código.',
      fr: 'Les arpèges de piano tombent comme de la poussière d\'étoile, tandis que cordes et cloches se déploient dans un espace profond. Tout est synthétisé par le code.',
      ja: 'ピアノのアルペジオが星屑のように降り、弦と鐘が深い空間に広がります。すべてコードから合成された音楽です。',
      ar: 'تسقط أربيجات البيانو كغبار النجوم، وتنتشر الأوتار والأجراس في فضاء عميق. كل نote مُصنَّعة بالكود.'
    },
    credits: {
      zh: '作曲 / 编曲 / 混音：寰宇音乐台 AI 作曲引擎',
      en: 'Composed, arranged and mixed by the Huanyu Music AI engine',
      es: 'Composición, arreglos y mezcla: motor de IA de Huanyu Music',
      fr: 'Composition, arrangement et mixage : moteur IA de Huanyu Music',
      ja: '作曲・編曲・ミックス：寰宇音楽台 AI 作曲エンジン',
      ar: 'التأليف والتوزيع والمزج: محرك التأليف الآلي في Huanyu Music'
    },
    lyrics: null
  };

  const trackB = {
    ...baseTrack('world-in-sync'),
    kind: 'song',
    audio: publish(b.file, 'world-in-sync.mp3', {
      title: '世界同频 World in Sync', artist: '寰宇音乐台', album: '寰宇原创音乐集',
      genre: 'Pop', date: new Date().getFullYear().toString(),
      comment: '献给世界的原创中文歌曲',
      cover: path.join(ROOT, 'public', 'img', 'covers', 'world-in-sync.png')
    }).file,
    cover: 'img/covers/world-in-sync.png',
    duration: Math.round(b.duration * 10) / 10,
    bpm: 92,
    musicalKey: 'A 大调',
    genre: { zh: '流行抒情', en: 'Pop Ballad' },
    moods: { zh: ['温暖', '希望', '团结'], en: ['Warm', 'Hopeful', 'United'] },
    peaks: b.peaks,
    featured: true,
    title: {
      zh: '世界同频', en: 'World in Sync', es: 'El mundo en sintonía',
      fr: 'Le monde en harmonie', ja: '世界は同じ鼓動', ar: 'العالم على نفس الإيقاع'
    },
    subtitle: {
      zh: '原创歌曲 · 中文演唱', en: 'Original song · Sung in Chinese',
      es: 'Canción original · Cantada en chino', fr: 'Chanson originale · Chantée en chinois',
      ja: 'オリジナル曲・中国語ボーカル', ar: 'أغنية أصلية · غناء بالصينية'
    },
    description: {
      zh: '一首唱给世界的歌。山海与星辰都不能隔开彼此，不同的语言唱出的是同样的爱。人声由语音合成引擎逐字生成后按旋律定音高、按谱面对齐节奏，中文歌词可以清晰听辨。',
      en: 'A song for the whole world. Neither mountains nor seas nor stars can keep us apart; different languages sing the same love. The vocal is generated syllable by syllable, then tuned to the melody and aligned to the score — the Chinese lyrics stay clearly intelligible.',
      es: 'Una canción para el mundo: distintos idiomas, el mismo amor. La voz se genera sílaba a sílaba y se afina con la melodía.',
      fr: 'Une chanson pour le monde : des langues différentes, le même amour. La voix est générée syllabe par syllabe puis accordée à la mélodie.',
      ja: '世界へ贈る歌。異なる言語でも、同じ愛を歌う。ボーカルは音節ごとに生成され、旋律に合わせて調律されています。',
      ar: 'أغنية للعالم كله: لغات مختلفة، والحب نفسه. يُولَّد الصوت مقطعاً بمقطع ثم يُضبط على اللحن.'
    },
    credits: {
      zh: '作词 / 作曲 / 编曲：寰宇音乐台 AI 作曲引擎　演唱：中文语音合成声库',
      en: 'Lyrics, composition and arrangement by the Huanyu Music AI engine; vocal by the Chinese speech synthesis voice',
      es: 'Letra, composición y arreglos: motor de IA de Huanyu Music; voz: síntesis de voz en chino',
      fr: 'Paroles, composition et arrangements : moteur IA de Huanyu Music ; voix : synthèse vocale chinoise',
      ja: '作詞・作曲・編曲：寰宇音楽台 AI 作曲エンジン／ボーカル：中国語音声合成',
      ar: 'الكلمات والتلحين والتوزيع: محرك التأليف الآلي في Huanyu Music؛ الصوت: تخليق الكلام الصيني'
    },
    lyrics: {
      lang: 'zh',
      languages: ['zh', 'en'],
      lines: lyrics
    }
  };

  // 合并入库：保留已存在的手工字段
  let db = { tracks: [] };
  if (fs.existsSync(DATA_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { db = { tracks: [] }; }
  }
  const existing = new Map((db.tracks || []).map((t) => [t.id, t]));
  const merged = [trackA, trackB].map((t) => {
    const old = existing.get(t.id);
    if (!old) return t;
    return { ...old, ...t, plays: old.plays || 0, likes: old.likes || 0, releasedAt: old.releasedAt || t.releasedAt };
  });
  const rest = (db.tracks || []).filter((t) => !['starfield-overture', 'world-in-sync'].includes(t.id));
  db.tracks = [...rest, ...merged];
  db.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');

  console.log('\n=== 完成 ===');
  for (const t of merged) {
    const size = fs.existsSync(path.join(ROOT, 'public', t.audio)) ? fs.statSync(path.join(ROOT, 'public', t.audio)).size : 0;
    console.log(`  ${t.title.zh} / ${t.title.en}  ${t.duration}s  ${(size / 1024 / 1024).toFixed(2)}MB  ${t.audio}`);
  }
  console.log(`  曲目数据：${DATA_FILE}（共 ${db.tracks.length} 首）`);
}

if (require.main === module) main();
module.exports = { main, lyricTimeline };
