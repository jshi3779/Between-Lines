import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { Notebook, seedNotebooks } from '../model/Models';

// Everything is saved on the device for now (the web prototype used localStorage). Syncing
// notebooks between friends needs a backend, which comes later.
const STORE_NAME = 'kouzhi';
const KEY_NOTEBOOKS = 'notebooks';
const KEY_SEQ = 'newBookSeq';
const LOG_DOMAIN = 0x0001;

function prefs(context: common.Context): preferences.Preferences | undefined {
  try {
    return preferences.getPreferencesSync(context, { name: STORE_NAME });
  } catch (e) {
    hilog.error(LOG_DOMAIN, 'NotebookStore', 'open preferences failed: %{public}s', JSON.stringify(e));
    return undefined;
  }
}

function write(p: preferences.Preferences, key: string, value: preferences.ValueType): void {
  try {
    p.putSync(key, value);
    p.flush().catch(() => {});
  } catch (e) {
    hilog.error(LOG_DOMAIN, 'NotebookStore', 'save failed: %{public}s', JSON.stringify(e));
  }
}

export class NotebookStore {
  static load(context: common.Context): Notebook[] {
    const p = prefs(context);
    let raw = '';
    try {
      raw = p !== undefined ? p.getSync(KEY_NOTEBOOKS, '') as string : '';
    } catch (e) {
      raw = '';
    }
    if (raw.length > 0) {
      try {
        return JSON.parse(raw) as Notebook[];
      } catch (e) {
        hilog.error(LOG_DOMAIN, 'NotebookStore', 'saved notebooks unreadable, starting over');
      }
    }
    const seeded = seedNotebooks();
    NotebookStore.saveAll(context, seeded);
    return seeded;
  }

  static saveAll(context: common.Context, books: Notebook[]): void {
    const p = prefs(context);
    if (p !== undefined) {
      write(p, KEY_NOTEBOOKS, JSON.stringify(books));
    }
  }

  static find(context: common.Context, id: string): Notebook | undefined {
    return NotebookStore.load(context).find((b: Notebook) => b.id === id);
  }

  static saveOne(context: common.Context, book: Notebook): void {
    const books = NotebookStore.load(context);
    const i = books.findIndex((b: Notebook) => b.id === book.id);
    if (i >= 0) {
      books[i] = book;
    } else {
      books.push(book);
    }
    NotebookStore.saveAll(context, books);
  }

  static remove(context: common.Context, id: string): void {
    NotebookStore.saveAll(context, NotebookStore.load(context).filter((b: Notebook) => b.id !== id));
  }

  /** "未命名诗本", "未命名诗本 2", … */
  static nextNewTitle(context: common.Context): string {
    const p = prefs(context);
    let seq = 1;
    if (p !== undefined) {
      try {
        seq = (p.getSync(KEY_SEQ, 0) as number) + 1;
      } catch (e) {
        seq = 1;
      }
      write(p, KEY_SEQ, seq);
    }
    return seq > 1 ? `未命名诗本 ${seq}` : '未命名诗本';
  }
}
