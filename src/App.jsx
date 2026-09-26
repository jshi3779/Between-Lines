import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WORD_CATEGORIES, WORD_LIBRARY } from "./contentLibrary";

const MAX_SENTENCE_CARDS = 5;
const STARTER_SENTENCES = [
  "今晚，去格拉斯哥的末班车没有等我。",
  "你的字迹仍像一场雨。",
  "十月的光线如今落得不一样了。",
];
const USER_ACCENT_COLORS = ["#f6be45", "#3465d6", "#1d9c6c", "#ec4e99"];
const textPart = (value) => ({ type: "text", value });
const GUIDE_SENTENCE_CARDS = [
  {
    avatar: 3,
    parts: [textPart("按下空格键添加词卡")],
  },
  { avatar: 2, parts: [textPart("如今，十月的光落下来，已经不一样了。")] },
];
const cardParts = (card) => card.parts ?? [textPart(card.text ?? "")];
const WORD_CARD_WIDTHS = [44, 65, 81, 101, 125, 143];
const AUDIO_WAVEFORM = [4, 8, 12, 7, 15, 10, 6, 13, 17, 9, 5, 12, 8, 16, 11, 6, 14, 9, 17, 10, 5, 13, 8, 15];
const extractAudioWaveform = async (blob, barCount = AUDIO_WAVEFORM.length) => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return AUDIO_WAVEFORM;
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / barCount));
    const peaks = Array.from({ length: barCount }, (_, index) => {
      const start = index * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      let peak = 0;
      for (let sample = start; sample < end; sample += 1) peak = Math.max(peak, Math.abs(channel[sample]));
      return peak;
    });
    const maximum = Math.max(...peaks);
    if (maximum < 0.01) return peaks.map(() => 3);
    return peaks.map((peak) => Math.round(3 + (peak / maximum) * 14));
  } catch {
    return AUDIO_WAVEFORM;
  } finally {
    context.close();
  }
};
const limitWordCardValue = (value) => Array.from(value.trim()).slice(0, 6).join("");
const wordCardLength = (value) => Math.max(1, Math.min(6, Array.from(value).length));
const blankCardWidth = (value) => value ? WORD_CARD_WIDTHS[wordCardLength(value) - 1] : 88;
const formatDuration = (seconds) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
};
const icon = (file) => `${import.meta.env.BASE_URL}icons/${file}`;
const SAMPLE_PHOTOS = [{
  id: "default-photo",
  name: "格拉斯哥艺术学院",
  url: icon("default-photo.png"),
}];
const MANAGE_THUMBNAILS = Array.from({ length: 12 }, (_, index) => icon(`manage-thumb-${String(index + 1).padStart(2, "0")}.png`));
const MANAGE_LIBRARY_PHOTOS = MANAGE_THUMBNAILS.map((url, index) => ({ id: `library-photo-${index + 1}`, name: `素材 ${index + 1}`, url }));

export default function App() {
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [sentenceCards, setSentenceCards] = useState({ 1: GUIDE_SENTENCE_CARDS });
  const [activeSentenceIndexes, setActiveSentenceIndexes] = useState({ 1: 1 });
  const [selectedWord, setSelectedWord] = useState(null);
  const [blankEditor, setBlankEditor] = useState(null);
  const [editorMode, setEditorMode] = useState("word");
  const [editorPosition, setEditorPosition] = useState({ left: 30, top: 200, pointerLeft: 130, placement: "below" });
  const editorSheetRef = useRef(null);
  const sentenceAreaRef = useRef(null);
  useLayoutEffect(() => {
    if (!blankEditor) return;
    const anchor = document.querySelector(`[data-blank-id="${blankEditor.id}"]`);
    const screen = anchor?.closest(".app-screen");
    if (!anchor || !screen) return;
    const updatePosition = () => {
      const bounds = screen.getBoundingClientRect();
      const card = anchor.getBoundingClientRect();
      const scaleX = bounds.width / screen.offsetWidth;
      const scaleY = bounds.height / screen.offsetHeight;
      const width = Math.min(315, screen.clientWidth - 16);
      const height = editorSheetRef.current?.offsetHeight ?? 300;
      const pointerHeight = 26;
      const pointerOverlap = 12;
      const below = (card.bottom - bounds.top) / scaleY + pointerHeight - pointerOverlap;
      const above = (card.top - bounds.top) / scaleY - height - pointerHeight + pointerOverlap;
      const placeBelow = below + height <= screen.clientHeight - 8;
      const left = Math.max(8, Math.min(screen.clientWidth - width - 8, (card.left + card.width / 2 - bounds.left) / scaleX - width / 2));
      const cardCenter = (card.left + card.width / 2 - bounds.left) / scaleX;
      setEditorPosition({
        left,
        top: Math.max(8, Math.min(screen.clientHeight - height - 8, placeBelow ? below : above)),
        pointerLeft: Math.max(8, Math.min(width - 58, cardCenter - left - 25)),
        placement: placeBelow ? "below" : "above",
      });
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (editorSheetRef.current) observer.observe(editorSheetRef.current);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [blankEditor?.id, editorMode]);
  const [selectedWordCategory, setSelectedWordCategory] = useState("全部");
  const [wordSearch, setWordSearch] = useState("");
  const [hasSeedSentence, setHasSeedSentence] = useState(true);
  const [isAddPressed, setIsAddPressed] = useState(false);
  const [isPageOverviewOpen, setIsPageOverviewOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [manageSection, setManageSection] = useState("images");
  const [libraryMode, setLibraryMode] = useState("words");
  const [libraryCategory, setLibraryCategory] = useState("全部");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryWords, setLibraryWords] = useState(["十月", "秋天", "黄昏", "霜", "星期二"]);
  const [newLibraryWord, setNewLibraryWord] = useState("");
  const [pageTone, setPageTone] = useState("#fbfaf6");
  const [cardTone, setCardTone] = useState("#ffffff");
  const [inkTone, setInkTone] = useState("#242222");
  const [pagePattern, setPagePattern] = useState("plain");
  const [selectedSpreads, setSelectedSpreads] = useState([]);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [recentPhotos, setRecentPhotos] = useState([]);
  const [audioClips, setAudioClips] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingNotice, setRecordingNotice] = useState("");
  const [canAddSentence, setCanAddSentence] = useState(true);
  const [sentenceLineCounts, setSentenceLineCounts] = useState({});
  const [sentenceContentHeights, setSentenceContentHeights] = useState({});
  const releaseTimer = useRef(null);
  const blankId = useRef(5);
  const dialogInput = useRef(null);
  const skipSentenceBlur = useRef(new Set());
  const cameraInput = useRef(null);
  const photoInput = useRef(null);
  const managePhotoInput = useRef(null);
  const draggedBlank = useRef(null);
  const suppressBlankClick = useRef(false);
  const draggedSentence = useRef(null);
  const suppressSentenceClick = useRef(false);
  const photoUrls = useRef(new Set());
  const audioRecorder = useRef(null);
  const audioUrls = useRef(new Set());
  const recordingStartedAt = useRef(0);
  const currentPageSide = currentPage % 2 === 1 ? "left" : "right";

  useEffect(() => () => {
    clearTimeout(releaseTimer.current);
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
    audioRecorder.current?.stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const addRecentPhotos = (files) => {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    const nextPhotos = images.map((file) => {
      const url = URL.createObjectURL(file);
      photoUrls.current.add(url);
      return { id: `${file.name}-${file.lastModified}-${url}`, url, name: file.name || "已选图片" };
    });
    setRecentPhotos((photos) => [...nextPhotos, ...photos].slice(0, 12));
  };

  const insertPhotoCard = (photo) => {
    if (!blankEditor) return;
    const { page, index, id } = blankEditor;
    setSentenceCards((cards) => ({
      ...cards,
      [page]: (cards[page] ?? []).map((card, cardIndex) => cardIndex !== index ? card : {
        ...card,
        parts: cardParts(card).map((part) => part.type === "blank" && part.id === id
          ? { ...part, value: "", audio: undefined, photo: { url: photo.url, name: photo.name } }
          : part),
      }),
    }));
    setBlankEditor(null);
  };

  const insertAudioCard = (clip) => {
    if (!blankEditor) return;
    const { page, index, id } = blankEditor;
    setSentenceCards((cards) => ({
      ...cards,
      [page]: (cards[page] ?? []).map((card, cardIndex) => cardIndex !== index ? card : {
        ...card,
        parts: cardParts(card).map((part) => part.type === "blank" && part.id === id
          ? { ...part, value: "", photo: undefined, audio: { url: clip.url, duration: clip.duration, waveform: clip.waveform } }
          : part),
      }),
    }));
    setBlankEditor(null);
  };

  const playAudio = (event, url) => {
    event.stopPropagation();
    new Audio(url).play().catch(() => {});
  };

  const shareTo = async (channel) => {
    if (channel === "系统分享" && navigator.share) {
      try {
        await navigator.share({ title: "无标题", text: "邀请你一起在 Between Lines 里共写一句话。" });
        setShareNotice("已打开系统分享");
      } catch {
        return;
      }
    } else {
      setShareNotice(`已准备分享到${channel}`);
    }
    window.setTimeout(() => setShareNotice(""), 1800);
  };

  const startRecording = async () => {
    if (isRecording || audioRecorder.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setRecordingNotice("当前浏览器不支持录音");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      audioRecorder.current = recorder;
      recordingStartedAt.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        const duration = (Date.now() - recordingStartedAt.current) / 1000;
        stream.getTracks().forEach((track) => track.stop());
        if (chunks.length) {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const url = URL.createObjectURL(blob);
          const waveform = await extractAudioWaveform(blob);
          audioUrls.current.add(url);
          setAudioClips((clips) => [{ id: `${Date.now()}-${url}`, url, duration, waveform }, ...clips].slice(0, 8));
          setRecordingNotice("");
        }
        audioRecorder.current = null;
        setIsRecording(false);
      };
      recorder.start();
      setRecordingNotice("");
      setIsRecording(true);
    } catch {
      setRecordingNotice("未获得麦克风权限");
      setIsRecording(false);
      audioRecorder.current = null;
    }
  };

  const stopRecording = () => {
    const recorder = audioRecorder.current;
    if (recorder?.state === "recording") recorder.stop();
  };

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
    if (currentSentenceCards.length >= MAX_SENTENCE_CARDS || !canAddSentence) return;

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

  const pastePlainText = (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
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
    const limitedValue = limitWordCardValue(value);
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: (cards[currentPage] ?? []).map((card, cardIndex) =>
        cardIndex === index
          ? {
              ...card,
              parts: cardParts(card).map((part) =>
                part.type === "blank" && part.id === id
                  ? {
                      ...part,
                      value: limitedValue,
                      photo: undefined,
                      audio: undefined,
                      color: limitedValue ? part.color ?? USER_ACCENT_COLORS[Math.floor(Math.random() * USER_ACCENT_COLORS.length)] : undefined,
                    }
                  : part,
              ),
            }
          : card,
      ),
    }));
  };

  const modelOffsetAtCaret = (element, range) => {
    let offset = 0;
    for (let childIndex = 0; childIndex < element.childNodes.length; childIndex += 1) {
      const child = element.childNodes[childIndex];
      if (range.startContainer === element) {
        if (childIndex >= range.startOffset) return offset;
      } else if (child === range.startContainer || child.contains?.(range.startContainer)) {
        if (child instanceof HTMLElement && child.classList.contains("blank-word-card")) return offset;
        const localRange = document.createRange();
        localRange.selectNodeContents(child);
        localRange.setEnd(range.startContainer, range.startOffset);
        return offset + localRange.toString().length;
      }
      if (child instanceof HTMLElement && child.classList.contains("blank-word-card")) {
        const id = Number(child.dataset.blankId);
        const part = cardParts((sentenceCards[currentPage] ?? [])[Number(element.dataset.sentenceIndex)] ?? {})
          .find((item) => item.type === "blank" && item.id === id);
        offset += part?.value.length ?? 0;
      } else {
        offset += child.textContent?.length ?? 0;
      }
    }
    return offset;
  };

  const blankBeforeCaret = (element, range) => {
    let previous = null;
    if (range.startContainer === element) {
      previous = element.childNodes[range.startOffset - 1];
    } else {
      let topLevel = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentNode : range.startContainer;
      while (topLevel?.parentNode !== element) topLevel = topLevel?.parentNode;
      const beforeCaret = document.createRange();
      beforeCaret.selectNodeContents(topLevel);
      beforeCaret.setEnd(range.startContainer, range.startOffset);
      if (beforeCaret.toString().length === 0) previous = topLevel?.previousSibling;
    }
    return previous instanceof HTMLElement && previous.classList.contains("blank-word-card") ? previous : null;
  };

  const insertBlankWordCard = (index, element, range) => {
    const id = blankId.current + 1;
    blankId.current = id;
    const sourceParts = partsFromElement(index, element);
    const insertAt = modelOffsetAtCaret(element, range);
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
    skipSentenceBlur.current.add(`${currentPage}-${index}`);
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: (cards[currentPage] ?? []).map((card, cardIndex) =>
        cardIndex === index
          ? { ...card, parts }
          : card,
      ),
    }));
    requestAnimationFrame(() => {
      const nextCard = document.querySelector(`[data-blank-id="${id}"]`);
      const sentence = nextCard?.closest(".sentence-text");
      if (!nextCard || !sentence) return;
      sentence.focus();
      const selection = window.getSelection();
      const nextRange = document.createRange();
      nextRange.setStartAfter(nextCard);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    });
  };

  const removeBlankWordCard = (index, id, childIndex) => {
    skipSentenceBlur.current.add(`${currentPage}-${index}`);
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: (cards[currentPage] ?? []).map((card, cardIndex) => cardIndex === index
        ? { ...card, parts: cardParts(card).filter((part) => !(part.type === "blank" && part.id === id)) }
        : card),
    }));
    requestAnimationFrame(() => {
      const sentence = document.querySelector(`[data-sentence-index="${index}"]`);
      if (!sentence) return;
      sentence.focus();
      const selection = window.getSelection();
      const nextRange = document.createRange();
      const nextNode = sentence.childNodes[childIndex];
      if (nextNode) nextRange.setStartBefore(nextNode);
      else {
        nextRange.selectNodeContents(sentence);
        nextRange.collapse(false);
      }
      selection.removeAllRanges();
      selection.addRange(nextRange);
    });
  };

  const moveBlankContent = (sourceIndex, sourceId, targetIndex, targetId) => {
    if (sourceIndex === targetIndex && sourceId === targetId) return;
    setSentenceCards((cards) => {
      const pageCards = cards[currentPage] ?? [];
      const sourcePart = cardParts(pageCards[sourceIndex] ?? {}).find((part) => part.type === "blank" && part.id === sourceId);
      if (!sourcePart) return cards;
      return {
        ...cards,
        [currentPage]: pageCards.map((card, cardIndex) => ({
          ...card,
          parts: cardParts(card).map((part) => {
            if (part.type !== "blank") return part;
            if (cardIndex === sourceIndex && part.id === sourceId) {
              return { ...part, value: "", color: undefined, photo: undefined, audio: undefined };
            }
            if (cardIndex === targetIndex && part.id === targetId) {
              return { ...sourcePart, id: targetId };
            }
            return part;
          }),
        })),
      };
    });
    setBlankEditor(null);
  };

  const swapSentenceCards = (sourceIndex, targetIndex) => {
    if (sourceIndex === targetIndex) return;
    setSentenceCards((cards) => {
      const pageCards = [...(cards[currentPage] ?? [])];
      [pageCards[sourceIndex], pageCards[targetIndex]] = [pageCards[targetIndex], pageCards[sourceIndex]];
      return { ...cards, [currentPage]: pageCards };
    });
    setActiveSentenceIndexes((indexes) => {
      const active = indexes[currentPage];
      const nextActive = active === sourceIndex ? targetIndex : active === targetIndex ? sourceIndex : active;
      return { ...indexes, [currentPage]: nextActive };
    });
    setSelectedWord(null);
    setBlankEditor(null);
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
            className={`blank-word-card${part.photo ? " photo-word-card" : part.audio ? " audio-word-card" : part.value ? " is-filled" : ""}`}
            contentEditable={false}
            draggable
            key={`blank-${part.id}`}
            data-blank-id={part.id}
            style={{
              "--blank-card-width": `${blankCardWidth(part.value)}px`,
              "--blank-card-color": part.color ?? "#79746d",
              "--filled-word-card-icon": part.value ? `url("${icon(`word-card-green-${wordCardLength(part.value)}.svg`)}")` : undefined,
              "--audio-word-card-icon": part.audio ? `url("${icon("audio-word-card.svg")}")` : undefined,
            }}
            role="button"
            tabIndex={0}
            aria-label="填写空白词卡"
            onClick={() => {
              if (suppressBlankClick.current) return;
              setEditorMode(part.photo ? "photo" : part.audio ? "audio" : "word");
              setBlankEditor({ page: currentPage, index, id: part.id, value: part.value });
            }}
            onDragStart={(event) => {
              event.stopPropagation();
              draggedBlank.current = { index, id: part.id };
              suppressBlankClick.current = true;
              event.currentTarget.classList.add("is-dragging");
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", `${index}:${part.id}`);
            }}
            onDragOver={(event) => {
              event.stopPropagation();
              const source = draggedBlank.current;
              if (!source || (source.index === index && source.id === part.id)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              event.currentTarget.classList.add("is-drag-over");
            }}
            onDragLeave={(event) => {
              event.stopPropagation();
              event.currentTarget.classList.remove("is-drag-over");
            }}
            onDrop={(event) => {
              event.stopPropagation();
              event.preventDefault();
              event.currentTarget.classList.remove("is-drag-over");
              const source = draggedBlank.current;
              if (source) moveBlankContent(source.index, source.id, index, part.id);
              draggedBlank.current = null;
              window.setTimeout(() => { suppressBlankClick.current = false; }, 0);
            }}
            onDragEnd={(event) => {
              event.stopPropagation();
              event.currentTarget.classList.remove("is-dragging");
              document.querySelectorAll(".blank-word-card.is-drag-over").forEach((cardElement) => cardElement.classList.remove("is-drag-over"));
              draggedBlank.current = null;
              window.setTimeout(() => { suppressBlankClick.current = false; }, 0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setEditorMode(part.photo ? "photo" : part.audio ? "audio" : "word");
                setBlankEditor({ page: currentPage, index, id: part.id, value: part.value });
              }
            }}
          >
            {part.photo ? <>
              <img className="photo-card-frame" src={icon("photo-card.svg")} alt="" draggable={false} />
              <img className="photo-card-image" src={part.photo.url} alt={part.photo.name} draggable={false} />
            </> : part.audio ? <>
              <i className="audio-waveform" aria-hidden="true">{(part.audio.waveform ?? AUDIO_WAVEFORM).map((height, index) => <em key={index} style={{ height }} />)}</i><span>{formatDuration(part.audio.duration)}</span>
              <img
                className="audio-play-control"
                src={icon("audio-play.svg")}
                alt="播放录音"
                draggable={false}
                role="button"
                tabIndex={0}
                onClick={(event) => playAudio(event, part.audio.url)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") playAudio(event, part.audio.url);
                }}
              />
            </> : <span className="blank-word-card-label">{part.value}</span>}
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
  const visibleLibraryWords = WORD_LIBRARY.filter(({ word, category }) =>
    (selectedWordCategory === "全部" || category === selectedWordCategory)
    && word.includes(wordSearch.trim()),
  );
  const managedPhotos = [...recentPhotos, ...MANAGE_LIBRARY_PHOTOS];
  const managedWords = [...new Set([...libraryWords, ...WORD_LIBRARY.filter(({ category }) => libraryCategory === "全部" || category === libraryCategory).map(({ word }) => word)])]
    .filter((word) => word.includes(librarySearch.trim()));
  const managedSentences = Object.values(sentenceCards).flat().map((card) => cardParts(card).map((part) => part.value).join("")).filter(Boolean);

  useLayoutEffect(() => {
    const area = sentenceAreaRef.current;
    if (!area) return;
    const measure = () => {
      const cards = Array.from(area.querySelectorAll(":scope > .edit-sentence-card"));
      const usedHeight = cards.reduce((total, card) => {
        const style = window.getComputedStyle(card);
        return total + card.offsetHeight + Number.parseFloat(style.marginBottom || 0);
      }, 0);
      const nextCardHeight = 110;
      const addButtonHeight = 60;
      const availableHeight = 545;
      setCanAddSentence(cards.length < MAX_SENTENCE_CARDS && usedHeight + nextCardHeight + addButtonHeight <= availableHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    area.querySelectorAll(":scope > .edit-sentence-card").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [currentPage, currentSentenceCards]);

  useLayoutEffect(() => {
    const area = sentenceAreaRef.current;
    if (!area) return undefined;
    const measureLines = () => {
      const next = {};
      const nextHeights = {};
      area.querySelectorAll(":scope > .edit-sentence-card .sentence-text").forEach((textElement, index) => {
        const lineHeight = Number.parseFloat(getComputedStyle(textElement).lineHeight) || 22;
        next[`${currentPage}-${index}`] = Math.max(1, Math.ceil(textElement.scrollHeight / lineHeight));
        nextHeights[`${currentPage}-${index}`] = Math.ceil(textElement.scrollHeight);
      });
      setSentenceLineCounts((previous) => {
        const unchanged = Object.entries(next).every(([key, value]) => previous[key] === value);
        return unchanged ? previous : { ...previous, ...next };
      });
      setSentenceContentHeights((previous) => {
        const unchanged = Object.entries(nextHeights).every(([key, value]) => previous[key] === value);
        return unchanged ? previous : { ...previous, ...nextHeights };
      });
    };
    const frame = requestAnimationFrame(measureLines);
    const observer = new ResizeObserver(measureLines);
    area.querySelectorAll(":scope > .edit-sentence-card .sentence-text").forEach((textElement) => observer.observe(textElement));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [currentPage, currentSentenceCards]);

  return (
    <main className="prototype-stage" aria-label="应用原型预览">
      <section
        className="app-screen"
        aria-label="375 × 812 像素应用屏幕"
        style={{
          "--back-icon": `url("${icon("back.svg")}")`,
          "--blank-word-card-icon": `url("${icon("blank-word-card.svg")}")`,
          "--page-tone": pageTone,
          "--card-tone": cardTone,
          "--ink-tone": inkTone,
        }}
      >
        <header className="top-navigation">
          <button className="nav-button nav-back" type="button" aria-label="返回">
            <img src={icon("back.svg")} alt="" />
          </button>
          <button
            className="nav-button nav-page-overview"
            type="button"
            aria-label="查看所有页面"
            onClick={() => setIsPageOverviewOpen(true)}
          >
            <img src={icon("view-all-pages.svg")} alt="" />
          </button>
          <h1
            className="editable-title"
            contentEditable
            suppressContentEditableWarning
            spellCheck="false"
            aria-label="可编辑标题"
          >
            无标题
          </h1>

          <div className="nav-actions">
            <button className="nav-button" type="button" aria-label="分享笔记本" onClick={() => setIsShareOpen(true)}>
              <img src={icon("invite.svg")} alt="" />
            </button>
            <button className="nav-button" type="button" aria-label="设置" onClick={() => setIsManageOpen(true)}>
              <img src={icon("settings.svg")} alt="" />
            </button>
          </div>
        </header>

        {isPageOverviewOpen && (
          <section className="page-overview" aria-label="全部页面总览">
            <div className="page-overview-header">
              <button type="button" aria-label="返回笔记本" onClick={() => setIsPageOverviewOpen(false)}><img src={icon("back.svg")} alt="" /></button>
              <h2>所有页面</h2>
              <button type="button" aria-label="分享笔记本" onClick={() => setIsShareOpen(true)}><img src={icon("overview-export.svg")} alt="" /></button>
            </div>
            <p>共 {pageCount} 页</p>
            <div className="page-overview-grid">
              {Array.from({ length: Math.ceil(pageCount / 2) }, (_, index) => {
                const page = index * 2 + 1;
                const lastPage = Math.min(page + 1, pageCount);
                const isSelected = selectedSpreads.includes(page);
                const sentenceCount = (sentenceCards[page] ?? []).length + (lastPage > page ? (sentenceCards[lastPage] ?? []).length : 0);
                return (
                  <div className="overview-card-container" key={page}>
                  <button
                    className="page-overview-card"
                    type="button"
                    aria-label={`打开第 ${page}${lastPage > page ? `–${lastPage}` : ""} 页`}
                    onClick={() => {
                      setCurrentPage(currentPage >= page && currentPage <= lastPage ? currentPage : page);
                      setIsPageOverviewOpen(false);
                    }}
                  >
                    <div className="overview-book">
                      <img className="overview-spread-image" src={icon(isSelected ? "spread-thumbnail-selected.svg" : "spread-thumbnail-unselected.svg")} alt="双页展开缩略图" />
                    </div>
                    <span className="overview-card-caption">第 {page}{lastPage > page ? `–${lastPage}` : ""} 页 · {sentenceCount} 个句子</span>
                  </button>
                  <button
                    type="button"
                    className="overview-select-toggle"
                    aria-label={`${isSelected ? "取消选择" : "选择"}第 ${page}${lastPage > page ? `–${lastPage}` : ""} 页`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedSpreads((selected) => selected.includes(page) ? selected.filter((item) => item !== page) : [...selected, page])}
                  >
                    {!isSelected && <img src={icon("spread-select.svg")} alt="" />}
                  </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {isShareOpen && (
          <div className="share-dialog" role="dialog" aria-modal="true" aria-label="分享笔记本" onClick={() => setIsShareOpen(false)}>
            <section className="share-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="content-editor-sheet-background" aria-hidden="true">
                <img className="panel-top" src={icon("panel-top.svg")} alt="" />
                <img className="panel-middle" src={icon("panel-middle.svg")} alt="" />
                <img className="panel-bottom" src={icon("panel-bottom.svg")} alt="" />
              </div>
              <div className="share-sheet-handle" />
              <h2>分享笔记本</h2>
              <p>邀请朋友一起把句子写完</p>
              <div className="share-channel-grid">
                {[
                  ["微信", "wechat"],
                  ["朋友圈", "moments"],
                  ["小红书", "redbook"],
                  ["抖音", "douyin"],
                  ["复制链接", "link"],
                  ["系统分享", "system"],
                ].map(([label, tone]) => (
                  <button key={label} type="button" className={`share-channel ${tone}`} onClick={() => shareTo(label)}>
                    <span>{tone === "link" ? "↗" : tone === "system" ? "···" : label.slice(0, 1)}</span>
                    <small>{label}</small>
                  </button>
                ))}
              </div>
              <button className="share-cancel" type="button" onClick={() => setIsShareOpen(false)}>取消</button>
            </section>
          </div>
        )}

        {shareNotice && <div className="share-notice" role="status">{shareNotice}</div>}

        <div className="user-labels" aria-label="笔记本协作者">
          {[1, 2, 3, 4].map((user) => (
            <img key={user} src={icon(`user-label-${user}.svg`)} alt={`用户 ${user}`} />
          ))}
        </div>

        <main className={`notebook-page notebook-page-${currentPageSide} page-pattern-${pagePattern}`}>
          <img
            className="notebook-spread-image"
            src={icon("notebook-spread.png")}
            alt={`第 ${currentPage} 页`}
          />
        </main>

        <nav className="page-navigation" aria-label="页面导航">
          <button
            className="page-arrow page-arrow-previous"
            type="button"
            aria-label="上一页"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          />
          <span>{currentPage} / {pageCount}</span>
          <button
            className="page-arrow page-arrow-next"
            type="button"
            aria-label="下一页"
            disabled={currentPage === pageCount}
            onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
          />
        </nav>

        <section ref={sentenceAreaRef} className="sentence-area" aria-label="句子区域">
          {currentSentenceCards.map((card, index) => {
            const visualLines = sentenceLineCounts[`${currentPage}-${index}`] ?? 1;
            const assetLines = Math.min(3, visualLines);
            const contentHeight = sentenceContentHeights[`${currentPage}-${index}`] ?? 22;
            const cardHeight = visualLines > 3 ? Math.max(62, contentHeight + 20) : 70 + (visualLines - 1) * 30;
            return (
            <div
              className={`edit-sentence-card sentence-lines-${assetLines}${visualLines > 3 ? " is-extended" : ""}${activeSentenceIndex === index ? " is-active" : ""}`}
              style={{ "--sentence-card-height": `${cardHeight}px` }}
              aria-label={`第 ${index + 1} 个句子卡`}
              key={index}
              draggable
              onClick={(event) => {
                if (suppressSentenceClick.current) return;
                setActiveSentenceIndexes((indexes) => indexes[currentPage] === index ? indexes : { ...indexes, [currentPage]: index });
                if (!event.target.closest(".blank-word-card, .delete-word-button")) {
                  event.currentTarget.querySelector(".sentence-text")?.focus();
                }
              }}
              onDragStart={(event) => {
                if (event.target.closest?.(".blank-word-card")) return;
                draggedSentence.current = index;
                suppressSentenceClick.current = true;
                event.currentTarget.classList.add("is-dragging");
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", `sentence:${index}`);
              }}
              onDragOver={(event) => {
                if (draggedSentence.current === null || draggedSentence.current === index) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                event.currentTarget.classList.add("is-drag-over");
              }}
              onDragLeave={(event) => event.currentTarget.classList.remove("is-drag-over")}
              onDrop={(event) => {
                if (draggedSentence.current === null) return;
                event.preventDefault();
                event.currentTarget.classList.remove("is-drag-over");
                swapSentenceCards(draggedSentence.current, index);
                draggedSentence.current = null;
                window.setTimeout(() => { suppressSentenceClick.current = false; }, 0);
              }}
              onDragEnd={(event) => {
                event.currentTarget.classList.remove("is-dragging");
                document.querySelectorAll(".edit-sentence-card.is-drag-over").forEach((cardElement) => cardElement.classList.remove("is-drag-over"));
                draggedSentence.current = null;
                window.setTimeout(() => { suppressSentenceClick.current = false; }, 0);
              }}
            >
              <span className="edit-sentence-background" aria-hidden="true" />
              <img
                className="sentence-avatar"
                src={icon(`user-${card.avatar}.svg`)}
                alt={`用户 ${card.avatar}`}
              />
              <div className="sentence-editor">
                <div
                  key={`sentence-${currentPage}-${index}-${JSON.stringify(cardParts(card).map((part) => [part.type, part.id, part.value, part.photo?.url, part.audio?.url]))}`}
                  className="sentence-text"
                  data-sentence-index={index}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-label={`编辑第 ${index + 1} 个句子`}
                  onFocus={() => {
                    setActiveSentenceIndexes((indexes) => indexes[currentPage] === index ? indexes : { ...indexes, [currentPage]: index });
                  }}
                  onBeforeInput={(event) => {
                    if (event.nativeEvent.inputType === "insertParagraph") event.preventDefault();
                  }}
                  onPaste={(event) => {
                    pastePlainText(event);
                  }}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    const selection = window.getSelection();
                    if (!selection?.rangeCount) return;
                    const range = selection.getRangeAt(0);
                    if (!event.currentTarget.contains(range.startContainer)) return;
                    if (event.key === " " || event.code === "Space") {
                      event.preventDefault();
                      insertBlankWordCard(index, event.currentTarget, range);
                      return;
                    }
                    if (event.key === "Backspace" && range.collapsed) {
                      const blank = blankBeforeCaret(event.currentTarget, range);
                      if (!blank) return;
                      event.preventDefault();
                      const childIndex = Array.from(event.currentTarget.childNodes).indexOf(blank);
                      removeBlankWordCard(index, Number(blank.dataset.blankId), childIndex);
                    }
                  }}
                  onBlur={(event) => {
                    const key = `${currentPage}-${index}`;
                    if (skipSentenceBlur.current.delete(key)) return;
                    updateSentenceFromElement(index, event.currentTarget);
                  }}
                  onMouseUp={(event) => selectWord(index, event.currentTarget)}
                >
                  {renderSentence(card, index)}
                </div>
              </div>
              {activeSentenceIndex === index && (
                <button
                  className="delete-sentence-card-button"
                  type="button"
                  aria-label={`删除第 ${index + 1} 个句子卡`}
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
                  aria-label="删除选中的词"
                  style={{ left: selectedWord.left, top: selectedWord.top }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={deleteSelectedWord}
                >
                  <img src={icon("delete-word.svg")} alt="" />
                </button>
              )}
            </div>
          )})}

          {canAddSentence && (
            <button className="add-sentence-button" type="button" onClick={addSentence}>
              <img src={icon("add-sentence.svg")} alt="添加句子" />
            </button>
          )}

          {!hasSentence && (
            <div className="sentence-empty-state">
              <p>写下你的第一句话</p>
              <p>自己写下 · 或从卡组中抽取提示</p>
            </div>
          )}

        </section>

        <p className="sr-only" aria-live="polite">第 {currentPage} 页，共 {pageCount} 页</p>

        <button
          className="add-page-button"
          type="button"
          aria-label="添加页面"
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
          <div className="blank-word-dialog" role="dialog" aria-modal="true" aria-label="添加内容">
            <section
              ref={editorSheetRef}
              className={`content-editor-sheet is-${editorMode}`}
              data-placement={editorPosition.placement}
              style={{ left: editorPosition.left, top: editorPosition.top, "--editor-pointer-left": `${editorPosition.pointerLeft}px` }}
              onClick={(event) => event.stopPropagation()}
            >
              <img className="content-editor-pointer" src={icon("editor-pointer.svg")} alt="" aria-hidden="true" />
              <div className="content-editor-sheet-background" aria-hidden="true">
                <img className="panel-top" src={icon("panel-top.svg")} alt="" />
                <img className="panel-middle" src={icon("panel-middle.svg")} alt="" />
                <img className="panel-bottom" src={icon("panel-bottom.svg")} alt="" />
              </div>
              <button className="content-sheet-close" type="button" aria-label="关闭编辑器" onClick={() => setBlankEditor(null)}>×</button>
              <nav className="content-editor-tabs" aria-label="内容类型">
                {["word", "photo", "audio"].map((mode) => (
                  <button
                    className={editorMode === mode ? "is-selected" : ""}
                    key={mode}
                    type="button"
                    onClick={() => setEditorMode(mode)}
                  >
                    <img
                      src={icon(`content-tab-${mode}-${editorMode === mode ? "selected" : "default"}.svg`)}
                      alt={{ word: "词", photo: "图片", audio: "音频" }[mode]}
                    />
                  </button>
                ))}
              </nav>

              <div className={`content-editor-scroll${editorMode === "audio" ? " is-audio" : ""}`}>
              {editorMode === "word" && (
                <div className="content-editor-mode word-mode">
                  <label className="word-entry" htmlFor="blank-word-entry">
                    <input
                      id="blank-word-entry"
                      autoFocus
                      ref={dialogInput}
                      defaultValue={blankEditor.value}
                      maxLength={6}
                      placeholder="输入一个新词…"
                      onInput={(event) => {
                        const limitedValue = Array.from(event.currentTarget.value).slice(0, 6).join("");
                        if (event.currentTarget.value !== limitedValue) event.currentTarget.value = limitedValue;
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          updateBlankWord(blankEditor.index, blankEditor.id, event.currentTarget.value);
                          setBlankEditor(null);
                        }
                        if (event.key === "Escape") setBlankEditor(null);
                      }}
                    />
                    <button
                      type="button"
                      aria-label="将词填入空白词卡"
                      onClick={() => {
                        updateBlankWord(blankEditor.index, blankEditor.id, dialogInput.current?.value ?? "");
                        setBlankEditor(null);
                      }}
                    >Add</button>
                  </label>
                  <div className="word-categories">
                    {WORD_CATEGORIES.map((category) => (
                      <button
                        className={selectedWordCategory === category ? "is-selected" : ""}
                        key={category}
                        type="button"
                        onClick={() => setSelectedWordCategory(category)}
                      >{category}</button>
                    ))}
                  </div>
                  <label className="word-search" htmlFor="word-search"><input id="word-search" placeholder="搜索一个词…" aria-label="搜索词语" value={wordSearch} onChange={(event) => setWordSearch(event.target.value)} /></label>
                  <div className="word-suggestions">
                    {visibleLibraryWords.map(({ word }) => (
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
                  <div className="content-actions">
                    <button type="button" aria-label="拍照" onClick={() => cameraInput.current?.click()}><img src={icon("camera-button.svg")} alt="" draggable={false} /></button>
                    <button type="button" aria-label="选择图片" onClick={() => photoInput.current?.click()}><img src={icon("photo-picker-button.svg")} alt="" draggable={false} /></button>
                  </div>
                  <input
                    ref={cameraInput}
                    className="visually-hidden"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="使用相机拍照"
                    onChange={(event) => {
                      addRecentPhotos(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={photoInput}
                    className="visually-hidden"
                    type="file"
                    accept="image/*"
                    multiple
                    aria-label="从设备选择图片"
                    onChange={(event) => {
                      addRecentPhotos(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <p>最近使用</p>
                  <div className="recent-photo-grid">
                    {[...recentPhotos, ...SAMPLE_PHOTOS, ...MANAGE_LIBRARY_PHOTOS].map((photo) => (
                      <button key={photo.id} type="button" className={`uploaded-photo${photo.id === "default-photo" ? " is-pre-rotated" : ""}`} aria-label={`选择图片：${photo.name}`} onClick={() => insertPhotoCard(photo)}>
                        <img src={photo.url} alt="" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editorMode === "audio" && (
                <div className="content-editor-mode audio-mode">
                  <div className="audio-recorder-fixed">
                    <button
                      className={`record-button${isRecording ? " is-recording" : ""}`}
                      type="button"
                      aria-label={isRecording ? "松开以结束录音" : "按住录音"}
                      onPointerDown={startRecording}
                      onPointerUp={stopRecording}
                      onPointerLeave={stopRecording}
                      onPointerCancel={stopRecording}
                    >
                      <img src={icon("record-toggle.svg")} alt="" draggable={false} />
                    </button>
                    <p>{isRecording ? "正在录音… 松开结束" : "按住录音"}</p>
                    {recordingNotice && <span className="recording-notice" role="status">{recordingNotice}</span>}
                  </div>
                  <div className="audio-recordings">
                    <span className="recent-label">最近使用</span>
                    {audioClips.length ? audioClips.map((clip) => (
                      <button className="audio-clip" key={clip.id} type="button" aria-label={`填入录音，时长 ${formatDuration(clip.duration)}`} onClick={() => insertAudioCard(clip)}>
                        <span>0:00</span><i className="audio-waveform" aria-hidden="true">{(clip.waveform ?? AUDIO_WAVEFORM).map((height, index) => <em key={index} style={{ height }} />)}</i><span>{formatDuration(clip.duration)}</span>
                        <img className="audio-play-control" src={icon("audio-play.svg")} alt="播放录音" draggable={false} onClick={(event) => playAudio(event, clip.url)} />
                      </button>
                    )) : <p className="audio-empty-state">录制的声音会出现在这里</p>}
                  </div>
                </div>
              )}
              </div>
            </section>
          </div>
        )}

        {isManageOpen && (
          <section className={`manage-screen manage-screen-${manageSection}`} aria-label="管理页面">
            <div className="manage-paper" aria-hidden="true" style={{ "--manage-page-mask": `url("${icon(manageSection === "cards" ? "library-page-mask.svg" : "manage-page-mask.svg")}")` }} />
            {manageSection !== "cards" && <>
              <img className="manage-line manage-line-top" src={icon("manage-line-top.svg")} alt="" />
              <img className="manage-line manage-line-bottom" src={icon("manage-line-bottom.svg")} alt="" />
            </>}
            <button className="manage-back" type="button" aria-label="返回笔记本" onClick={() => setIsManageOpen(false)}>
              <img src={icon(manageSection === "cards" ? "library-back.svg" : "manage-back.svg")} alt="" />
            </button>
            <h2>{manageSection === "images" ? "图片管理" : manageSection === "audio" ? "音频管理" : manageSection === "settings" ? "内页与颜色" : "管理"}</h2>
            {manageSection === "images" ? <>
              <div className="manage-grid" aria-label="图片素材">
                {managedPhotos.map((photo) => <img key={photo.id} src={photo.url} alt={photo.name} />)}
                <button className="manage-add" type="button" aria-label="添加图片" onClick={() => managePhotoInput.current?.click()}>+</button>
              </div>
              <input
                ref={managePhotoInput}
                className="visually-hidden"
                type="file"
                accept="image/*"
                multiple
                aria-label="向图片资料库添加图片"
                onChange={(event) => {
                  addRecentPhotos(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </> : manageSection === "audio" ? <div className="manage-audio-library">
              <div className="manage-audio-list">
                {audioClips.length ? audioClips.map((clip) => (
                  <article className="manage-audio-item" key={clip.id}>
                    <span>0:00</span>
                    <i className="audio-waveform" aria-hidden="true">{(clip.waveform ?? AUDIO_WAVEFORM).map((height, barIndex) => <em key={barIndex} style={{ height }} />)}</i>
                    <span>{formatDuration(clip.duration)}</span>
                    <button type="button" aria-label={`播放录音，时长 ${formatDuration(clip.duration)}`} onClick={(event) => playAudio(event, clip.url)}>
                      <img src={icon("audio-play.svg")} alt="" draggable={false} />
                    </button>
                  </article>
                )) : <div className="manage-audio-empty">还没有录音<br /><small>在笔记本的 AUDIO 板块录音后会显示在这里</small></div>}
              </div>
            </div> : manageSection === "settings" ? <div className="appearance-library">
              <section>
                <h3>内页样式</h3>
                <div className="appearance-patterns">
                  {[['plain', '空白'], ['lined', '横线'], ['grid', '方格'], ['dots', '点阵']].map(([value, label]) => (
                    <button className={pagePattern === value ? "is-selected" : ""} key={value} type="button" onClick={() => setPagePattern(value)}>
                      <span className={`pattern-preview pattern-${value}`} />{label}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h3>纸张颜色</h3>
                <div className="appearance-colors">
                  {["#fbfaf6", "#f5f0df", "#eef3ed", "#edf2f7", "#f6ecee", "#e9e7df"].map((color) => <button className={pageTone === color ? "is-selected" : ""} key={color} type="button" aria-label={`纸张颜色 ${color}`} style={{ background: color }} onClick={() => setPageTone(color)} />)}
                </div>
              </section>
              <section>
                <h3>句卡颜色</h3>
                <div className="appearance-colors">
                  {["#ffffff", "#f5eedc", "#e6f1eb", "#e9eef9", "#f7e6ec", "#e8e5df"].map((color) => <button className={cardTone === color ? "is-selected" : ""} key={color} type="button" aria-label={`句卡颜色 ${color}`} style={{ background: color }} onClick={() => setCardTone(color)} />)}
                </div>
              </section>
              <section>
                <h3>文字颜色</h3>
                <div className="appearance-colors appearance-ink-colors">
                  {["#242222", "#365f4b", "#315fa8", "#8a4a61", "#725a35", "#666666"].map((color) => <button className={inkTone === color ? "is-selected" : ""} key={color} type="button" aria-label={`文字颜色 ${color}`} style={{ background: color }} onClick={() => setInkTone(color)} />)}
                </div>
              </section>
              <button className="appearance-reset" type="button" onClick={() => { setPageTone("#fbfaf6"); setCardTone("#ffffff"); setInkTone("#242222"); setPagePattern("plain"); }}>恢复默认</button>
            </div> : <div className="library-content">
              <nav className="library-kind-tabs" aria-label="资料库类型">
                <button className={libraryMode === "words" ? "is-selected" : ""} type="button" onClick={() => setLibraryMode("words")}>词语</button>
                <button className={libraryMode === "sentences" ? "is-selected" : ""} type="button" onClick={() => setLibraryMode("sentences")}>句子</button>
              </nav>
              {libraryMode === "words" ? <>
                <form className="library-add-word" onSubmit={(event) => {
                  event.preventDefault();
                  const word = limitWordCardValue(newLibraryWord);
                  if (word && !libraryWords.includes(word)) setLibraryWords((words) => [word, ...words]);
                  setNewLibraryWord("");
                }}>
                  <input value={newLibraryWord} maxLength={6} placeholder="输入新词…" onChange={(event) => setNewLibraryWord(event.currentTarget.value)} />
                  <button type="submit">＋ 添加</button>
                </form>
                <div className="library-categories">
                  {["全部", "自然", "时间", "地点", "情绪"].map((category) => <button className={libraryCategory === category ? "is-selected" : ""} key={category} type="button" onClick={() => setLibraryCategory(category)}>{category}</button>)}
                  <button type="button">＋</button>
                </div>
                <label className="library-search">
                  <input value={librarySearch} placeholder="搜索词语…" onChange={(event) => setLibrarySearch(event.currentTarget.value)} />
                </label>
                <div className="library-word-list">
                  {managedWords.map((word, index) => <button key={word} type="button" style={{ backgroundImage: `url("${icon(`library-word-${index % 5 + 1}.svg`)}")` }}>{word}</button>)}
                </div>
              </> : <div className="library-sentence-list">
                {managedSentences.map((sentence, index) => <article key={`${sentence}-${index}`}>{sentence}</article>)}
              </div>}
            </div>}
            <nav className="manage-tabs" aria-label="管理类型">
              <button type="button" aria-label="图片管理" onClick={() => setManageSection("images")}>
                {manageSection === "images" ? <img src={icon("manage-tab-image.svg")} alt="" /> : <span className="library-image-tab"><img src={icon("library-tab-image-base.svg")} alt="" /><img src={icon("library-tab-image-icon.svg")} alt="" /></span>}
              </button>
              <button type="button" aria-label="音频管理" onClick={() => setManageSection("audio")}><img src={icon(manageSection === "audio" ? "manage-tab-audio-selected.svg" : manageSection === "cards" ? "library-tab-audio.svg" : "manage-tab-audio.svg")} alt="" /></button>
              <button type="button" aria-label="卡片管理" onClick={() => setManageSection("cards")}><img src={icon(manageSection === "cards" ? "library-tab-cards.svg" : "manage-tab-cards.svg")} alt="" /></button>
              <button type="button" aria-label="内页与颜色" onClick={() => setManageSection("settings")}><img src={icon(manageSection === "settings" ? "manage-tab-settings-selected.svg" : "manage-tab-settings.svg")} alt="" /></button>
            </nav>
          </section>
        )}
      </section>
    </main>
  );
}
