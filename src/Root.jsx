import { useEffect, useRef, useState } from "react";
import HomeShelf from "./HomeShelf.jsx";
import App from "./App.jsx";
import InviteLanding from "./InviteLanding.jsx";

const inviteFromHash = () => window.location.hash.match(/^#invite-(.+)$/)?.[1] ?? null;
const clearHash = () => window.history.replaceState(null, "", window.location.pathname + window.location.search);

export default function Root() {
  const [openNotebook, setOpenNotebook] = useState(null); // { id, title } | null
  const [invite, setInvite] = useState(inviteFromHash);   // notebook id from an invite link
  const shelfApi = useRef(null);
  // a link pasted into an already-open tab only changes the hash
  useEffect(() => {
    const onHash = () => { const id = inviteFromHash(); if (id) { setOpenNotebook(null); setInvite(id); } };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (invite) {
    return (
      <InviteLanding
        notebookId={invite}
        onJoin={(book) => { clearHash(); setInvite(null); setOpenNotebook(book); }}
        onDecline={() => { clearHash(); setInvite(null); }}
      />
    );
  }

  return (
    <>
      <div style={{ display: openNotebook ? "none" : undefined }}>
        <HomeShelf apiRef={shelfApi} onOpenNotebook={(book, page) => setOpenNotebook({ id: book.id, title: book.title, page })} />
      </div>
      {openNotebook && (
        <App
          key={openNotebook.id}
          notebookId={openNotebook.id}
          initialTitle={openNotebook.title}
          initialPage={openNotebook.page}
          onTitleChange={(title) => shelfApi.current?.renameNotebook(openNotebook.id, title)}
          onExit={() => {
            const id = openNotebook.id;
            setOpenNotebook(null);
            window.setTimeout(() => shelfApi.current?.refreshNotebook(id), 60); // after the editor has flushed its save
          }}
        />
      )}
    </>
  );
}
