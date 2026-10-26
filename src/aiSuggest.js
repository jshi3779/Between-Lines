// "AI 帮你起个头" — a stand-in for a real model, so the flow can be designed and tested now.
// It reads the notebook's title and what has been written, picks the closest theme and offers
// three openings; "＿" marks a word card left for a friend to fill. Swap `suggestOpenings` for a
// model call later — the panel only needs an async function returning an array of strings.

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
      "如今，十月的光落下来，已经不一样了。",
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

const DEFAULT_LINES = [
  "今天想和你们说一件小事：＿",
  "我把这一页留给 ＿",
  "如果只能写一句，我会写 ＿",
  "刚刚窗外经过了一只 ＿",
  "我们第一次见面，是在 ＿",
  "有些话，写下来就不那么难说了。",
];

// the title says what the notebook is about, so it counts three times as much as the sentences
const pickTheme = (title, written) => {
  let best = null;
  let bestScore = 0;
  for (const theme of THEMES) {
    const score = theme.keys.reduce((sum, key) => sum + (title.includes(key) ? 3 : 0) + (written.includes(key) ? 1 : 0), 0);
    if (score > bestScore) { best = theme; bestScore = score; }
  }
  return best ? best.lines : DEFAULT_LINES;
};

/** Three openings, rotating through the theme on each "换一批"; skips lines already on the page. */
export const suggestOpenings = async ({ title = "", written = [], round = 0 }) => {
  await new Promise((resolve) => setTimeout(resolve, 700)); // feels like the model is thinking
  const pool = pickTheme(title, written.join("")).filter((line) => !written.some((w) => w.includes(line.replace(/\s*＿\s*/g, ""))));
  const lines = pool.length >= 3 ? pool : [...pool, ...DEFAULT_LINES];
  const start = (round * 3) % lines.length;
  return [0, 1, 2].map((k) => lines[(start + k) % lines.length]);
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
