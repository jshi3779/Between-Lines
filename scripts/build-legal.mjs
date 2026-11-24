// Builds public/legal/privacy.html and public/legal/terms.html from the HarmonyOS app's
// harmony/entry/src/main/ets/common/LegalTexts.ets, so the store's privacy-policy URL always shows
// the same text as the app. Run: node scripts/build-legal.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../harmony/entry/src/main/ets/common/LegalTexts.ets", import.meta.url), "utf8");
const constant = (name) => src.match(new RegExp(`export const ${name} = '([^']*)'`))[1];
const APP_NAME = constant("APP_NAME");
const UPDATED = constant("LEGAL_UPDATED");
const CONTACT = constant("CONTACT");

const sections = (name) => {
  const block = src.slice(src.indexOf(`export const ${name}`));
  const end = block.indexOf("];");
  return [...block.slice(0, end).matchAll(/new LegalSection\('([^']+)', `?'?([^`]*?)`?'?\),\n/g)].map(([, title, body]) =>
    [title, body.replaceAll("${APP_NAME}", APP_NAME).replaceAll("${CONTACT}", CONTACT)]);
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const page = (title, list) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(APP_NAME)}</title>
<style>
  body { margin: 0; padding: 32px 20px 56px; background: #fbfaf6; color: #242222; font: 15px/1.75 "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
  main { max-width: 680px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  .updated { margin: 0 0 28px; color: #7d7a74; font-size: 13px; }
  h2 { margin: 26px 0 6px; font-size: 17px; }
  p { margin: 0; }
</style>
</head>
<body>
<main>
<h1>${esc(APP_NAME)} ${esc(title)}</h1>
<p class="updated">更新日期：${esc(UPDATED)}</p>
${list.map(([t, b]) => `<h2>${esc(t)}</h2>\n<p>${esc(b)}</p>`).join("\n")}
</main>
</body>
</html>
`;

const out = new URL("../public/legal/", import.meta.url);
mkdirSync(out, { recursive: true });
const privacy = sections("PRIVACY_POLICY"), terms = sections("USER_AGREEMENT");
if (!privacy.length || !terms.length) throw new Error("could not read LegalTexts.ets");
writeFileSync(new URL("privacy.html", out), page("隐私政策", privacy));
writeFileSync(new URL("terms.html", out), page("用户协议", terms));
console.log(`privacy: ${privacy.length} sections, terms: ${terms.length} sections`);
