import { useState } from "react";
import HomeShelf from "./HomeShelf.jsx";
import App from "./App.jsx";

export default function Root() {
  const [openNotebook, setOpenNotebook] = useState(null); // { id, title } | null

  return (
    <>
      <div style={{ display: openNotebook ? "none" : undefined }}>
        <HomeShelf onOpenNotebook={(book) => setOpenNotebook({ id: book.id, title: book.title })} />
      </div>
      {openNotebook && (
        <App
          key={openNotebook.id}
          initialTitle={openNotebook.title}
          onExit={() => setOpenNotebook(null)}
        />
      )}
    </>
  );
}
