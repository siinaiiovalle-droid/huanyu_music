'use strict';
/**
 * 歌词引擎：为中文原创歌曲挑选并编排歌词（主歌 / 预副歌 / 副歌 / 桥段 / 哼唱），
 * 每句自带英文对照，供前台做双语歌词展示。
 *
 * 句子按"意象块"组织，随机抽取时会避开同一首歌内的重复句。
 * 每句字数不固定，旋律由 compose-engine 按实际字数生成，因此永远逐字对齐。
 */

/* 主歌：叙事与画面 */
const VERSE = [
  { zh: '清晨的风吹过窗台', en: 'Morning breeze slips across the windowsill' },
  { zh: '街灯把夜色慢慢抚平', en: 'The streetlights smooth the night away' },
  { zh: '海浪在远处翻涌不停', en: 'Waves keep rolling far away' },
  { zh: '雪落在无人经过的街', en: 'Snow falls on a street nobody walks' },
  { zh: '列车穿过金黄的麦田', en: 'The train runs through fields of gold' },
  { zh: '候鸟排成一行向南', en: 'Birds in a line all heading south' },
  { zh: '雨点在伞上敲着节拍', en: 'Raindrops tap a beat on my umbrella' },
  { zh: '黄昏的云烧成了海', en: 'Evening clouds burn into a sea' },
  { zh: '我把心事折成纸船', en: 'I fold my heart into a paper boat' },
  { zh: '风把旧信吹过山岗', en: 'The wind blows an old letter over the hill' },
  { zh: '檐下的风铃轻轻摇晃', en: 'The wind chime under the eaves sways softly' },
  { zh: '人群如潮水漫过广场', en: 'The crowd floods the square like a tide' },
  { zh: '窗前的树影写下年轮', en: 'Tree shadows write their rings on the window' },
  { zh: '有颗星落在你的掌心', en: 'A star has fallen into your palm' },
  { zh: '时间把所有答案收藏', en: 'Time keeps every answer safe' },
  { zh: '我把远方走成了故乡', en: 'I walked the far away until it felt like home' },
  { zh: '夜航的灯火不肯睡去', en: 'The lights of the night flight refuse to sleep' },
  { zh: '潮汐记得月光的约定', en: 'The tide remembers its date with the moon' },
  { zh: '年少的梦还没说完', en: 'The dream of youth is not yet told' },
  { zh: '我在人海里数着心跳', en: 'Counting heartbeats in the sea of people' }
];

/* 预副歌：短促推进 */
const PRE = [
  { zh: '越过山海', en: 'Over the mountains, over the seas' },
  { zh: '越过星辰', en: 'On beyond the stars' },
  { zh: '越过时间', en: 'Across all of time' },
  { zh: '越过黑夜', en: 'Through the darkest night' },
  { zh: '越过风雪', en: 'Through the snow and wind' },
  { zh: '所有距离', en: 'Every distance between us' },
  { zh: '所有等待', en: 'Every hour we waited' },
  { zh: '所有沉默', en: 'Every silence we kept' },
  { zh: '都不算远', en: 'Is never too far' },
  { zh: '都不算晚', en: 'Is never too late' },
  { zh: '终会相见', en: 'We will meet again' },
  { zh: '就在今天', en: 'Starting right now' }
];

/* 副歌：主题升华 */
const CHORUS = [
  { zh: '同一个世界同节拍', en: 'One world, one single beat' },
  { zh: '不同语言同样的爱', en: 'Different tongues, the same love' },
  { zh: '让音符飞向那云海', en: 'Let the notes fly into the sea of clouds' },
  { zh: '我们与世界同频', en: 'We are in sync with the world' },
  { zh: '星光落进每扇窗棂', en: 'Starlight falls through every window' },
  { zh: '所有的孤单都被照亮', en: 'Every loneliness is lit up' },
  { zh: '把这首歌交给晚风', en: 'Give this song to the evening wind' },
  { zh: '它会替我飞到你身旁', en: 'It will fly to you in my place' },
  { zh: '心跳向着同一个方向', en: 'Heartbeats racing one direction' },
  { zh: '连呼吸都变的滚烫', en: 'Even our breath is burning bright' },
  { zh: '万水千山只唱一句', en: 'Across it all we sing one line' },
  { zh: '我们从来不曾分开', en: 'We were never really apart' }
];

/* 桥段：情绪转折 */
const BRIDGE = [
  { zh: '当黎明升起', en: 'When the dawn rises' },
  { zh: '当歌声响起', en: 'When the song rings out' },
  { zh: '当风停下来', en: 'When the wind stands still' },
  { zh: '当星光散场', en: 'When the starlight fades' },
  { zh: '这颗心跳动', en: 'This heart is beating' },
  { zh: '我仍在这里', en: 'I am still right here' },
  { zh: '与世界同频', en: 'In sync with the world' },
  { zh: '与你同节拍', en: 'In beat with you' }
];

/* 哼唱 */
const HUM = [
  { zh: '啦啦啦啦啦啦啦啦', en: 'La la la la la la la la' },
  { zh: '嗯嗯嗯嗯嗯嗯嗯嗯', en: 'Hmm hmm hmm hmm hmm hmm' },
  { zh: '啦啦啦啦啦', en: 'La la la la la' }
];

/* 歌名：中英一一对应 */
const TITLES = [
  { zh: '星尘漫游', en: 'Drifting Through Stardust' },
  { zh: '海的颜色', en: 'The Colour of the Sea' },
  { zh: '城市灯火', en: 'City Lights' },
  { zh: '风的方向', en: 'Where the Wind Goes' },
  { zh: '黎明之前', en: 'Before the Dawn' },
  { zh: '云端之上', en: 'Above the Clouds' },
  { zh: '无声花开', en: 'Silent Bloom' },
  { zh: '归途有光', en: 'Light on the Way Home' },
  { zh: '候鸟南飞', en: 'Birds Heading South' },
  { zh: '潮汐与月', en: 'Tide and Moon' },
  { zh: '雨落成诗', en: 'Rain Falls into Verse' },
  { zh: '雪夜微光', en: 'Faint Light in the Snow' },
  { zh: '远方的信', en: 'A Letter from Afar' },
  { zh: '同一片天', en: 'The Same Sky' },
  { zh: '心跳地图', en: 'Map of Heartbeats' },
  { zh: '此刻永恒', en: 'Now Is Forever' },
  { zh: '千山之外', en: 'Beyond a Thousand Hills' },
  { zh: '光的回声', en: 'Echoes of the Light' },
  { zh: '夜航之星', en: 'Star of the Night Flight' },
  { zh: '人间四月', en: 'April in This World' }
];

function pick(rng, pool, n, used) {
  const out = [];
  const guard = n * 12;
  let tries = 0;
  while (out.length < n && tries < guard) {
    tries++;
    const item = pool[Math.floor(rng() * pool.length)];
    if (used.has(item.zh) || out.some((x) => x.zh === item.zh)) continue;
    out.push(item);
  }
  // 池子不够大时允许回退补充
  while (out.length < n) out.push(pool[Math.floor(rng() * pool.length)]);
  return out;
}

/**
 * 编排一首歌的歌词
 * @param {Function} rng 随机函数
 * @returns {{title:{zh,en}, section:[{role, zh, en}]}}
 */
function compose(rng) {
  const title = TITLES[Math.floor(rng() * TITLES.length)];
  const used = new Set();
  const verse1 = pick(rng, VERSE, 4, used);
  const verse2 = pick(rng, VERSE, 4, used);
  const pre = pick(rng, PRE, 2, used);
  const pre2 = pick(rng, PRE, 2, used);
  const chorus = pick(rng, CHORUS, 4, used);
  const bridge = pick(rng, BRIDGE, 4, used);
  const hum = HUM[Math.floor(rng() * HUM.length)];

  const tag = (arr, role) => arr.map((x) => ({ role, zh: x.zh, en: x.en }));
  const lines = [
    ...tag(verse1, 'verse'),
    ...tag(pre, 'pre'),
    ...tag(chorus, 'chorus'),
    ...tag(verse2, 'verse2'),
    ...tag(pre2, 'pre'),
    ...tag(chorus, 'chorus'),
    ...tag(bridge, 'bridge'),
    ...tag(chorus, 'chorusFinal'),
    { role: 'outro', zh: hum.zh, en: hum.en }
  ];
  for (const l of [pre, pre2, chorus, bridge]) for (const x of l) used.delete(x.zh);
  return { title, lines };
}

module.exports = { compose, VERSE, PRE, CHORUS, BRIDGE, TITLES };
