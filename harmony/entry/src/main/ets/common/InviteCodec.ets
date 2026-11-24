import { util } from '@kit.ArkTS';
import { Notebook, nameIn } from '../model/Models';

// Inviting without a server: the notebook travels as a block of text that the writer sends through
// the phone's share sheet (WeChat, messages…). A friend pastes it into 「加入」 to join; after
// writing they send it back the same way, and whoever pastes the newer copy gets the latest page.

const MARK = 'KZCS1:';

class InvitePayload {
  from: number = 1;
  book: Notebook = new Notebook();
}

export class Invite {
  /** writer id of the person who sent it */
  from: number = 1;
  book: Notebook = new Notebook();
}

/** The message to send: a readable line for the chat, then the notebook itself. */
export function encodeInvite(book: Notebook, from: number): string {
  const payload = new InvitePayload();
  payload.from = from;
  payload.book = book;
  const bytes = new util.TextEncoder().encodeInto(JSON.stringify(payload));
  const code = new util.Base64Helper().encodeToStringSync(bytes);
  return `【扣指成诗】${nameIn(book, from)} 邀请你一起写《${book.title}》\n` +
    `复制这整段文字，打开「扣指成诗」，在书架右上角点「加入」粘贴即可。\n${MARK}${code}`;
}

/** Reads an invite out of whatever was pasted; undefined if there is none or it is damaged. */
export function decodeInvite(text: string): Invite | undefined {
  const at = text.indexOf(MARK);
  if (at < 0) {
    return undefined;
  }
  const code = text.slice(at + MARK.length).replace(/[^A-Za-z0-9+/=]/g, '');
  try {
    const bytes = new util.Base64Helper().decodeSync(code);
    const json = util.TextDecoder.create('utf-8').decodeToString(bytes);
    const payload = JSON.parse(json) as InvitePayload;
    if (payload.book === undefined || payload.book.shareKey === undefined || payload.book.shareKey.length === 0
      || !Array.isArray(payload.book.pages)) {
      return undefined;
    }
    const invite = new Invite();
    invite.from = payload.from;
    invite.book = payload.book;
    return invite;
  } catch (e) {
    return undefined;
  }
}
