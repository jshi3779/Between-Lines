import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { SENTENCE_LIBRARY, WORD_CATEGORIES, WORD_LIBRARY } from "./contentLibrary";
import { SAMPLE_CAPSULES, pagesForCapsules } from "./sampleCapsules";
import { LIBRARY_KEY, loadJSON, loadMedia, notebookKey, saveJSON, saveMedia } from "./storage";

// A page holds as many cards as fit above its bottom rule (drawn at y≈780 on the 812 canvas);
// the sentence area starts at y=190, so content may run to y=776.
const SENTENCE_AREA_HEIGHT = 776 - 190;
// 42px avatar + 10px padding top and bottom; each extra text line adds 30px.
const SENTENCE_CARD_MIN_HEIGHT = 62;
const SENTENCE_CARD_GAP = 4;
const PAGE_WIDTH = 375;
const PAGE_GAP = 24;
// The add-page gap is wide enough to hold the indicator and its label; it is fully
// revealed exactly when the pull reaches the threshold, so the ring completes as the gap opens.
const ADD_PAGE_GAP = 110;
const ADD_PAGE_THRESHOLD = 110;
const PAGE_TURN_DISTANCE = 90;
const PAGE_SETTLE_MS = 280;
const CARD_TOOLBAR_WIDTH = 248;
const CARD_TOOLBAR_HEIGHT = 62;
const CARD_TOOLBAR_GAP = 8;
const CARD_TOOLBAR_MIN_TOP = 96;
const PAGE_SWIPE_BLOCKERS = "button, input, textarea, [contenteditable='true'], .edit-sentence-card, .card-toolbar, .blank-word-card";
const STARTER_SENTENCES = [
  "今晚，去格拉斯哥的末班车没有等我。",
  "你的字迹仍像一场雨。",
  "十月的光线如今落得不一样了。",
];
// Collaborators, in the order of their tags at the top of the page. A word card takes the colour
// of whoever filled it in, and a new sentence card carries that person's avatar.
const USERS = {
  1: { name: "阿禾", color: "#f6be45" },
  2: { name: "小满", color: "#ec4e99" },
  3: { name: "叶子", color: "#3465d6" },
  4: { name: "南风", color: "#1d9c6c" },
};
// The "watch friends write" demo: each step is one collaborator writing a sentence (BLANK marks a
// word card left for someone else) or filling the next empty word card on the demo page.
const BLANK = null;
const COLLAB_SCRIPT = [
  { user: 3, write: ["黄昏把影子", BLANK, "得很长"] },
  { user: 2, fill: "拉" },
  { user: 4, write: ["我们在", BLANK, "等一辆不来的车"] },
  { user: 1, fill: "站台" },
  { user: 2, write: ["风翻过", BLANK, "，替你读完"] },
  { user: 3, fill: "信封" },
  { user: 1, write: ["那句没写完的", BLANK] },
  { user: 4, fill: "晚安" },
];
const textPart = (value) => ({ type: "text", value });
// Capsule dates are "YYYY-MM-DD" keys (local time), so they compare correctly as strings.
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const daysUntil = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  const today = new Date();
  return Math.round((new Date(year, month - 1, day) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
};
const capsuleOpenLabel = (key) => {
  const days = daysUntil(key);
  if (days < 14) return `${days}天后开启`;
  if (days < 60) return `${Math.round(days / 7)}周后开启`;
  if (days < 360) return `${Math.round(days / 30)}个月后开启`;
  return `${Math.round(days / 365)}年后开启`;
};
// New blank ids must stay above every id already saved in the notebook.
const maxBlankId = (cards) => Math.max(5, ...Object.values(cards ?? {}).flat()
  .flatMap((card) => (card.parts ?? []).filter((part) => part.type === "blank").map((part) => part.id)));
// Uploaded photos and recordings carry a mediaId pointing at their bytes in IndexedDB; their
// object URLs only live for this page load, so they are dropped when saving and rebuilt on load.
const withoutMediaUrl = (item) => (item?.mediaId ? { ...item, url: "" } : item);
const mapCardMedia = (cards, map) => Object.fromEntries(Object.entries(cards).map(([page, list]) => [page, list.map((card) => (card.parts
  ? { ...card, parts: card.parts.map((part) => (part.photo || part.audio ? { ...part, photo: part.photo && map(part.photo), audio: part.audio && map(part.audio) } : part)) }
  : card))]));
const newMediaId = (kind) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CARET_ANCHOR = "​";
const withoutCaretAnchor = (value) => value.replaceAll(CARET_ANCHOR, "");
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

// Drawn on a 32px grid to sit inside the 51px brush discs, same as the image tab's glyph.
const SentenceCardGlyph = ({ className, color }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.2 8.6c6.6-.4 13.2-.5 19.7-.2.5 4.8.4 9.7.1 14.6-6.6.4-13.2.4-19.8.1-.4-4.8-.4-9.7 0-14.5Z" />
    <path d="M10 13.2h12M10 17.2h8.4" />
  </svg>
);

// The dashed pill is the blank word card itself, i.e. what the button drops into the sentence.
const WordCardGlyph = ({ className, color }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M10 10.6h12a5.4 5.4 0 0 1 0 10.8H10a5.4 5.4 0 0 1 0-10.8Z" strokeDasharray="3.1 2.7" />
  </svg>
);

// Unselected tabs are a solid brush disc with a light glyph, selected ones an empty brush ring
// with a dark glyph — the same pairing the existing image/audio/settings tab art uses.
// A library item with its own small delete button (a wrapper, since buttons can't nest).
const Deletable = ({ className = "", label, onDelete, compact = false, children }) => (
  <div className={`library-item ${className}`.trim()}>
    {children}
    <button
      className="library-item-delete"
      type="button"
      aria-label={`删除${label}`}
      onClick={(event) => { event.stopPropagation(); onDelete(); }}
    >{compact ? <span aria-hidden="true">×</span> : <img src={icon("delete-word.svg")} alt="" draggable={false} />}</button>
  </div>
);

const GlyphTabIcon = ({ selected, glyph: Glyph }) => (
  <span className="glyph-tab-icon">
    <img className={selected ? "glyph-tab-ring" : "glyph-tab-disc"} src={icon(selected ? "manage-tab-ring-base.svg" : "library-tab-image-base.svg")} alt="" />
    <Glyph className="glyph-tab-glyph" color={selected ? "#242222" : "#FDFDFB"} />
  </span>
);
const SAMPLE_PHOTOS = [{
  id: "default-photo",
  name: "格拉斯哥艺术学院",
  url: icon("default-photo.webp"),
}];
const MANAGE_THUMBNAILS = Array.from({ length: 12 }, (_, index) => icon(`manage-thumb-${String(index + 1).padStart(2, "0")}.webp`));
const MANAGE_LIBRARY_PHOTOS = MANAGE_THUMBNAILS.map((url, index) => ({ id: `library-photo-${index + 1}`, name: `素材 ${index + 1}`, url }));

export default function App({ notebookId, initialTitle, initialPage, onExit, onTitleChange }) {
  // Read once per notebook (App is keyed by notebook): this notebook's save, and the word/photo/
  // audio library every notebook shares.
  const [saved] = useState(() => loadJSON(notebookKey(notebookId)));
  const [savedLibrary] = useState(() => loadJSON(LIBRARY_KEY));
  // A built-in notebook opened for the first time starts with its example time capsules.
  const [sampleCapsules] = useState(() => (saved ? null : SAMPLE_CAPSULES[notebookId] ?? null));
  const initialPageCount = saved?.pageCount ?? (sampleCapsules ? pagesForCapsules(sampleCapsules) : 1);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [currentPage, setCurrentPage] = useState(() => Math.min(initialPage ?? saved?.currentPage ?? 1, initialPageCount));
  // A notebook you just made has only you in it, so its two example cards carry your avatar.
  const [sentenceCards, setSentenceCards] = useState(() => saved?.sentenceCards ?? { 1: String(notebookId).startsWith("new") ? GUIDE_SENTENCE_CARDS.map((card) => ({ ...card, avatar: USERS[savedLibrary?.currentUser] ? savedLibrary.currentUser : 1 })) : GUIDE_SENTENCE_CARDS });
  const [activeSentenceIndexes, setActiveSentenceIndexes] = useState(saved?.activeSentenceIndexes ?? { 1: 1 });
  const [selectedWord, setSelectedWord] = useState(null);
  const [blankEditor, setBlankEditor] = useState(null);
  const [editorMode, setEditorMode] = useState("word");
  const [editorPosition, setEditorPosition] = useState({ left: 30, top: 200, pointerLeft: 130, placement: "below" });
  // { page, index } of the card the sentence library will fill. The card's content and caret
  // offset are captured when the panel opens: tapping a sentence blurs the card, which saves and
  // re-renders it, so a DOM range taken earlier would point at detached nodes.
  const [sentencePicker, setSentencePicker] = useState(null);
  const sentencePickerTarget = useRef(null);
  const editorSheetRef = useRef(null);
  const sentenceAreaRef = useRef(null);
  useLayoutEffect(() => {
    if (!blankEditor && !sentencePicker) return;
    const anchor = blankEditor
      ? document.querySelector(`[data-blank-id="${blankEditor.id}"]`)
      : sentenceAreaRef.current?.querySelector(`[data-sentence-index="${sentencePicker.index}"]`)?.closest(".edit-sentence-card");
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
  }, [blankEditor?.id, editorMode, sentencePicker?.index]);
  const [selectedWordCategory, setSelectedWordCategory] = useState("全部");
  const [wordSearch, setWordSearch] = useState("");
  const [hasSeedSentence, setHasSeedSentence] = useState(saved?.hasSeedSentence ?? true);
  const [isPageOverviewOpen, setIsPageOverviewOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [manageSection, setManageSection] = useState("images");
  const [libraryCategory, setLibraryCategory] = useState("全部");
  const [customLibraryCategories, setCustomLibraryCategories] = useState(savedLibrary?.customLibraryCategories ?? []);
  const [isAddingLibraryCategory, setIsAddingLibraryCategory] = useState(false);
  const [newLibraryCategory, setNewLibraryCategory] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryWords, setLibraryWords] = useState(savedLibrary?.libraryWords ?? ["十月", "秋天", "黄昏", "霜", "星期二"]);
  const [newLibraryWord, setNewLibraryWord] = useState("");
  const [pageTone, setPageTone] = useState(saved?.pageTone ?? "#fbfaf6");
  const [cardTone, setCardTone] = useState(saved?.cardTone ?? "#ffffff");
  const [inkTone, setInkTone] = useState(saved?.inkTone ?? "#242222");
  const [pagePattern, setPagePattern] = useState(saved?.pagePattern ?? "plain");
  const [selectedSpreads, setSelectedSpreads] = useState([]);
  const [isCapsuleDateOpen, setIsCapsuleDateOpen] = useState(false);
  const [capsuleMonth, setCapsuleMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  // [start, end] date keys of the sealing period; the capsule opens on the end date.
  const [capsuleRange, setCapsuleRange] = useState(() => [dateKey(new Date()), dateKey(addDays(new Date(), 21))]);
  // { id, spreads: [first page of each sealed spread], openAt: date key }
  const [capsules, setCapsules] = useState(saved?.capsules ?? sampleCapsules ?? []);
  const [overviewNotice, setOverviewNotice] = useState("");
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [recentPhotos, setRecentPhotos] = useState(savedLibrary?.recentPhotos ?? []);
  const [audioClips, setAudioClips] = useState(savedLibrary?.audioClips ?? []);
  // who is writing on this device; picked by tapping a tag at the top of the page
  const [currentUser, setCurrentUser] = useState(() => (USERS[savedLibrary?.currentUser] ? savedLibrary.currentUser : 1));
  const [collaborators, setCollaborators] = useState(() => saved?.collaborators ?? (String(notebookId).startsWith("new") ? [] : [1, 2, 3, 4]));
  const [isInvitePicking, setIsInvitePicking] = useState(false); // share sheet: pick the invited friend's colour
  const [collabDemo, setCollabDemo] = useState(null); // { user, page, index } while the demo runs
  const [collabNotice, setCollabNotice] = useState("");
  const collabRun = useRef(null);
  // Built-in library items can't be removed from the source lists, so deleting one hides it.
  const [hiddenLibrary, setHiddenLibrary] = useState(() => ({ sentences: [], words: [], photos: [], ...savedLibrary?.hiddenLibrary }));
  const hideLibraryItem = (kind, key) => setHiddenLibrary((hidden) => (hidden[kind].includes(key) ? hidden : { ...hidden, [kind]: [...hidden[kind], key] }));
  const deleteLibrarySentence = (sentence) => hideLibraryItem("sentences", sentence);
  const deleteLibraryWord = (word) => {
    setLibraryWords((words) => words.filter((item) => item !== word));
    hideLibraryItem("words", word);
  };
  // Removing a photo or recording from the library leaves any card already using it untouched.
  const deleteLibraryPhoto = (photo) => {
    if (recentPhotos.some((item) => item.id === photo.id)) setRecentPhotos((photos) => photos.filter((item) => item.id !== photo.id));
    else hideLibraryItem("photos", photo.id);
  };
  const deleteAudioClip = (clip) => setAudioClips((clips) => clips.filter((item) => item.id !== clip.id));
  const [isRecording, setIsRecording] = useState(false);
  const [recordingNotice, setRecordingNotice] = useState("");
  const [sentenceLineCounts, setSentenceLineCounts] = useState({});
  const [sentenceContentHeights, setSentenceContentHeights] = useState({});
  const blankId = useRef(maxBlankId(saved?.sentenceCards));
  const pendingSentenceFocus = useRef(null);
  const pendingBlankCaret = useRef(null);
  const pendingCaretOffset = useRef(null);
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
  const appScreenRef = useRef(null);
  const pageSwipe = useRef(null);
  const suppressPageClick = useRef(false);
  // The header <h1> stays uncontrolled (re-rendering a contentEditable's text moves the
  // caret), so it renders a fixed initial value and reports edits into notebookTitle.
  const [initialTitleText] = useState(saved?.title || initialTitle || "无标题");
  const [notebookTitle, setNotebookTitle] = useState(initialTitleText);
  const [toolbarPosition, setToolbarPosition] = useState(null);
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [canAddSentence, setCanAddSentence] = useState(true);
  const [pageSwipeMode, setPageSwipeMode] = useState(null);
  const [isAddPageArmed, setIsAddPageArmed] = useState(false);
  const currentPageSide = currentPage % 2 === 1 ? "left" : "right";

  useEffect(() => {
    if (!overviewNotice) return undefined;
    const timer = setTimeout(() => setOverviewNotice(""), 2200);
    return () => clearTimeout(timer);
  }, [overviewNotice]);

  useEffect(() => () => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
    audioRecorder.current?.stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const addRecentPhotos = (files) => {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    const nextPhotos = images.map((file) => {
      const url = URL.createObjectURL(file);
      const mediaId = newMediaId("photo");
      photoUrls.current.add(url);
      saveMedia(mediaId, file);
      return { id: `${file.name}-${file.lastModified}-${url}`, url, name: file.name || "已选图片", mediaId };
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
          ? { ...part, value: "", audio: undefined, photo: { url: photo.url, name: photo.name, mediaId: photo.mediaId } }
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
          ? { ...part, value: "", photo: undefined, audio: { url: clip.url, duration: clip.duration, waveform: clip.waveform, mediaId: clip.mediaId } }
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
        await navigator.share({ title: notebookTitle || "无标题", text: "邀请你一起在「扣指成诗」里共写一句话。" });
        setShareNotice("已打开系统分享");
      } catch {
        return;
      }
    } else {
      setShareNotice(`已准备分享到${channel}`);
    }
    window.setTimeout(() => setShareNotice(""), 1800);
    if (collaborators.length < 4) setIsInvitePicking(true);
  };
  const inviteCollaborator = (user) => {
    // the inviter gets a tag too, the first time anyone joins
    setCollaborators((list) => [...new Set([...(list.length ? list : [currentUser]), user])].sort());
    setIsInvitePicking(false);
    setIsShareOpen(false);
    setShareNotice(`${USERS[user].name} 加入了这本笔记本`);
    window.setTimeout(() => setShareNotice(""), 2200);
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
          const mediaId = newMediaId("audio");
          const waveform = await extractAudioWaveform(blob);
          audioUrls.current.add(url);
          saveMedia(mediaId, blob);
          setAudioClips((clips) => [{ id: `${Date.now()}-${url}`, url, duration, waveform, mediaId }, ...clips].slice(0, 8));
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
    setPageCount((count) => {
      const nextPage = count + 1;
      setCurrentPage(nextPage);
      return nextPage;
    });
  };

  const appendSentence = (parts, focusText = false) => {
    if (!canAddSentence) return false;
    const avatar = currentUser;
    const nextIndex = currentSentenceCards.length;
    const independentParts = parts.map((part) => part.type === "blank"
      ? { ...part, id: ++blankId.current }
      : { ...part });
    pendingSentenceFocus.current = { page: currentPage, index: nextIndex, focusText };
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: [
        ...(cards[currentPage] ?? []),
        { avatar, parts: independentParts },
      ],
    }));
    setHasSeedSentence(true);
    setActiveSentenceIndexes((indexes) => ({ ...indexes, [currentPage]: nextIndex }));
    setSelectedWord(null);
    return true;
  };

  const addSentence = () => {
    const text = hasSeedSentence
      ? ""
      : STARTER_SENTENCES[Math.floor(Math.random() * STARTER_SENTENCES.length)];
    appendSentence([textPart(text)], true);
  };

  const partsFromElement = (index, element) => {
    const existingParts = cardParts((sentenceCards[currentPage] ?? [])[index] ?? {});
    const parts = Array.from(element.childNodes).flatMap((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = withoutCaretAnchor(node.textContent);
        return text ? [textPart(text)] : [];
      }
      if (!(node instanceof HTMLElement)) return [];
      if (node.classList.contains("blank-word-card")) {
        const id = Number(node.dataset.blankId);
        return existingParts.find((part) => part.type === "blank" && part.id === id) ?? [];
      }
      const text = withoutCaretAnchor(node.textContent);
      return text ? [textPart(text)] : [];
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
      if (node === targetNode) return offset + withoutCaretAnchor(node.textContent.slice(0, targetOffset)).length;
      offset += withoutCaretAnchor(node.textContent).length;
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

    const rawWord = withoutCaretAnchor(selection.toString());
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
                      color: limitedValue ? (limitedValue === part.value && part.color) || USERS[currentUser].color : undefined,
                      by: limitedValue ? (limitedValue === part.value && part.by) || currentUser : undefined,
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
        return offset + withoutCaretAnchor(localRange.toString()).length;
      }
      if (child instanceof HTMLElement && child.classList.contains("blank-word-card")) {
        const id = Number(child.dataset.blankId);
        const part = cardParts((sentenceCards[currentPage] ?? [])[Number(element.dataset.sentenceIndex)] ?? {})
          .find((item) => item.type === "blank" && item.id === id);
        offset += part?.value.length ?? 0;
      } else {
        offset += withoutCaretAnchor(child.textContent ?? "").length;
      }
    }
    return offset;
  };

  const blankBeforeCaret = (element, range) => {
    let previous = null;
    if (range.startContainer === element) {
      previous = element.childNodes[range.startOffset - 1];
    } else {
      // Climb from the caret's own node: typed text is often a bare text node directly inside
      // `element` (not wrapped in a span), and starting from its parent would climb past
      // `element` to the document root and loop forever.
      let topLevel = range.startContainer;
      while (topLevel && topLevel.parentNode !== element) topLevel = topLevel.parentNode;
      if (!topLevel) return null;
      const beforeCaret = document.createRange();
      beforeCaret.selectNodeContents(topLevel);
      beforeCaret.setEnd(range.startContainer, range.startOffset);
      if (withoutCaretAnchor(beforeCaret.toString()).length === 0) previous = topLevel?.previousSibling;
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
    pendingBlankCaret.current = id;
  };

  // The persistent toolbar's 词卡/图片/音频 buttons all insert a blank at the caret in the
  // active card (same mechanic the space bar already triggers while typing), then jump
  // straight into that blank's editor on the matching tab instead of leaving it empty for a
  // second tap — pressing "图片"/"音频" with nothing to fill in would otherwise do nothing.
  const insertIntoActiveSentence = (mode) => {
    if (!currentSentenceCards.length) return;
    const index = activeSentenceIndex != null && activeSentenceIndex < currentSentenceCards.length
      ? activeSentenceIndex
      : currentSentenceCards.length - 1;
    const element = sentenceAreaRef.current?.querySelector(`[data-sentence-index="${index}"]`);
    if (!element) return;

    const selection = window.getSelection();
    let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range || !element.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
    }

    insertBlankWordCard(index, element, range);
    const id = blankId.current;
    pendingBlankCaret.current = null;                     // the panel's input takes focus, not the sentence
    setSentencePicker(null);
    setEditorMode(mode);
    // Opened from a toolbar button for one content type, so no type tabs; tapping an existing
    // blank card leaves `single` unset and the panel offers word/photo/audio tabs.
    setBlankEditor({ page: currentPage, index, id, value: "", single: true });
  };

  const openSentencePicker = () => {
    if (!currentSentenceCards.length) return;
    const index = activeSentenceIndex != null && activeSentenceIndex < currentSentenceCards.length
      ? activeSentenceIndex
      : currentSentenceCards.length - 1;
    const element = sentenceAreaRef.current?.querySelector(`[data-sentence-index="${index}"]`);
    if (!element) return;
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    sentencePickerTarget.current = {
      parts: partsFromElement(index, element),
      offset: range && element.contains(range.startContainer) ? modelOffsetAtCaret(element, range) : Infinity,
    };
    setBlankEditor(null);
    setSentencePicker({ page: currentPage, index });
  };

  // Inserts at a model offset (blank cards count as their text); a caret inside a blank card
  // puts the sentence right after it, and an offset past the end appends.
  const insertTextIntoParts = (parts, offset, text) => {
    const result = [];
    let remaining = offset;
    let inserted = false;
    for (const part of parts) {
      if (inserted) {
        result.push(part);
        continue;
      }
      const length = part.value?.length ?? 0;
      if (part.type === "text" && remaining <= length) {
        result.push({ ...part, value: part.value.slice(0, remaining) + text + part.value.slice(remaining) });
        inserted = true;
        continue;
      }
      if (part.type !== "text" && remaining === 0) {
        result.push(textPart(text), part);
        inserted = true;
        continue;
      }
      result.push(part);
      remaining -= length;
      if (part.type !== "text" && remaining < 0) {
        result.push(textPart(text));
        inserted = true;
      }
    }
    if (!inserted) result.push(textPart(text));
    return result;
  };

  const fillSentenceFromLibrary = (text) => {
    const { page, index } = sentencePicker;
    const { parts, offset } = sentencePickerTarget.current;
    const nextParts = insertTextIntoParts(parts, offset, text);
    setSentenceCards((cards) => ({
      ...cards,
      [page]: (cards[page] ?? []).map((card, cardIndex) => (cardIndex === index ? { ...card, parts: nextParts } : card)),
    }));
    pendingSentenceFocus.current = { page, index, focusText: true };
    setSentencePicker(null);
    setIsEditingCard(true);
  };

  // Reads the sentence from the DOM rather than saved state, so text typed after the blank but
  // not yet saved (that happens on blur) isn't dropped, and puts the caret where the blank was.
  const removeBlankWordCard = (index, id, element, range) => {
    const sourceParts = partsFromElement(index, element);
    const removed = sourceParts.find((part) => part.type === "blank" && part.id === id);
    const caretOffset = modelOffsetAtCaret(element, range) - (removed?.value.length ?? 0);
    const parts = sourceParts
      .filter((part) => part !== removed)
      .reduce((result, part) => {
        const previous = result.at(-1);
        if (part.type === "text" && previous?.type === "text") result[result.length - 1] = textPart(previous.value + part.value);
        else result.push(part);
        return result;
      }, []);
    skipSentenceBlur.current.add(`${currentPage}-${index}`);
    pendingCaretOffset.current = { page: currentPage, index, offset: Math.max(0, caretOffset) };
    setSentenceCards((cards) => ({
      ...cards,
      [currentPage]: (cards[currentPage] ?? []).map((card, cardIndex) => (cardIndex === index ? { ...card, parts } : card)),
    }));
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
              <img className="photo-card-image" src={part.photo.url || undefined} alt={part.photo.name} draggable={false} />
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
    && word.includes(wordSearch.trim())
    && !hiddenLibrary.words.includes(word),
  );
  const isCardSection = manageSection === "sentences" || manageSection === "words";
  // A capsule stays sealed until its open date; spreads are identified by their first page.
  const sealedCapsuleFor = (page) => {
    const spreadStart = page % 2 === 1 ? page : page - 1;
    return capsules.find((capsule) => capsule.spreads.includes(spreadStart) && daysUntil(capsule.openAt) > 0);
  };
  const currentCapsule = sealedCapsuleFor(currentPage);

  const sealSelectedSpreads = () => {
    const [start, end] = capsuleRange;
    const openAt = end ?? start;
    if (daysUntil(openAt) <= 0) {
      setOverviewNotice("开启日期要选在今天之后");
      return;
    }
    setCapsules((list) => [...list, { id: Date.now(), spreads: [...selectedSpreads].sort((a, b) => a - b), openAt }]);
    setOverviewNotice(`已封存 ${selectedSpreads.length} 页，${capsuleOpenLabel(openAt)}`);
    setSelectedSpreads([]);
    setIsCapsuleDateOpen(false);
  };
  const isPhotoShown = (photo) => !hiddenLibrary.photos.includes(photo.id);
  const pickerPhotos = [...recentPhotos, ...SAMPLE_PHOTOS, ...MANAGE_LIBRARY_PHOTOS].filter(isPhotoShown);
  const managedPhotos = [...recentPhotos, ...MANAGE_LIBRARY_PHOTOS].filter(isPhotoShown);
  const managedWords = [...new Set([...libraryWords, ...WORD_LIBRARY.filter(({ category }) => libraryCategory === "全部" || category === libraryCategory).map(({ word }) => word)])]
    .filter((word) => word.includes(librarySearch.trim()) && !hiddenLibrary.words.includes(word));
  const writtenSentences = Object.values(sentenceCards).flat().map((card) => cardParts(card).map((part) => part.value).join("")).filter(Boolean);
  const sentenceLibrary = [...new Set([...SENTENCE_LIBRARY, ...writtenSentences])].filter((sentence) => !hiddenLibrary.sentences.includes(sentence));
  const sheetMode = sentencePicker ? "sentence" : editorMode;
  const showTypeTabs = Boolean(blankEditor && !blankEditor.single);

  // Put the caret after a just-inserted blank in the same commit that renders it. Waiting a
  // frame left the sentence unfocused in between, and keys typed in that gap were lost.
  useLayoutEffect(() => {
    const id = pendingBlankCaret.current;
    if (id == null) return;
    const blank = sentenceAreaRef.current?.querySelector(`[data-blank-id="${id}"]`);
    const sentence = blank?.closest(".sentence-text");
    if (!blank || !sentence) return;
    pendingBlankCaret.current = null;
    sentence.focus({ preventScroll: true });
    // A caret "after" a non-editable blank with no text behind it is snapped back by the
    // browser into the text before the blank, so typing would land on the wrong side. Give
    // it a zero-width space to sit in; CARET_ANCHOR is stripped when the sentence is read.
    if (!(blank.nextSibling instanceof Text)) blank.after(document.createTextNode(CARET_ANCHOR));
    const anchor = blank.nextSibling;
    const range = document.createRange();
    range.setStart(anchor, anchor.textContent.startsWith(CARET_ANCHOR) ? 1 : 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [currentSentenceCards]);

  // Restore a caret by model offset (blank cards count as their text) once the edited sentence
  // has re-rendered. A fresh render has exactly one DOM node per part, so the two walk together.
  useLayoutEffect(() => {
    const pending = pendingCaretOffset.current;
    if (!pending || pending.page !== currentPage) return;
    const sentence = sentenceAreaRef.current?.querySelector(`[data-sentence-index="${pending.index}"]`);
    if (!sentence) return;
    pendingCaretOffset.current = null;
    sentence.focus({ preventScroll: true });
    const parts = cardParts(currentSentenceCards[pending.index] ?? {});
    const range = document.createRange();
    let remaining = pending.offset;
    let placed = false;
    for (let partIndex = 0; partIndex < parts.length && !placed; partIndex += 1) {
      const part = parts[partIndex];
      const node = sentence.childNodes[partIndex];
      const length = part.value?.length ?? 0;
      if (!node) break;
      if (part.type === "text" && remaining <= length) {
        const text = node.nodeType === Node.TEXT_NODE ? node : node.firstChild;
        if (text) range.setStart(text, remaining);
        else range.setStart(node, 0);
        placed = true;
      } else if (part.type !== "text" && remaining <= 0) {
        range.setStartBefore(node);
        placed = true;
      } else {
        remaining -= length;
      }
    }
    if (!placed) {
      range.selectNodeContents(sentence);
      range.collapse(false);
    }
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [currentPage, currentSentenceCards]);

  useLayoutEffect(() => {
    const pending = pendingSentenceFocus.current;
    if (!pending || pending.page !== currentPage) return;
    const editor = sentenceAreaRef.current?.querySelector(`[data-sentence-index="${pending.index}"]`);
    if (!editor) return;
    pendingSentenceFocus.current = null;
    editor.closest(".edit-sentence-card")?.scrollIntoView({ block: "nearest" });
    if (!pending.focusText) return;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
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

  /* ---------- multi-writer demo ---------- */
  // Plays COLLAB_SCRIPT on a fresh page: each collaborator types their sentence a character at a
  // time, or fills an empty word card in their own colour. Tapping the notice stops it; whatever
  // was written stays on the page.
  const stopCollabDemo = (message = "") => {
    if (collabRun.current) collabRun.current.cancelled = true;
    collabRun.current = null;
    setCollabDemo(null);
    setCollabNotice(message);
    if (message) window.setTimeout(() => setCollabNotice((current) => (current === message ? "" : current)), 3200);
  };
  const runCollabDemo = async () => {
    stopCollabDemo();
    const run = { cancelled: false };
    collabRun.current = run;
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const page = pageCount + 1;
    document.activeElement?.blur?.();
    setIsShareOpen(false);
    setBlankEditor(null);
    setSentencePicker(null);
    setIsEditingCard(false);
    setPageCount(page);
    setCurrentPage(page);
    setCollaborators([1, 2, 3, 4]);
    setCollabNotice("多人共写演示中 · 点这里停止");
    const updateCard = (index, change) => setSentenceCards((cards) => ({
      ...cards,
      [page]: (cards[page] ?? []).map((card, cardIndex) => (cardIndex === index ? change(card) : card)),
    }));
    let cardCount = 0;
    await wait(700);
    for (const step of COLLAB_SCRIPT) {
      if (run.cancelled) return;
      if (step.write) {
        const index = cardCount++;
        setSentenceCards((cards) => ({ ...cards, [page]: [...(cards[page] ?? []), { avatar: step.user, parts: [textPart("")] }] }));
        setCollabDemo({ user: step.user, page, index });
        await wait(500);
        for (const piece of step.write) {
          if (run.cancelled) return;
          if (piece === BLANK) {
            const id = ++blankId.current;
            updateCard(index, (card) => ({ ...card, parts: [...card.parts, { type: "blank", id, value: "" }, textPart("")] }));
            await wait(450);
            continue;
          }
          for (const char of piece) {
            if (run.cancelled) return;
            updateCard(index, (card) => {
              const parts = [...card.parts];
              const last = parts[parts.length - 1];
              parts[parts.length - 1] = { ...last, value: last.value + char };
              return { ...card, parts };
            });
            await wait(110);
          }
        }
      } else {
        // the first still-empty word card on the demo page
        const target = await new Promise((resolve) => setSentenceCards((cards) => {
          const list = cards[page] ?? [];
          let found = null;
          list.some((card, index) => cardParts(card).some((part) => (part.type === "blank" && !part.value && !part.photo && !part.audio ? (found = { index, id: part.id }) : false)));
          resolve(found);
          return cards;
        }));
        if (!target) continue;
        setCollabDemo({ user: step.user, page, index: target.index });
        await wait(900);
        if (run.cancelled) return;
        updateCard(target.index, (card) => ({
          ...card,
          parts: card.parts.map((part) => (part.type === "blank" && part.id === target.id ? { ...part, value: step.fill, color: USERS[step.user].color, by: step.user } : part)),
        }));
      }
      await wait(650);
    }
    if (!run.cancelled) stopCollabDemo("演示完成：每个词卡的颜色，就是填它的那个人");
  };
  useEffect(() => () => { if (collabRun.current) collabRun.current.cancelled = true; }, []);

  /* ---------- saving ---------- */
  // Writes this notebook and the shared library. With `includeLiveEdit`, the card being typed in is
  // read from the DOM too, since typing only reaches state when the card blurs.
  const writeSave = (includeLiveEdit) => {
    let cards = sentenceCards;
    const editing = includeLiveEdit ? document.activeElement?.closest?.(".sentence-text") : null;
    if (editing && sentenceAreaRef.current?.contains(editing)) {
      const index = Number(editing.dataset.sentenceIndex);
      cards = { ...cards, [currentPage]: (cards[currentPage] ?? []).map((card, cardIndex) => (cardIndex === index ? { ...card, parts: partsFromElement(index, editing) } : card)) };
    }
    saveJSON(notebookKey(notebookId), {
      version: 1,
      pageCount,
      currentPage,
      sentenceCards: mapCardMedia(cards, withoutMediaUrl),
      activeSentenceIndexes,
      capsules,
      collaborators,
      title: notebookTitle,
      pageTone,
      cardTone,
      inkTone,
      pagePattern,
      hasSeedSentence,
    });
    saveJSON(LIBRARY_KEY, {
      version: 1,
      libraryWords,
      customLibraryCategories,
      recentPhotos: recentPhotos.map(withoutMediaUrl),
      audioClips: audioClips.map(withoutMediaUrl),
      hiddenLibrary,
      currentUser,
    });
  };
  const writeSaveRef = useRef(writeSave);
  writeSaveRef.current = writeSave;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;

  useEffect(() => {
    const timer = setTimeout(() => {
      writeSaveRef.current(false);
      onTitleChangeRef.current?.(notebookTitle || "无标题");
    }, 400);
    return () => clearTimeout(timer);
  }, [pageCount, currentPage, sentenceCards, activeSentenceIndexes, capsules, collaborators, notebookTitle, pageTone, cardTone, inkTone, pagePattern, hasSeedSentence, libraryWords, customLibraryCategories, recentPhotos, audioClips, hiddenLibrary, currentUser]);

  // Closing the tab, backgrounding the app or leaving the notebook can't wait for the debounce.
  useEffect(() => {
    const flush = () => writeSaveRef.current(true);
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  // Rebuild object URLs for saved photos and recordings from IndexedDB.
  useEffect(() => {
    const ids = new Set();
    const collect = (item) => { if (item?.mediaId && !item.url) ids.add(item.mediaId); return item; };
    mapCardMedia(sentenceCards, collect);
    recentPhotos.forEach(collect);
    audioClips.forEach(collect);
    if (!ids.size) return undefined;
    let cancelled = false;
    (async () => {
      const urls = {};
      for (const id of ids) {
        const blob = await loadMedia(id);
        if (blob) urls[id] = URL.createObjectURL(blob);
      }
      if (cancelled) {
        Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      Object.entries(urls).forEach(([id, url]) => (id.startsWith("audio") ? audioUrls : photoUrls).current.add(url));
      const fill = (item) => (item?.mediaId && urls[item.mediaId] ? { ...item, url: urls[item.mediaId] } : item);
      setSentenceCards((cards) => mapCardMedia(cards, fill));
      setRecentPhotos((photos) => photos.map(fill));
      setAudioClips((clips) => clips.map(fill));
    })();
    return () => { cancelled = true; };
  }, []);

  const canSwipePages = !blankEditor && !sentencePicker && !selectedWord && !isManageOpen && !isPageOverviewOpen && !isShareOpen;
  const ghostPage = pageSwipeMode === "prev" ? currentPage - 1 : currentPage + 1;
  const ghostOffset = pageSwipeMode === "prev"
    ? -(PAGE_WIDTH + PAGE_GAP)
    : PAGE_WIDTH + (pageSwipeMode === "add" ? ADD_PAGE_GAP : PAGE_GAP);

  // The drag offset is written straight to a CSS variable rather than React state so a
  // pointermove doesn't re-render this whole editor; state only changes when the mode flips.
  const setPageShift = (shift, progress = 0) => {
    const screen = appScreenRef.current;
    screen?.style.setProperty("--page-shift", `${shift}px`);
    screen?.style.setProperty("--add-progress", String(progress));
  };

  // Positions are in unscaled 375x812 screen coordinates; the toolbar lives outside the
  // scrolling sentence area so it can sit above the first card without being clipped.
  const placeCardToolbar = () => {
    const screen = appScreenRef.current;
    const area = sentenceAreaRef.current;
    const cards = area?.querySelectorAll(".edit-sentence-card") ?? [];
    if (!screen || !cards.length) {
      setToolbarPosition(null);
      return;
    }
    const index = activeSentenceIndex != null && activeSentenceIndex < cards.length ? activeSentenceIndex : cards.length - 1;
    const screenRect = screen.getBoundingClientRect();
    const scale = screenRect.width / PAGE_WIDTH;
    const shift = parseFloat(screen.style.getPropertyValue("--page-shift")) || 0;
    const card = cards[index].getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    const cardTop = (card.top - screenRect.top) / scale;
    const cardBottom = (card.bottom - screenRect.top) / scale;
    const visible = cardBottom > (areaRect.top - screenRect.top) / scale && cardTop < (areaRect.bottom - screenRect.top) / scale;
    let placement = "above";
    let top = cardTop - CARD_TOOLBAR_HEIGHT - CARD_TOOLBAR_GAP;
    if (top < CARD_TOOLBAR_MIN_TOP) {
      placement = "below";
      top = cardBottom + CARD_TOOLBAR_GAP;
    }
    const left = (card.left - screenRect.left) / scale - shift + (card.width / scale - CARD_TOOLBAR_WIDTH) / 2;
    const next = visible ? { top: Math.round(top), left: Math.round(left), placement } : null;
    setToolbarPosition((previous) => (previous && next && previous.top === next.top && previous.left === next.left && previous.placement === next.placement ? previous : next));
  };

  // Cards from the first one that crosses the page's bottom rule move to the front of the next
  // page (created if needed). Only a card the user is typing in is synced from the DOM first —
  // re-keying any other focused card would reset its caret mid-typing. If the typed-in card is
  // among those moving, the view and caret follow it, like text reflowing to a new page.
  const moveOverflowToNextPage = (fromIndex) => {
    const page = currentPage;
    const area = sentenceAreaRef.current;
    const focused = document.activeElement?.closest?.(".sentence-text");
    const focusedIndex = focused && area?.contains(focused) ? Number(focused.dataset.sentenceIndex) : null;
    const followFocus = focusedIndex != null && focusedIndex >= fromIndex;
    const focusedParts = followFocus ? partsFromElement(focusedIndex, focused) : null;
    const blurKey = `${page}-${focusedIndex}`;
    if (followFocus) skipSentenceBlur.current.add(blurKey);
    flushSync(() => {
      setSentenceCards((all) => {
        const cards = (all[page] ?? []).map((card, index) => (index === focusedIndex && focusedParts ? { ...card, parts: focusedParts } : card));
        return { ...all, [page]: cards.slice(0, fromIndex), [page + 1]: [...cards.slice(fromIndex), ...(all[page + 1] ?? [])] };
      });
      setPageCount((count) => Math.max(count, page + 1));
      if (followFocus) {
        const index = focusedIndex - fromIndex;
        pendingSentenceFocus.current = { page: page + 1, index, focusText: true };
        setActiveSentenceIndexes((indexes) => ({ ...indexes, [page + 1]: index }));
        setCurrentPage(page + 1);
      }
    });
    // The moved editor may or may not have fired blur on removal; either way the stale handler
    // must not write into whatever card now sits at its old page/index.
    skipSentenceBlur.current.delete(blurKey);
  };

  // Cards grow as text wraps or photos/audio are dropped in, so re-measure on resize too.
  useLayoutEffect(() => {
    const area = sentenceAreaRef.current;
    if (!area) return undefined;
    let overflowTimer = 0;
    const measure = () => {
      const cards = Array.from(area.querySelectorAll(":scope > .edit-sentence-card"));
      let usedHeight = 0;
      let firstOverflow = -1;
      cards.forEach((card, index) => {
        usedHeight += card.offsetHeight + SENTENCE_CARD_GAP;
        // The first card never moves: one taller than a whole page would overflow anywhere.
        if (firstOverflow < 0 && index > 0 && usedHeight - SENTENCE_CARD_GAP > SENTENCE_AREA_HEIGHT) firstOverflow = index;
      });
      setCanAddSentence(firstOverflow < 0 && usedHeight + SENTENCE_CARD_MIN_HEIGHT + SENTENCE_CARD_GAP <= SENTENCE_AREA_HEIGHT);
      // Defer the move: it uses flushSync, which can't run inside this layout effect, and an
      // open content panel or a drag still points at the card's current page/index.
      clearTimeout(overflowTimer);
      if (firstOverflow > 0 && !blankEditor && !sentencePicker && draggedSentence.current == null) {
        overflowTimer = setTimeout(() => moveOverflowToNextPage(firstOverflow), 0);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    area.querySelectorAll(":scope > .edit-sentence-card").forEach((card) => observer.observe(card));
    return () => {
      clearTimeout(overflowTimer);
      observer.disconnect();
    };
  }, [currentPage, currentSentenceCards, blankEditor, sentencePicker]);

  useLayoutEffect(placeCardToolbar, [activeSentenceIndex, currentPage, currentSentenceCards, sentenceLineCounts, sentenceContentHeights]);

  const pageSwipeModeFor = (dx) => (dx < 0
    ? (currentPage < pageCount ? "next" : "add")
    : (currentPage > 1 ? "prev" : "edge"));

  const finishPageSwipe = (target, commit) => {
    const screen = appScreenRef.current;
    screen.classList.remove("is-page-swiping");
    screen.classList.add("is-page-settling");
    setPageShift(target, target === 0 ? 0 : 1);
    setTimeout(() => {
      // flushSync so the new page's content is in the DOM before the offset snaps back
      // to 0; otherwise the old page would flash at the centre for a frame.
      flushSync(() => {
        commit?.();
        setPageSwipeMode(null);
        setIsAddPageArmed(false);
      });
      screen.classList.remove("is-page-settling");
      setPageShift(0);
    }, PAGE_SETTLE_MS);
  };

  const handlePagePointerDown = (event) => {
    // The toolbar belongs to an editing session: any tap outside the cards, the toolbar itself
    // and the content panel it opens puts it away until a card is tapped again.
    if (event.target instanceof Element && !event.target.closest(".edit-sentence-card, .card-toolbar, .blank-word-dialog")) {
      setIsEditingCard(false);
    }
    if (!canSwipePages || pageSwipe.current || appScreenRef.current.classList.contains("is-page-settling")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const { target } = event;
    if (!(target instanceof Element) || target.closest(PAGE_SWIPE_BLOCKERS)) return;
    if (!target.closest(".notebook-page, .sentence-area")) return;
    pageSwipe.current = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      scale: appScreenRef.current.getBoundingClientRect().width / PAGE_WIDTH,
      locked: false,
      mode: null,
      shift: 0,
      armed: false,
      samples: [[event.timeStamp, event.clientX]],
    };
  };

  const handlePagePointerMove = (event) => {
    const swipe = pageSwipe.current;
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = (event.clientX - swipe.x0) / swipe.scale;
    const dy = (event.clientY - swipe.y0) / swipe.scale;
    if (!swipe.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        pageSwipe.current = null;
        return;
      }
      swipe.locked = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      appScreenRef.current.classList.add("is-page-swiping");
    }

    const mode = pageSwipeModeFor(dx);
    if (mode !== swipe.mode) {
      swipe.mode = mode;
      setPageSwipeMode(mode);
    }

    let shift = dx;
    if (mode === "add") shift = -Math.min(170, -dx * 0.6);
    else if (mode === "edge") shift = Math.min(70, dx * 0.25);
    else shift = Math.max(-(PAGE_WIDTH + PAGE_GAP), Math.min(PAGE_WIDTH + PAGE_GAP, dx));
    swipe.shift = shift;

    const armed = mode === "add" && -shift >= ADD_PAGE_THRESHOLD;
    if (armed !== swipe.armed) {
      swipe.armed = armed;
      setIsAddPageArmed(armed);
    }
    setPageShift(shift, mode === "add" ? Math.min(1, -shift / ADD_PAGE_THRESHOLD) : 0);

    swipe.samples.push([event.timeStamp, event.clientX]);
    while (swipe.samples.length > 2 && event.timeStamp - swipe.samples[0][0] > 100) swipe.samples.shift();
  };

  const handlePagePointerEnd = (event) => {
    const swipe = pageSwipe.current;
    if (!swipe || swipe.id !== event.pointerId) return;
    pageSwipe.current = null;
    if (!swipe.locked) return;
    suppressPageClick.current = true;
    setTimeout(() => { suppressPageClick.current = false; }, 0);

    const [first] = swipe.samples;
    const last = swipe.samples[swipe.samples.length - 1];
    const elapsed = last[0] - first[0];
    const velocity = elapsed > 8 ? (last[1] - first[1]) / elapsed / swipe.scale : 0;
    const flung = (direction) => Math.sign(velocity) === direction && Math.abs(velocity) > 0.45 && Math.abs(swipe.shift) > 20;
    const cancelled = event.type === "pointercancel";

    if (!cancelled && swipe.mode === "add" && swipe.armed) {
      finishPageSwipe(-(PAGE_WIDTH + ADD_PAGE_GAP), addPage);
    } else if (!cancelled && swipe.mode === "next" && (swipe.shift < -PAGE_TURN_DISTANCE || flung(-1))) {
      finishPageSwipe(-(PAGE_WIDTH + PAGE_GAP), () => setCurrentPage((page) => Math.min(pageCount, page + 1)));
    } else if (!cancelled && swipe.mode === "prev" && (swipe.shift > PAGE_TURN_DISTANCE || flung(1))) {
      finishPageSwipe(PAGE_WIDTH + PAGE_GAP, () => setCurrentPage((page) => Math.max(1, page - 1)));
    } else {
      finishPageSwipe(0);
    }
  };

  return (
    <main className="prototype-stage" aria-label="应用原型预览">
      <section
        ref={appScreenRef}
        className="app-screen"
        aria-label="375 × 812 像素应用屏幕"
        onPointerDown={handlePagePointerDown}
        onPointerMove={handlePagePointerMove}
        onPointerUp={handlePagePointerEnd}
        onPointerCancel={handlePagePointerEnd}
        onClickCapture={(event) => {
          if (!suppressPageClick.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        style={{
          "--back-icon": `url("${icon("back.svg")}")`,
          "--blank-word-card-icon": `url("${icon("blank-word-card.svg")}")`,
          "--page-tone": pageTone,
          "--card-tone": cardTone,
          "--ink-tone": inkTone,
        }}
      >
        <header className="top-navigation">
          <button className="nav-button nav-back" type="button" aria-label="返回" onClick={onExit}>
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
            onInput={(event) => setNotebookTitle(event.currentTarget.textContent.trim())}
          >
            {initialTitleText}
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
              <h2>{notebookTitle || "无标题"}</h2>
              <button type="button" aria-label="分享笔记本" onClick={() => setIsShareOpen(true)}><img src={icon("overview-export.svg")} alt="" /></button>
            </div>
            <div className="page-overview-grid">
              {Array.from({ length: Math.ceil(pageCount / 2) }, (_, index) => {
                const page = index * 2 + 1;
                const lastPage = Math.min(page + 1, pageCount);
                const pageLabel = `第 ${page}${lastPage > page ? `–${lastPage}` : ""} 页`;
                const capsule = sealedCapsuleFor(page);
                if (capsule) {
                  const [, openMonth, openDay] = capsule.openAt.split("-").map(Number);
                  return (
                    <div className="overview-card-container is-sealed" key={page}>
                      <button
                        className="page-overview-card overview-capsule-card"
                        type="button"
                        aria-label={`${pageLabel}已封存为时间胶囊，${capsuleOpenLabel(capsule.openAt)}`}
                        onClick={() => setOverviewNotice(`这页时间胶囊将在 ${openMonth}月${openDay}日 开启`)}
                      >
                        <div className="overview-book">
                          <img className="overview-spread-image" src={icon("spread-thumbnail-unselected.svg")} alt="" />
                        </div>
                        {/* Figma layer order: ring under the wrap, the string over the tag */}
                        <img className="capsule-ring" src={icon("capsule-select-ring.svg")} alt="" />
                        <span className="capsule-wrap" aria-hidden="true" />
                        <span className="capsule-tag" aria-hidden="true">{capsuleOpenLabel(capsule.openAt)}</span>
                        <img className="capsule-string" src={icon("capsule-string.svg")} alt="" />
                      </button>
                    </div>
                  );
                }
                const isSelected = selectedSpreads.includes(page);
                return (
                  <div className="overview-card-container" key={page}>
                  <button
                    className="page-overview-card"
                    type="button"
                    aria-label={`打开${pageLabel}`}
                    onClick={() => {
                      setCurrentPage(currentPage >= page && currentPage <= lastPage ? currentPage : page);
                      setIsPageOverviewOpen(false);
                    }}
                  >
                    <div className="overview-book">
                      <img className="overview-spread-image" src={icon(isSelected ? "spread-thumbnail-selected.svg" : "spread-thumbnail-unselected.svg")} alt="" />
                    </div>
                  </button>
                  <button
                    type="button"
                    className="overview-select-toggle"
                    aria-label={`${isSelected ? "取消选择" : "选择"}${pageLabel}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedSpreads((selected) => selected.includes(page) ? selected.filter((item) => item !== page) : [...selected, page])}
                  >
                    {isSelected ? <span className="overview-select-check" aria-hidden="true">✓</span> : <img src={icon("spread-select.svg")} alt="" />}
                  </button>
                  </div>
                );
              })}
            </div>
            {overviewNotice && <p className="overview-notice" role="status">{overviewNotice}</p>}
            {selectedSpreads.length > 0 && (
              <button className={`overview-capsule-action${isCapsuleDateOpen ? " is-active" : ""}`} type="button" onClick={() => setIsCapsuleDateOpen(true)}>
                将这 {selectedSpreads.length} 页封存为时间胶囊
              </button>
            )}

            {isCapsuleDateOpen && (() => {
              const { year, month } = capsuleMonth;
              const firstWeekday = new Date(year, month, 1).getDay();
              const dayCount = new Date(year, month + 1, 0).getDate();
              const todayKey = dateKey(new Date());
              const [rangeStart, rangeEnd] = capsuleRange;
              const lastInRange = rangeEnd ?? rangeStart;
              const changeMonth = (step) => setCapsuleMonth((value) => {
                const next = new Date(value.year, value.month + step, 1);
                return { year: next.getFullYear(), month: next.getMonth() };
              });
              // First tap starts a new period, second tap closes it (in either order).
              const chooseDay = (key) => setCapsuleRange(([start, end]) => (!start || end ? [key, null] : key < start ? [key, start] : [start, key]));
              return (
                <div className="capsule-date-backdrop" role="presentation" onClick={() => setIsCapsuleDateOpen(false)}>
                  <section className="capsule-date-dialog" role="dialog" aria-modal="true" aria-label="选择日期" onClick={(event) => event.stopPropagation()}>
                    <div className="capsule-date-title">
                      <h3>选择日期</h3>
                      <button type="button" aria-label="关闭日期选择" onClick={() => setIsCapsuleDateOpen(false)}><img src={icon("capsule-date-close.svg")} alt="" /></button>
                    </div>
                    <div className="capsule-month-row">
                      <button type="button" aria-label="上个月" onClick={() => changeMonth(-1)}>‹</button>
                      <strong>{year}年{month + 1}月</strong>
                      <button type="button" aria-label="下个月" onClick={() => changeMonth(1)}>›</button>
                    </div>
                    <div className="capsule-weekdays">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
                    <div className="capsule-calendar">
                      {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
                      {Array.from({ length: dayCount }, (_, index) => {
                        const day = index + 1;
                        const key = dateKey(new Date(year, month, day));
                        const column = (firstWeekday + index) % 7;
                        const inRange = key >= rangeStart && key <= lastInRange;
                        const classes = [
                          inRange && "is-in-range",
                          (key === rangeStart || key === lastInRange) && "is-range-edge",
                          inRange && (key === rangeStart || column === 0 || day === 1) && "is-bar-start",
                          inRange && (key === lastInRange || column === 6 || day === dayCount) && "is-bar-end",
                        ].filter(Boolean).join(" ");
                        return (
                          <button
                            key={key}
                            type="button"
                            className={classes}
                            disabled={key < todayKey}
                            aria-pressed={inRange}
                            aria-label={`${month + 1}月${day}日`}
                            onClick={() => chooseDay(key)}
                          >{day}</button>
                        );
                      })}
                    </div>
                    <button className="capsule-confirm" type="button" onClick={sealSelectedSpreads}>确认</button>
                  </section>
                </div>
              );
            })()}
          </section>
        )}

        {isShareOpen && (
          <div className="share-dialog" role="dialog" aria-modal="true" aria-label="分享笔记本" onClick={() => { setIsShareOpen(false); setIsInvitePicking(false); }}>
            <section className="share-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="content-editor-sheet-background" aria-hidden="true">
                <img className="panel-top" src={icon("panel-top.svg")} alt="" />
                <img className="panel-middle" src={icon("panel-middle.svg")} alt="" />
                <img className="panel-bottom" src={icon("panel-bottom.svg")} alt="" />
              </div>
              <div className="share-sheet-handle" />
              <h2>分享笔记本</h2>
              <p>邀请朋友一起把句子写完</p>
              {isInvitePicking ? (
                <div className="invite-colors">
                  <p>给这位朋友选一个颜色，TA 填的词卡就是这个颜色</p>
                  <div>
                    {[1, 2, 3, 4].filter((user) => !collaborators.includes(user) && !(collaborators.length === 0 && user === currentUser)).map((user) => (
                      <button key={user} type="button" style={{ "--user-color": USERS[user].color }} onClick={() => inviteCollaborator(user)}>
                        <img src={icon(`user-${user}.svg`)} alt="" draggable={false} />
                        <small>{USERS[user].name}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
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
              )}
              <button className="share-collab-demo" type="button" onClick={runCollabDemo}>▶ 演示多人一起写一首诗</button>
              <button className="share-cancel" type="button" onClick={() => { setIsShareOpen(false); setIsInvitePicking(false); }}>取消</button>
            </section>
          </div>
        )}

        {shareNotice && <div className="share-notice" role="status">{shareNotice}</div>}
        {collabNotice && (
          <button className="share-notice collab-notice" type="button" role="status" onClick={() => stopCollabDemo()}>
            {collabDemo && <i style={{ background: USERS[collabDemo.user].color }} />}
            {collabDemo ? `${USERS[collabDemo.user].name} 正在写… · 点这里停止` : collabNotice}
          </button>
        )}

        <div className="user-labels" aria-label="笔记本协作者">
          {collaborators.map((user) => (
            <button
              key={user}
              type="button"
              className={`user-label${currentUser === user ? " is-me" : ""}${collabDemo?.user === user ? " is-writing" : ""}`}
              style={{ "--user-color": USERS[user].color }}
              aria-pressed={currentUser === user}
              aria-label={`以${USERS[user].name}的身份书写`}
              onClick={() => {
                setCurrentUser(user);
                setShareNotice(`现在以「${USERS[user].name}」的身份书写`);
                window.setTimeout(() => setShareNotice(""), 2200);
              }}
            >
              <img src={icon(`user-label-${user}.svg`)} alt="" draggable={false} />
              {collabDemo?.user === user && <span className="user-typing" aria-hidden="true"><i /><i /><i /></span>}
            </button>
          ))}
        </div>

        <main className={`notebook-page page-slide notebook-page-${currentPageSide} page-pattern-${pagePattern}`}>
          <img
            className="notebook-spread-image"
            src={icon("notebook-spread.webp")}
            alt={`第 ${currentPage} 页`}
            draggable={false}
          />
        </main>

        {pageSwipeMode && pageSwipeMode !== "edge" && (
          <div className="page-ghost" style={{ "--ghost-offset": `${ghostOffset}px` }} aria-hidden="true">
            <div className={`notebook-page notebook-page-${ghostPage % 2 === 1 ? "left" : "right"} page-pattern-${pagePattern}`}>
              <img className="notebook-spread-image" src={icon("notebook-spread.webp")} alt="" draggable={false} />
            </div>
          </div>
        )}

        {pageSwipeMode === "add" && (
          <div className={`page-add-indicator${isAddPageArmed ? " is-armed" : ""}`} aria-hidden="true">
            <span className="page-add-icon">
              <img src={icon("add-page-outline.svg")} alt="" draggable={false} />
              <img className="page-add-icon-fill" src={icon("add-page-default.svg")} alt="" draggable={false} />
            </span>
            <span className="page-add-label">{isAddPageArmed ? "松开以添加页面" : "拉动以添加页面"}</span>
          </div>
        )}

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

        <section ref={sentenceAreaRef} className={`sentence-area${currentCapsule ? " is-sealed" : ""}${collabDemo ? " is-collab-demo" : ""}`} style={collabDemo ? { "--remote-color": USERS[collabDemo.user].color } : undefined} aria-label="句子区域" onScroll={placeCardToolbar}>
          {currentCapsule && (
            <div className="page-capsule-cover" role="note" aria-label={`这页已封存为时间胶囊，${capsuleOpenLabel(currentCapsule.openAt)}`}>
              <img className="capsule-string" src={icon("capsule-string.svg")} alt="" />
              <span className="capsule-tag" aria-hidden="true">{capsuleOpenLabel(currentCapsule.openAt)}</span>
            </div>
          )}
          {currentSentenceCards.map((card, index) => {
            const visualLines = sentenceLineCounts[`${currentPage}-${index}`] ?? 1;
            const assetLines = Math.min(3, visualLines);
            const contentHeight = sentenceContentHeights[`${currentPage}-${index}`] ?? 22;
            const cardHeight = visualLines > 3 ? Math.max(SENTENCE_CARD_MIN_HEIGHT, contentHeight + 20) : SENTENCE_CARD_MIN_HEIGHT + (visualLines - 1) * 30;
            return (
            <div
              className={`edit-sentence-card sentence-lines-${assetLines}${visualLines > 3 ? " is-extended" : ""}${activeSentenceIndex === index ? " is-active" : ""}${collabDemo?.page === currentPage && collabDemo.index === index ? " is-remote-writing" : ""}`}
              style={{ "--sentence-card-height": `${cardHeight}px` }}
              aria-label={`第 ${index + 1} 个句子卡`}
              key={index}
              draggable
              onClick={(event) => {
                if (suppressSentenceClick.current) return;
                setActiveSentenceIndexes((indexes) => indexes[currentPage] === index ? indexes : { ...indexes, [currentPage]: index });
                setIsEditingCard(true);
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
                    setIsEditingCard(true);
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
                      removeBlankWordCard(index, Number(blank.dataset.blankId), event.currentTarget, range);
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
              <p>点 ＋ 写下一句</p>
            </div>
          )}

        </section>

        {hasSentence && isEditingCard && toolbarPosition && !currentCapsule && (
          <nav
            className={`card-toolbar is-${toolbarPosition.placement}`}
            style={{ top: toolbarPosition.top, left: toolbarPosition.left }}
            aria-label="添加内容"
          >
            <button
              type="button"
              className="card-toolbar-button"
              aria-haspopup="dialog"
              onMouseDown={(event) => event.preventDefault()}
              onClick={openSentencePicker}
            >
              <span className="card-toolbar-icon" aria-hidden="true">
                <span className="card-toolbar-disc">
                  <img className="card-toolbar-disc-base" src={icon("library-tab-image-base.svg")} alt="" />
                  <SentenceCardGlyph className="card-toolbar-disc-glyph" color="#FDFDFB" />
                </span>
              </span>
              <span>句卡</span>
            </button>
            <button
              type="button"
              className="card-toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertIntoActiveSentence("word")}
            >
              <span className="card-toolbar-icon" aria-hidden="true">
                <span className="card-toolbar-disc">
                  <img className="card-toolbar-disc-base" src={icon("library-tab-image-base.svg")} alt="" />
                  <WordCardGlyph className="card-toolbar-disc-glyph" color="#FDFDFB" />
                </span>
              </span>
              <span>词卡</span>
            </button>
            <button
              type="button"
              className="card-toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertIntoActiveSentence("photo")}
            >
              <span className="card-toolbar-icon" aria-hidden="true">
                <span className="card-toolbar-disc">
                  <img className="card-toolbar-disc-base" src={icon("library-tab-image-base.svg")} alt="" />
                  <img className="card-toolbar-disc-glyph" src={icon("library-tab-image-icon.svg")} alt="" />
                </span>
              </span>
              <span>图片</span>
            </button>
            <button
              type="button"
              className="card-toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertIntoActiveSentence("audio")}
            >
              <span className="card-toolbar-icon" aria-hidden="true">
                <span className="card-toolbar-disc"><img className="card-toolbar-disc-full" src={icon("manage-tab-audio.svg")} alt="" /></span>
              </span>
              <span>音频</span>
            </button>
          </nav>
        )}

        <p className="sr-only" aria-live="polite">第 {currentPage} 页，共 {pageCount} 页</p>

        {(blankEditor || sentencePicker) && (
          <div className="blank-word-dialog" role="dialog" aria-modal="true" aria-label={{ sentence: "句卡库", word: "词卡", photo: "图片", audio: "音频" }[sheetMode]}>
            <section
              ref={editorSheetRef}
              className={`content-editor-sheet is-${sheetMode}${showTypeTabs ? " has-tabs" : ""}`}
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
              <button className="content-sheet-close" type="button" aria-label="关闭编辑器" onClick={() => { setBlankEditor(null); setSentencePicker(null); }}>×</button>
              {sheetMode === "sentence" && <h3 className="content-editor-title is-text">句卡库</h3>}
              {showTypeTabs && (
                <nav className="content-editor-tabs" aria-label="内容类型">
                  {["word", "photo", "audio"].map((mode) => (
                    <button
                      className={editorMode === mode ? "is-selected" : ""}
                      key={mode}
                      type="button"
                      aria-pressed={editorMode === mode}
                      onClick={() => setEditorMode(mode)}
                    >
                      {{ word: "词卡", photo: "图片", audio: "音频" }[mode]}
                    </button>
                  ))}
                </nav>
              )}

              <div className={`content-editor-scroll${sheetMode === "audio" ? " is-audio" : ""}`}>
              {sheetMode === "sentence" && (
                <div className="sentence-picker-list">
                  {sentenceLibrary.map((sentence) => (
                    <Deletable key={sentence} label="这条句卡" onDelete={() => deleteLibrarySentence(sentence)}>
                      <button type="button" onClick={() => fillSentenceFromLibrary(sentence)}>{sentence}</button>
                    </Deletable>
                  ))}
                </div>
              )}

              {sheetMode === "word" && (
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
                    >添加</button>
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
                      <Deletable compact key={word} label={`词卡「${word}」`} onDelete={() => deleteLibraryWord(word)}>
                        <button type="button" onClick={() => {
                          updateBlankWord(blankEditor.index, blankEditor.id, word);
                          setBlankEditor(null);
                        }}>{word}</button>
                      </Deletable>
                    ))}
                  </div>
                </div>
              )}

              {sheetMode === "photo" && (
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
                    {pickerPhotos.map((photo) => (
                      <Deletable key={photo.id} label={`图片：${photo.name}`} onDelete={() => deleteLibraryPhoto(photo)}>
                        <button type="button" className={`uploaded-photo${photo.id === "default-photo" ? " is-pre-rotated" : ""}`} aria-label={`选择图片：${photo.name}`} onClick={() => insertPhotoCard(photo)}>
                          <img src={photo.url || undefined} alt="" />
                        </button>
                      </Deletable>
                    ))}
                  </div>
                </div>
              )}

              {sheetMode === "audio" && (
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
                      <Deletable key={clip.id} label={`录音，时长 ${formatDuration(clip.duration)}`} onDelete={() => deleteAudioClip(clip)}>
                      <button className="audio-clip" type="button" aria-label={`填入录音，时长 ${formatDuration(clip.duration)}`} onClick={() => insertAudioCard(clip)}>
                        <span>0:00</span><i className="audio-waveform" aria-hidden="true">{(clip.waveform ?? AUDIO_WAVEFORM).map((height, index) => <em key={index} style={{ height }} />)}</i><span>{formatDuration(clip.duration)}</span>
                        <img className="audio-play-control" src={icon("audio-play.svg")} alt="播放录音" draggable={false} onClick={(event) => playAudio(event, clip.url)} />
                      </button>
                      </Deletable>
                    )) : <p className="audio-empty-state">录制的声音会出现在这里</p>}
                  </div>
                </div>
              )}
              </div>
            </section>
          </div>
        )}

        {isManageOpen && (
          <section className={`manage-screen manage-screen-${manageSection}${isCardSection ? " manage-screen-cards" : ""}`} aria-label="管理页面">
            <div className="manage-paper" aria-hidden="true" style={{ "--manage-page-mask": `url("${icon(isCardSection ? "library-page-mask.svg" : "manage-page-mask.svg")}")` }} />
            {!isCardSection && <>
              <img className="manage-line manage-line-top" src={icon("manage-line-top.svg")} alt="" />
              <img className="manage-line manage-line-bottom" src={icon("manage-line-bottom.svg")} alt="" />
            </>}
            <button className="manage-back" type="button" aria-label="返回笔记本" onClick={() => setIsManageOpen(false)}>
              <img src={icon(isCardSection ? "library-back.svg" : "manage-back.svg")} alt="" />
            </button>
            <h2>{{ sentences: "句卡管理", words: "词卡管理", images: "图片管理", audio: "音频管理", settings: "内页与颜色" }[manageSection]}</h2>
            {manageSection === "images" ? <>
              <div className="manage-grid" aria-label="图片素材">
                {managedPhotos.map((photo) => (
                  <Deletable key={photo.id} label={`图片：${photo.name}`} onDelete={() => deleteLibraryPhoto(photo)}>
                    <img src={photo.url || undefined} alt={photo.name} />
                  </Deletable>
                ))}
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
                  <Deletable key={clip.id} label={`录音，时长 ${formatDuration(clip.duration)}`} onDelete={() => deleteAudioClip(clip)}>
                  <article className="manage-audio-item">
                    <span>0:00</span>
                    <i className="audio-waveform" aria-hidden="true">{(clip.waveform ?? AUDIO_WAVEFORM).map((height, barIndex) => <em key={barIndex} style={{ height }} />)}</i>
                    <span>{formatDuration(clip.duration)}</span>
                    <button type="button" aria-label={`播放录音，时长 ${formatDuration(clip.duration)}`} onClick={(event) => playAudio(event, clip.url)}>
                      <img src={icon("audio-play.svg")} alt="" draggable={false} />
                    </button>
                  </article>
                  </Deletable>
                )) : <div className="manage-audio-empty">还没有录音<br /><small>在笔记本的音频面板录音后会显示在这里</small></div>}
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
              {manageSection === "words" ? <>
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
                  {[...WORD_CATEGORIES, ...customLibraryCategories].map((category) => <button className={libraryCategory === category ? "is-selected" : ""} key={category} type="button" onClick={() => setLibraryCategory(category)}>{category}</button>)}
                  {isAddingLibraryCategory ? <form className="library-category-add" onSubmit={(event) => {
                    event.preventDefault();
                    const category = newLibraryCategory.trim().slice(0, 8);
                    if (category && ![...WORD_CATEGORIES, ...customLibraryCategories].includes(category)) {
                      setCustomLibraryCategories((categories) => [...categories, category]);
                      setLibraryCategory(category);
                    }
                    setNewLibraryCategory("");
                    setIsAddingLibraryCategory(false);
                  }}>
                    <input autoFocus aria-label="新标签名称" maxLength={8} placeholder="标签名" value={newLibraryCategory} onChange={(event) => setNewLibraryCategory(event.currentTarget.value)} />
                    <button type="submit">添加</button>
                    <button type="button" aria-label="取消添加标签" onClick={() => { setIsAddingLibraryCategory(false); setNewLibraryCategory(""); }}>×</button>
                  </form> : <button className="library-category-add-trigger" type="button" aria-label="添加标签" onClick={() => setIsAddingLibraryCategory(true)}>＋</button>}
                </div>
                <label className="library-search">
                  <input value={librarySearch} placeholder="搜索词语…" onChange={(event) => setLibrarySearch(event.currentTarget.value)} />
                </label>
                <div className="library-word-list">
                  {managedWords.map((word, index) => (
                    <Deletable compact key={word} label={`词卡「${word}」`} onDelete={() => deleteLibraryWord(word)}>
                      <button type="button" style={{ backgroundImage: `url("${icon(`library-word-${index % 5 + 1}.svg`)}")` }}>{word}</button>
                    </Deletable>
                  ))}
                </div>
              </> : <div className="library-sentence-list">
                {sentenceLibrary.map((sentence) => (
                  <Deletable key={sentence} label="这条句卡" onDelete={() => deleteLibrarySentence(sentence)}>
                    <article>{sentence}</article>
                  </Deletable>
                ))}
              </div>}
            </div>}
            <nav className="manage-tabs" aria-label="管理类型">
              <button type="button" aria-label="句卡管理" aria-pressed={manageSection === "sentences"} onClick={() => setManageSection("sentences")}><GlyphTabIcon selected={manageSection === "sentences"} glyph={SentenceCardGlyph} /></button>
              <button type="button" aria-label="词卡管理" aria-pressed={manageSection === "words"} onClick={() => setManageSection("words")}><GlyphTabIcon selected={manageSection === "words"} glyph={WordCardGlyph} /></button>
              <button type="button" aria-label="图片管理" onClick={() => setManageSection("images")}>
                {manageSection === "images" ? <img src={icon("manage-tab-image.svg")} alt="" /> : <span className="library-image-tab"><img src={icon("library-tab-image-base.svg")} alt="" /><img src={icon("library-tab-image-icon.svg")} alt="" /></span>}
              </button>
              <button type="button" aria-label="音频管理" onClick={() => setManageSection("audio")}><img src={icon(manageSection === "audio" ? "manage-tab-audio-selected.svg" : isCardSection ? "library-tab-audio.svg" : "manage-tab-audio.svg")} alt="" /></button>
              <button type="button" aria-label="内页与颜色" onClick={() => setManageSection("settings")}><img src={icon(manageSection === "settings" ? "manage-tab-settings-selected.svg" : "manage-tab-settings.svg")} alt="" /></button>
            </nav>
          </section>
        )}
      </section>
    </main>
  );
}
