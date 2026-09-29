export const WORD_CATEGORIES = ["全部", "自然", "时间", "地点", "心情"];

export const WORD_LIBRARY = [
  { word: "雨", category: "自然" },
  { word: "苔藓", category: "自然" },
  { word: "风", category: "自然" },
  { word: "树影", category: "自然" },
  { word: "月光", category: "自然" },
  { word: "霜冻", category: "自然" },
  { word: "十月", category: "时间" },
  { word: "黄昏", category: "时间" },
  { word: "清晨", category: "时间" },
  { word: "午夜", category: "时间" },
  { word: "星期二", category: "时间" },
  { word: "格拉斯哥", category: "地点" },
  { word: "站台", category: "地点" },
  { word: "咖啡馆", category: "地点" },
  { word: "窗边", category: "地点" },
  { word: "河岸", category: "地点" },
  { word: "想念", category: "心情" },
  { word: "犹豫", category: "心情" },
  { word: "温柔", category: "心情" },
  { word: "孤独", category: "心情" },
  { word: "安静", category: "心情" },
];

const sentence = (id, category, ...parts) => ({ id, category, parts });
const blank = () => ({ type: "blank", value: "" });
const text = (value) => ({ type: "text", value });

export const SENTENCE_LIBRARY = [
  sentence("rain-window", "自然", text("雨停之后，窗上还留着一座城市。")),
  sentence("moss", "自然", text("苔藓替旧墙记住了春天。")),
  sentence("wind", "自然", text("风翻过那一页，替我说完了话。")),
  sentence("light", "自然", text("今天的光，落在"), blank(), text("上。")),
  sentence("october", "时间", text("十月走得很慢，像一封没有寄出的信。")),
  sentence("morning", "时间", text("清晨把昨天轻轻折起来。")),
  sentence("midnight", "时间", text("午夜之后，我才想起"), blank(), text("。")),
  sentence("tuesday", "时间", text("星期二的雨，落在"), blank(), text("。")),
  sentence("station", "地点", text("站台空了，回声却还等着下一班车。")),
  sentence("cafe", "地点", text("咖啡馆的窗边，时间坐了一下午。")),
  sentence("river", "地点", text("河岸把远处的灯，一盏盏收进口袋。")),
  sentence("glasgow", "地点", text("格拉斯哥的风，知道"), blank(), text("的名字。")),
  sentence("miss", "心情", text("我把"), blank(), text("，留在了"), blank(), text("。")),
  sentence("hesitate", "心情", text("想说的话，最后变成了一阵风。")),
  sentence("gentle", "心情", text("愿你经过的夜晚，都有一盏灯。")),
];
