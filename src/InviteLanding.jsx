import { useState } from "react";
import { USERS } from "./App.jsx";
import { LIBRARY_KEY, SHELF_KEY, loadJSON, notebookKey, saveJSON } from "./storage";

const icon = (name) => `${import.meta.env.BASE_URL}icons/${name}`;

// What a friend sees when they open an invite link (…#invite-<notebookId>): who invited them to
// which notebook, and a button that joins it. Joining takes the next free writer colour; they can
// change it later from their tag.
export default function InviteLanding({ notebookId, onJoin, onDecline }) {
  const [message, setMessage] = useState("");
  const book = (loadJSON(SHELF_KEY)?.shelves ?? []).flat().find((item) => item?.id === notebookId);
  const saved = loadJSON(notebookKey(notebookId));
  const title = saved?.title || book?.title;
  const collaborators = saved?.collaborators?.length
    ? saved.collaborators
    : String(notebookId).startsWith("new") ? [loadJSON(LIBRARY_KEY)?.currentUser ?? 1] : [1, 2, 3, 4];
  const colorOf = (user) => saved?.tagColors?.[user] ?? USERS[user]?.color;
  const inviter = collaborators[0];
  const free = [1, 2, 3, 4].filter((user) => !collaborators.includes(user));

  const join = () => {
    if (!free.length) { setMessage("这本笔记本已经有 4 位作者了"); return; }
    const me = free[0];
    saveJSON(notebookKey(notebookId), { ...(saved ?? {}), version: 1, collaborators: [...collaborators, me].sort() });
    saveJSON(LIBRARY_KEY, { ...(loadJSON(LIBRARY_KEY) ?? {}), currentUser: me });
    onJoin({ id: notebookId, title: title || "无标题" });
  };

  return (
    <main className="prototype-stage" aria-label="笔记本邀请">
      <section className="app-screen invite-landing">
        {title ? <>
          <p className="invite-eyebrow">扣指成诗 · 邀请</p>
          <div className="invite-cover" style={{ "--cover": book?.col ?? "#3a4f84", "--cover-ink": book?.tc ?? "#fdfdfb" }}>
            <div className="invite-cover-art" style={book?.coverImg ? { backgroundImage: `url(${book.coverImg})` } : undefined} />
            <strong>{title}</strong>
            <div className="invite-cover-writers">
              {collaborators.slice(0, 4).map((user) => <img key={user} src={icon(`user-${user}.svg`)} alt="" style={{ boxShadow: `0 0 0 2px ${colorOf(user)}` }} />)}
            </div>
          </div>
          <h1><span style={{ color: colorOf(inviter) }}>{USERS[inviter]?.name ?? "朋友"}</span> 邀请你一起写《{title}》</h1>
          <p className="invite-text">这本笔记本里已经有 {collaborators.length} 位作者。加入后你会有自己的颜色，你填的词卡、放的图片都会是这个颜色。</p>
          <button className="invite-join" type="button" onClick={join}>加入并开始写</button>
          <button className="invite-decline" type="button" onClick={onDecline}>先不了，去我的书架</button>
          {message && <p className="invite-message" role="status">{message}</p>}
        </> : <>
          <p className="invite-eyebrow">扣指成诗 · 邀请</p>
          <h1>这个邀请链接已失效</h1>
          <p className="invite-text">笔记本可能已经被删除了。</p>
          <button className="invite-join" type="button" onClick={onDecline}>去我的书架</button>
        </>}
      </section>
    </main>
  );
}
