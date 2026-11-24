import { Part } from '../model/Models';

// 「AI 写一句」 — a local stand-in for a model, same as the web prototype (src/aiSuggest.js).
// The writer types a theme in their own words; it picks the closest theme (or, for a theme it
// has no lines for, works the words into a template) and returns one sentence card, where "＿"
// marks a word card left for a friend. Replace writeFromTheme() with a model call later; the
// editor only needs a Promise of a string.

class Theme {
  keys: string[];
  lines: string[];

  constructor(keys: string[], lines: string[]) {
    this.keys = keys;
    this.lines = lines;
  }
}

const THEMES: Theme[] = [
  new Theme(['城', '来信', '异乡', '格拉斯哥', '搬', '学校', '远方', '出发', '离开', '车站', '站台', '留学'], [
    '十月，我一个人搬到 ＿',
    '新城市的 ＿ 和家里不一样',
    '我把今天的 ＿ 拍下来寄给你们',
    '这里的街道很安静，像在等 ＿',
    '下课路上，我又想起了 ＿',
    '我们之间隔着八小时的 ＿',
    '在陌生的窗边，我学会了一个人看 ＿',
    '如果你们也在，我们会去 ＿',
  ]),
  new Theme(['雨', '秋', '十月', '黄昏', '落叶', '霜', '冷'], [
    '雨落在 ＿ 上，很轻很轻',
    '雨下到第三天，我开始想念 ＿',
    '黄昏把影子 ＿ 得很长',
    '秋天在窗外慢慢地 ＿',
    '我把一片 ＿ 夹进了书里',
    '风翻过 ＿ ，替你读完',
  ]),
  new Theme(['海', '风', '夏', '光', '月', '星', '夜'], [
    '那晚的 ＿ 亮得不像真的',
    '海风吹过来的时候，我们都没说话',
    '月亮裁好了一件 ＿',
    '我们约好下一个夏天去看 ＿',
    '星星落在 ＿ 上，像一封没寄出的信',
  ]),
];

// for themes with no prepared lines: the writer's own words go into the sentence
const TEMPLATES: string[] = [
  '{t}的时候，我想起了 ＿',
  '如果{t}有颜色，大概是 ＿',
  '我把{t}折好，寄给 ＿',
  '关于{t}，我只记得 ＿',
  '{t}那天，窗外有 ＿',
];

// the theme is chosen from what the writer typed, not from earlier sentences
function findTheme(topic: string): string[] | undefined {
  let best: string[] | undefined = undefined;
  let bestScore = 0;
  THEMES.forEach((theme: Theme) => {
    let score = 0;
    theme.keys.forEach((key: string) => {
      score += topic.includes(key) ? 1 : 0;
    });
    if (score > bestScore) {
      best = theme.lines;
      bestScore = score;
    }
  });
  return best;
}

/** One sentence card for a theme typed in natural language (「初到新城市」「想念朋友」…). */
export function writeFromTheme(theme: string, title: string, written: string[], round: number): Promise<string> {
  return new Promise<string>((resolve: (line: string) => void) => {
    setTimeout(() => {
      const topic = theme.trim().length > 0 ? theme.trim() : title;
      const all = written.join('');
      const lines = findTheme(topic);
      if (lines !== undefined) {
        const fresh = lines.filter((line: string) => !all.includes(line.replace(/\s*＿\s*/g, '')));
        const pool = fresh.length > 0 ? fresh : lines;
        resolve(pool[round % pool.length]);
        return;
      }
      let words = topic.replace(/^(写|关于|我想写|想写)/, '').replace(/[，。！？、\s]+$/g, '')
        .replace(/(那天|那时|的时候|时候)$/, '').slice(0, 10);
      if (words.length === 0) {
        words = '今天';
      }
      resolve(TEMPLATES[round % TEMPLATES.length].replace('{t}', words));
    }, 900); // feels like the model is thinking
  });
}

/** "十月，我一个人搬到 ＿" → [text, empty word card] */
export function splitSuggestion(line: string): Part[] {
  const chunks = line.split('＿');
  const parts: Part[] = [];
  chunks.forEach((chunk: string, i: number) => {
    let text = chunk;
    if (i > 0) {
      text = text.replace(/^\s+/, '');
    }
    if (i < chunks.length - 1) {
      text = text.replace(/\s+$/, '');
    }
    if (text.length > 0) {
      parts.push(Part.text(text));
    }
    if (i < chunks.length - 1) {
      parts.push(Part.blank());
    }
  });
  return parts;
}
