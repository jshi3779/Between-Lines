// 「AI 写一句」 — a stand-in for a real model, so the flow can be designed and tested now.
// The writer types a theme in their own words; it picks the closest theme (or, for a theme it
// has no lines for, works the words into a template) and returns one sentence card, where "＿"
// marks a word card left for a friend. Swap `writeFromTheme` for a model call later — the
// panel only needs an async function returning a string.

const THEMES = [
  {
    keys: ["城", "来信", "异乡", "格拉斯哥", "搬", "学校", "远方", "出发", "离开", "车站", "站台", "留学"],
    lines: [
      "十月，我一个人搬到 ＿",
      "新城市的 ＿ 和家里不一样",
      "我把今天的 ＿ 拍下来寄给你们",
      "这里的街道很安静，像在等 ＿",
      "下课路上，我又想起了 ＿",
      "我们之间隔着八小时的 ＿",
      "在陌生的窗边，我学会了一个人看 ＿",
      "如果你们也在，我们会去 ＿",
    ],
  },
  {
    keys: ["雨", "秋", "十月", "黄昏", "落叶", "霜", "冷"],
    lines: [
      "雨落在 ＿ 上，很轻很轻",
      "雨下到第三天，我开始想念 ＿",
      "黄昏把影子 ＿ 得很长",
      "秋天在窗外慢慢地 ＿",
      "我把一片 ＿ 夹进了书里",
      "风翻过 ＿ ，替你读完",
    ],
  },
  {
    keys: ["海", "风", "夏", "光", "月", "星", "夜"],
    lines: [
      "那晚的 ＿ 亮得不像真的",
      "海风吹过来的时候，我们都没说话",
      "月亮裁好了一件 ＿",
      "我们约好下一个夏天去看 ＿",
      "星星落在 ＿ 上，像一封没寄出的信",
    ],
  },
];

// the theme is chosen from what the writer typed, not from earlier sentences
const findTheme = (topic) => {
  let best = null;
  let bestScore = 0;
  for (const theme of THEMES) {
    const score = theme.keys.reduce((sum, key) => sum + (topic.includes(key) ? 1 : 0), 0);
    if (score > bestScore) { best = theme; bestScore = score; }
  }
  return best ? best.lines : null;
};

// for themes with no prepared lines: the writer's own words go into the sentence
const TEMPLATES = [
  "{t}的时候，我想起了 ＿",
  "如果{t}有颜色，大概是 ＿",
  "我把{t}折好，寄给 ＿",
  "关于{t}，我只记得 ＿",
  "{t}那天，窗外有 ＿",
];

/** One sentence card for a theme typed in natural language ("初到新城市", "想念朋友"…). */
export const writeFromTheme = async ({ theme = "", title = "", written = [], round = 0 }) => {
  await new Promise((resolve) => setTimeout(resolve, 900)); // feels like the model is thinking
  const topic = theme.trim() || title;
  const all = written.join("");
  const lines = findTheme(topic);
  if (lines) {
    const fresh = lines.filter((line) => !all.includes(line.replace(/\s*＿\s*/g, "")));
    const pool = fresh.length ? fresh : lines;
    return pool[round % pool.length];
  }
  const words = topic.replace(/^(写|关于|我想写|想写)/, "").replace(/[，。！？、\s]+$/g, "").replace(/(那天|那时|的时候|时候)$/, "").slice(0, 10) || "今天";
  return TEMPLATES[round % TEMPLATES.length].replace("{t}", words);
};

/** "十月，我一个人搬到 ＿" → [text, blank]: the blank becomes an empty word card. */
export const splitSuggestion = (line) => {
  const chunks = line.split("＿");
  const parts = [];
  chunks.forEach((chunk, i) => {
    let text = chunk;
    if (i > 0) text = text.replace(/^\s+/, '');
    if (i < chunks.length - 1) text = text.replace(/\s+$/, '');
    if (text) parts.push({ type: "text", value: text });
    if (i < chunks.length - 1) parts.push({ type: "blank" });
  });
  return parts;
};
