import React from "react";
import { createRoot } from "react-dom/client";
import Root from "./Root.jsx";
import AccountGate from './AccountGate.jsx'; // 在书架入口前验证账号。
import "./styles.css";

// Both the shelf and the editor are a fixed 375x812 canvas scaled to fit the viewport.
const fitAppScreen = () => {
  const scale = Math.min(window.innerWidth / 375, window.innerHeight / 812);
  document.documentElement.style.setProperty("--app-scale", String(scale));
};
fitAppScreen();
window.addEventListener("resize", fitAppScreen);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AccountGate><Root /></AccountGate> {/* 登录并加载用户数据后进入原有应用。 */}
  </React.StrictMode>,
);
