// Data model, mirroring the web prototype: a notebook has pages, a page has sentence cards, and a
// card is a row of parts — plain text, or a word card ("blank") that someone fills in with a word.

/** A person writing in a notebook. The colour marks everything they write. */
export class Writer {
  id: number;
  name: string;
  color: string;

  constructor(id: number, name: string, color: string) {
    this.id = id;
    this.name = name;
    this.color = color;
  }
}

export const WRITERS: Writer[] = [
  new Writer(1, '阿禾', '#F6BE45'),
  new Writer(2, '小满', '#EC4E99'),
  new Writer(3, '叶子', '#3465D6'),
  new Writer(4, '南风', '#1D9C6C'),
];

export function writerOf(id: number): Writer {
  const found = WRITERS.find((w: Writer) => w.id === id);
  return found !== undefined ? found : WRITERS[0];
}

/** Router params for the editor page. */
export class EditorParams {
  id: string = '';
}

export const PART_TEXT = 'text';
export const PART_BLANK = 'blank';

export class Part {
  kind: string = PART_TEXT;
  text: string = '';
  /** writer who filled a word card; 0 while it is still empty */
  by: number = 0;

  static text(value: string): Part {
    const p = new Part();
    p.text = value;
    return p;
  }

  static blank(): Part {
    const p = new Part();
    p.kind = PART_BLANK;
    return p;
  }
}

export class Card {
  avatar: number = 1;
  parts: Part[] = [];

  static of(avatar: number, parts: Part[]): Card {
    const c = new Card();
    c.avatar = avatar;
    c.parts = parts;
    return c;
  }
}

export class Notebook {
  id: string = '';
  title: string = '无标题';
  color: string = '#3A4F84';
  textColor: string = '#FDFDFB';
  /** the five notebooks from the design shelf */
  design: boolean = false;
  collaborators: number[] = [1];
  pages: Card[][] = [];
}

/** Returns a deep copy, so a changed notebook can be assigned back to @State and re-render. */
export function cloneNotebook(book: Notebook): Notebook {
  return JSON.parse(JSON.stringify(book)) as Notebook;
}

export function guideCards(avatar: number): Card[] {
  return [
    Card.of(avatar, [Part.text('点「词卡」留一个空，再点它填词')]),
    Card.of(avatar, [Part.text('如今，十月的光落下来，已经不一样了。')]),
  ];
}

class DesignSpec {
  id: string;
  title: string;
  color: string;
  textColor: string;

  constructor(id: string, title: string, color: string, textColor: string) {
    this.id = id;
    this.title = title;
    this.color = color;
    this.textColor = textColor;
  }
}

const DESIGN_BOOKS: DesignSpec[] = [
  new DesignSpec('green', '听风说路过人间', '#317931', '#FDFDFB'),
  new DesignSpec('pink', '蓝是静止的火焰', '#DC99BA', '#B0497C'),
  new DesignSpec('navy', '扣指成诗', '#3A4F84', '#FFCE5D'),
  new DesignSpec('dnavy', '月亮裁缝铺', '#2C3159', '#709DFF'),
  new DesignSpec('gray', '把黄昏折进信封', '#595959', '#FDFDFB'),
];

export function seedNotebooks(): Notebook[] {
  return DESIGN_BOOKS.map((spec: DesignSpec, i: number) => {
    const book = new Notebook();
    book.id = spec.id;
    book.title = spec.title;
    book.color = spec.color;
    book.textColor = spec.textColor;
    book.design = true;
    book.collaborators = [1, 2, 3, 4];
    book.pages = [guideCards((i % 4) + 1)];
    return book;
  });
}

/** Palette offered when making a new notebook (same as the web shelf). */
export const BOOK_PALETTE: string[] = ['#3D8A4F', '#C8577A', '#3A4F84', '#E0632C', '#6A6A6A', '#8A5CB0', '#1F9C96'];

export class WordGroup {
  name: string;
  words: string[];

  constructor(name: string, words: string[]) {
    this.name = name;
    this.words = words;
  }
}

export const WORD_LIBRARY: WordGroup[] = [
  new WordGroup('自然', ['雨', '苔藓', '风', '树影', '月光', '霜冻']),
  new WordGroup('时间', ['十月', '黄昏', '清晨', '午夜', '星期二']),
  new WordGroup('地点', ['格拉斯哥', '站台', '咖啡馆', '窗边', '河岸']),
  new WordGroup('心情', ['想念', '犹豫', '温柔', '孤独', '安静']),
];

export const SENTENCE_LIBRARY: string[] = [
  '如今，十月的光落下来，已经不一样了。',
  '我把今天折好，放进你的信封。',
  '风从路口经过，替我们读完这一页。',
  '你那边，是不是也在下雨？',
];
