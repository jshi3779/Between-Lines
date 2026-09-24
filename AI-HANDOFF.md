# Between Lines｜AI 接手说明

这是一个 Vite + React 的移动端交互原型，基准画板为 375 × 812px。

## 快速开始

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5177
```

生产构建：

```bash
npm run build
```

## 主要文件

- `src/App.jsx`：页面状态、句子编辑、词卡、图片、录音、分享和页面总览交互。
- `src/styles.css`：全部界面样式与响应布局。
- `src/contentLibrary.js`：中文词语分类与推荐词库。
- `public/icons/`：设计稿导出的 SVG 与默认图片素材。
- `DESIGN-SPEC.md`：基础设计规范；实现发生变化时应同步更新。

## 当前实现重点

- 首页默认显示两句中文引导句。
- 可编辑句子、删除单词并生成空白词卡，支持词语、图片和录音内容。
- 内容编辑面板宽 315px，使用 `panel-top.svg`、`panel-middle.svg`、`panel-bottom.svg` 三段式底纹，并跟随空白词卡定位。
- 图片词卡使用 `photo-card.svg`，插入后旋转 `+5deg`；最近图片缩略图保持水平。
- 音频模式的录音按钮固定，只有录音记录列表滚动。
- 页面总览按双页展开图显示；右上角选择按钮在 `spread-thumbnail-unselected.svg` 与 `spread-thumbnail-selected.svg` 之间切换。
- 分享面板叠加在当前页面或页面总览上，关闭后返回原来的界面状态。

## 验证

每次修改后至少运行 `npm run build`。本地预览通常使用 `http://127.0.0.1:5177/`，该地址只在开发服务器运行时有效。公开预览由 GitHub Pages 提供。

## GitHub

- 仓库：`https://github.com/jshi3779/Between-Lines`
- Pages：`https://jshi3779.github.io/Between-Lines/`

把仓库链接交给其他 AI，并提示它先阅读本文件、`DESIGN-SPEC.md`、`src/App.jsx` 和 `src/styles.css`，即可继续开发。
