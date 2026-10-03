import { useRef, useState } from "react";
import HomeShelf from "./HomeShelf.jsx";
import App from "./App.jsx";

export default function Root() {
  const [openNotebook, setOpenNotebook] = useState(null); // { id, title } | null
  const shelfApi = useRef(null);

  return (
    <>
      <div style={{ display: openNotebook ? "none" : undefined }}>
        <HomeShelf apiRef={shelfApi} onOpenNotebook={(book) => setOpenNotebook({ id: book.id, title: book.title })} />
      </div>
      {openNotebook && (
        <App
          key={openNotebook.id}
          notebookId={openNotebook.id}
          initialTitle={openNotebook.title}
          onTitleChange={(title) => shelfApi.current?.renameNotebook(openNotebook.id, title)}
          onExit={() => setOpenNotebook(null)}
        />
      )}
    </>
  );
}
