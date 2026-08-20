import { useEffect, useRef, useState } from "react";

const MAX_SENTENCE_CARDS = 5;
const STARTER_SENTENCES = [
  "The last train to Glasgow leaves without me tonight.",
  "Your handwriting still looks like rain.",
  "The light falls differently in October now.",
];
const textPart = (value) => ({ type: "text", value });
const cardParts = (card) => card.parts ?? [textPart(card.text ?? "")];
const blankCardWidth = (value) => Math.min(250, Math.max(88, 24 + value.length * 12));
const icon = (file) => `${import.meta.env.BASE_URL}icons/${file}`;

export default function App() {
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [sentenceCards, setSentenceCards] = useState({});
  const [activeSentenceIndexes, setActiveSentenceIndexes] = useState({});
  const [selectedWord, setSelectedWord] = useState(null);
  const [blankEditor, setBlankEditor] = useState(null);
  const [editorMode, setEditorMode] = useState("word");
  const [hasSeedSentence, setHasSeedSentence] = useState(false);
  const [isAddPressed, setIsAddPressed] = useState(false);
  const releaseTimer = useRef(null);
  const blankId = useRef(0);
  const dialogInput = useRef(null);
  const addWordCardButtons = useRef({});
  const caretPositions = useRef({});
  const currentPageSide = currentPage % 2 === 1 ? "left" : "right";

  useEffect(() => () => clearTimeout(releaseTimer.current), []);

  const addPage = () => {
    setIsAddPressed(true);
    setPageCount((count) => {
      const nextPage = count + 1;
      setCurrentPage(nextPage);
      return nextPage;
    });
    clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => setIsAddPressed(false), 180);
  };

  const addSentence = () => {
    if (currentSentenceCards.length >= MAX_SENTENCE_CARDS) return;

    const avatar = Math.floor(Math.random() * 4) + 1;
    const nextIndex = currentSentenceCards.length;
    const text = hasSeedSentence
      ? ""
      : STARTER_SENTENCES[Math.floor(Math.random() * STARTER_SENTENCES.length)];
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: [
        ...(cards[currentPage] ?? []),
        { avatar, parts: [textPart(text)] },
      ],
    }));
    setHasSeedSentence(true);
    setActiveSentenceIndexes((indexes) => ({ ...indexes, [currentPage]: nextIndex }));
  };

  const partsFromElement = (index, element) => {
    const existingParts = cardParts((sentenceCards[currentPage] ?? [])[index] ?? {});
    const parts = Array.from(element.childNodes).flatMap((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [textPart(node.textContent)] : [];
      if (!(node instanceof HTMLElement)) return [];
      if (node.classList.contains("blank-word-card")) {
        const id = Number(node.dataset.blankId);
        return existingParts.find((part) => part.type === "blank" && part.id === id) ?? [];
      }
      return node.textContent ? [textPart(node.textContent)] : [];
    });
    const normalizedParts = parts.reduce((result, part) => {
      const previous = result.at(-1);
      if (part.type === "text" && previous?.type === "text") previous.value += part.value;
      else result.push(part);
      return result;
    }, []);
    return normalizedParts;
  };

  const saveSentenceParts = (index, parts) => {
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: (cards[currentPage] ?? []).map((card, cardIndex) =>
        cardIndex === index ? { ...card, parts } : card,
      ),
    }));
  };

  const updateSentenceFromElement = (index, element) => {
    saveSentenceParts(index, partsFromElement(index, element));
    setSelectedWord(null);
  };

  const textOffset = (root, targetNode, targetOffset) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let node = walker.nextNode();
    while (node) {
      if (node === targetNode) return offset + targetOffset;
      offset += node.textContent.length;
      node = walker.nextNode();
    }
    return null;
  };

  const selectWord = (index, element) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectedWord(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return;

    const rawWord = selection.toString();
    const word = rawWord.trim();
    if (!word || /\s/.test(word)) return;

    const start = textOffset(element, range.startContainer, range.startOffset);
    if (start === null) return;
    const wordStart = start + rawWord.indexOf(word);
    const wordRect = range.getBoundingClientRect();
    const cardRect = element.closest(".edit-sentence-card")?.getBoundingClientRect();
    const parts = partsFromElement(index, element);
    saveSentenceParts(index, parts);
    setSelectedWord({
      page: currentPage,
      index,
      start: wordStart,
      end: wordStart + word.length,
      left: Math.max(0, wordRect.right - (cardRect?.left ?? 0) + 4),
      top: Math.max(0, wordRect.top - (cardRect?.top ?? 0) - 30),
      parts,
    });
  };

  const deleteSelectedWord = () => {
    if (!selectedWord) return;
    const { page, index, start, end } = selectedWord;
    const nextBlankId = blankId.current + 1;
    blankId.current = nextBlankId;
    setSentenceCards((cards) => ({
      ...cards,
      [page]: (cards[page] ?? []).map((card, cardIndex) => {
        if (cardIndex !== index) return card;

        let offset = 0;
        let insertedBlank = false;
        const parts = (selectedWord.parts ?? cardParts(card)).flatMap((part) => {
          if (part.type !== "text") {
            offset += part.value.length;
            return part;
          }

          const partStart = offset;
          const partEnd = offset + part.value.length;
          offset = partEnd;
          if (end <= partStart || start >= partEnd) return part;

          const before = part.value.slice(0, Math.max(0, start - partStart));
          const after = part.value.slice(Math.max(0, end - partStart));
          const replacement = [];
          if (before) replacement.push(textPart(before));
          if (!insertedBlank) {
            replacement.push({ type: "blank", id: nextBlankId, value: "" });
            insertedBlank = true;
          }
          if (after) replacement.push(textPart(after));
          return replacement;
        });

        return { ...card, parts };
      }),
    }));
    setSelectedWord(null);
  };

  const updateBlankWord = (index, id, value) => {
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: (cards[currentPage] ?? []).map((card, cardIndex) =>
        cardIndex === index
          ? {
              ...card,
              parts: cardParts(card).map((part) =>
                part.type === "blank" && part.id === id ? { ...part, value } : part,
              ),
            }
          : card,
      ),
    }));
  };

  const positionAddWordCardButton = (index, element) => {
    const key = `${currentPage}-${index}`;
    const button = addWordCardButtons.current[key];
    const selection = window.getSelection();
    if (!button || !selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      if (button) button.hidden = true;
      return;
    }
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer)) {
      button.hidden = true;
      return;
    }
    const offset = textOffset(element, range.startContainer, range.startOffset);
    if (offset === null) return;
    const caret = range.getBoundingClientRect();
    const editor = element.closest(".sentence-editor")?.getBoundingClientRect();
    if (!editor) return;
    button.hidden = false;
    button.style.left = `${Math.max(0, caret.left - editor.left + 3)}px`;
    button.style.top = `${Math.max(0, caret.top - editor.top - 5)}px`;
    caretPositions.current[key] = { offset, parts: partsFromElement(index, element) };
  };

  const appendBlankWordCard = (index) => {
    const id = blankId.current + 1;
    blankId.current = id;
    const key = `${currentPage}-${index}`;
    const caret = caretPositions.current[key];
    const sourceParts = caret?.parts ?? cardParts((sentenceCards[currentPage] ?? [])[index] ?? {});
    const insertAt = caret?.offset ?? sourceParts.reduce((total, part) => total + part.value.length, 0);
    let offset = 0;
    let inserted = false;
    const parts = sourceParts.flatMap((part) => {
      if (part.type !== "text") {
        offset += part.value.length;
        return part;
      }
      const partStart = offset;
      const partEnd = offset + part.value.length;
      offset = partEnd;
      if (inserted || insertAt < partStart || insertAt > partEnd) return part;
      inserted = true;
      const splitAt = insertAt - partStart;
      const before = part.value.slice(0, splitAt);
      const after = part.value.slice(splitAt);
      return [
        ...(before ? [textPart(before)] : []),
        { type: "blank", id, value: "" },
        ...(after ? [textPart(after)] : []),
      ];
    });
    if (!inserted) parts.push({ type: "blank", id, value: "" });
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: (cards[currentPage] ?? []).map((card, cardIndex) =>
        cardIndex === index
          ? { ...card, parts }
          : card,
      ),
    }));
  };

  const deleteSentenceCard = (index) => {
    const nextActiveIndex = Math.min(index, Math.max(0, (sentenceCards[currentPage] ?? []).length - 2));
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: (cards[currentPage] ?? []).filter((_, cardIndex) => cardIndex !== index),
    }));
    setActiveSentenceIndexes((indexes) => {
      return { ...indexes, [currentPage]: nextActiveIndex };
    });
    setSelectedWord(null);
    setBlankEditor(null);
  };

  const renderSentence = (card, index) => {
    let offset = 0;
    return cardParts(card).map((part, partIndex) => {
      if (part.type === "blank") {
        offset += part.value.length;
        return (
          <span
            className="blank-word-card"
            contentEditable={false}
            key={`blank-${part.id}`}
            data-blank-id={part.id}
            style={{ "--blank-card-width": `${blankCardWidth(part.value)}px` }}
            role="button"
            tabIndex={0}
            aria-label="Fill blank word card"
            onClick={() => {
              setEditorMode("word");
              setBlankEditor({ page: currentPage, index, id: part.id, value: part.value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setEditorMode("word");
                setBlankEditor({ page: currentPage, index, id: part.id, value: part.value });
              }
            }}
          >
            {part.value}
          </span>
        );
      }

      const partStart = offset;
      const partEnd = offset + part.value.length;
      offset = partEnd;
      return <span key={`text-${partIndex}`}>{part.value}</span>;
    });
  };

  const currentSentenceCards = sentenceCards[currentPage] ?? [];
  const hasSentence = currentSentenceCards.length > 0;
  const activeSentenceIndex = activeSentenceIndexes[currentPage];

  return (
    <main className="prototype-stage" aria-label="App prototype preview">
      <section
        className="app-screen"
        aria-label="375 by 812 pixel app screen"
        style={{
          "--back-icon": `url("${icon("back.svg")}")`,
          "--blank-word-card-icon": `url("${icon("blank-word-card.svg")}")`,
        }}
      >
        <header className="top-navigation">
          <button className="nav-button nav-back" type="button" aria-label="Back">
            <img src={icon("back.svg")} alt="" />
          </button>

          <h1
            className="editable-title"
            contentEditable
            suppressContentEditableWarning
            spellCheck="false"
            aria-label="Editable title"
          >
            Untitled
          </h1>

          <div className="nav-actions">
            <button className="nav-button" type="button" aria-label="Invite">
              <img src={icon("invite.svg")} alt="" />
            </button>
            <button className="nav-button" type="button" aria-label="Settings">
              <img src={icon("settings.svg")} alt="" />
            </button>
          </div>
        </header>

        <main className={`notebook-page notebook-page-${currentPageSide}`}>
          <img
            src={icon(`${currentPageSide}-page.svg`)}
            alt={`Page ${currentPage}, ${currentPageSide} page`}
          />
        </main>

        <nav className="page-navigation" aria-label="Page navigation">
          <button
            className="page-arrow page-arrow-previous"
            type="button"
            aria-label="Previous page"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          />
          <span>{currentPage} / {pageCount}</span>
          <button
            className="page-arrow page-arrow-next"
            type="button"
            aria-label="Next page"
            disabled={currentPage === pageCount}
            onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
          />
        </nav>

        <section className="sentence-area" aria-label="Sentence area">
          {currentSentenceCards.map((card, index) => (
            <div
              className={`edit-sentence-card${activeSentenceIndex === index ? " is-active" : ""}`}
              aria-label={`Sentence card ${index + 1}`}
              key={index}
              onClick={(event) => {
                setActiveSentenceIndexes((indexes) => ({ ...indexes, [currentPage]: index }));
                if (!event.target.closest(".blank-word-card, .delete-word-button")) {
                  event.currentTarget.querySelector(".sentence-text")?.focus();
                }
              }}
            >
              <img className="edit-sentence-background" src={icon("edit-sentence.svg")} alt="" />
              <img
                className="sentence-avatar"
                src={icon(`user-${card.avatar}.svg`)}
                alt={`User ${card.avatar}`}
              />
              <div className="sentence-editor">
                <div
                  className="sentence-text"
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-label={`Edit sentence ${index + 1}`}
                  onFocus={() => {
                    setActiveSentenceIndexes((indexes) => ({ ...indexes, [currentPage]: index }));
                    requestAnimationFrame(() => positionAddWordCardButton(index, document.activeElement));
                  }}
                  onInput={(event) => positionAddWordCardButton(index, event.currentTarget)}
                  onBlur={(event) => updateSentenceFromElement(index, event.currentTarget)}
                  onMouseUp={(event) => {
                    selectWord(index, event.currentTarget);
                    positionAddWordCardButton(index, event.currentTarget);
                  }}
                  onKeyUp={(event) => positionAddWordCardButton(index, event.currentTarget)}
                >
                  {renderSentence(card, index)}
                </div>
                {activeSentenceIndex === index && (
                  <button
                    className="add-word-card-button"
                    type="button"
                    aria-label="Add blank word card"
                    hidden
                    ref={(element) => {
                      if (element) addWordCardButtons.current[`${currentPage}-${index}`] = element;
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      appendBlankWordCard(index);
                    }}
                  >
                    <img src={icon("add-word-card.svg")} alt="" />
                  </button>
                )}
              </div>
              {activeSentenceIndex === index && (
                <button
                  className="delete-sentence-card-button"
                  type="button"
                  aria-label={`Delete sentence card ${index + 1}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteSentenceCard(index);
                  }}
                >
                  <img src={icon("delete-word.svg")} alt="" />
                </button>
              )}
              {selectedWord?.page === currentPage && selectedWord.index === index && (
                <button
                  className="delete-word-button"
                  type="button"
                  contentEditable={false}
                  aria-label="Delete selected word"
                  style={{ left: selectedWord.left, top: selectedWord.top }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={deleteSelectedWord}
                >
                  <img src={icon("delete-word.svg")} alt="" />
                </button>
              )}
            </div>
          ))}

          {currentSentenceCards.length < MAX_SENTENCE_CARDS && (
            <button className="add-sentence-button" type="button" onClick={addSentence}>
              <img src={icon("add-sentence.svg")} alt="Add sentence" />
            </button>
          )}

          {!hasSentence && (
            <div className="sentence-empty-state">
              <p>Start your first line</p>
              <p>write your own · or draw a prompt from the deck</p>
            </div>
          )}

        </section>

        <p className="sr-only" aria-live="polite">Page {currentPage} of {pageCount}</p>

        <button
          className="add-page-button"
          type="button"
          aria-label="Add page"
          onClick={addPage}
          onPointerDown={() => setIsAddPressed(true)}
          onPointerLeave={() => !releaseTimer.current && setIsAddPressed(false)}
        >
          <img
            src={icon(isAddPressed ? "add-page-pressed.svg" : "add-page-default.svg")}
            alt=""
          />
        </button>

        {blankEditor && (
          <div className="blank-word-dialog" role="dialog" aria-modal="true" aria-label="Add content">
            <section className="content-editor-sheet" onClick={(event) => event.stopPropagation()}>
              <button className="content-sheet-close" type="button" aria-label="Close editor" onClick={() => setBlankEditor(null)}>×</button>
              <nav className="content-editor-tabs" aria-label="Content type">
                {[
                  ["word", "Word"],
                  ["photo", "Photo"],
                  ["audio", "Audio"],
                ].map(([mode, label]) => (
                  <button
                    className={editorMode === mode ? "is-selected" : ""}
                    key={mode}
                    type="button"
                    onClick={() => setEditorMode(mode)}
                  >{label}</button>
                ))}
              </nav>

              {editorMode === "word" && (
                <div className="content-editor-mode word-mode">
                  <label className="word-entry" htmlFor="blank-word-entry">
                    <input
                      id="blank-word-entry"
                      autoFocus
                      ref={dialogInput}
                      defaultValue={blankEditor.value}
                      placeholder="Type a new word…"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          updateBlankWord(blankEditor.index, blankEditor.id, event.currentTarget.value);
                          setBlankEditor(null);
                        }
                        if (event.key === "Escape") setBlankEditor(null);
                      }}
                    />
                    <span>⌘ Tab</span>
                  </label>
                  <div className="word-categories">
                    {['All', 'Nature', 'Time', 'Place', 'Mood'].map((category, categoryIndex) => (
                      <button className={categoryIndex === 0 ? 'is-selected' : ''} key={category} type="button">{category}</button>
                    ))}
                  </div>
                  <label className="word-search" htmlFor="word-search"><input id="word-search" placeholder="Search a word…" /></label>
                  <div className="word-suggestions">
                    {['October', 'autumn', 'dusk', 'frost', 'Tuesday'].map((word) => (
                      <button key={word} type="button" onClick={() => {
                        updateBlankWord(blankEditor.index, blankEditor.id, word);
                        setBlankEditor(null);
                      }}>{word}</button>
                    ))}
                  </div>
                </div>
              )}

              {editorMode === "photo" && (
                <div className="content-editor-mode photo-mode">
                  <div className="content-actions"><button type="button">+ Take photo</button><button type="button">+ Choose photo</button></div>
                  <p>Recent</p><div className="recent-photo-grid">{Array.from({ length: 6 }, (_, index) => <button key={index} type="button" aria-label={`Recent photo ${index + 1}`} />)}</div>
                </div>
              )}

              {editorMode === "audio" && (
                <div className="content-editor-mode audio-mode">
                  <button className="record-button" type="button" aria-label="Hold to record">●</button><p>Hold to record</p>
                  <span className="recent-label">Recent</span>
                  {[12, 8, 10].map((duration, index) => <button className="audio-clip" key={index} type="button"><span>0:00</span><i /><span>0:{duration}</span><b>›</b></button>)}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
