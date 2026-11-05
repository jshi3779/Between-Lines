import { common } from '@kit.AbilityKit';
import { cloneNotebook, EditorParams, Notebook, nameIn, setNameIn, WRITERS, writerOf } from '../model/Models';
import { NotebookStore } from '../common/NotebookStore';
import { decodeInvite, Invite } from '../common/InviteCodec';

const INK = '#1E2026';

// 「加入」: paste what a friend sent. A new notebook is joined (you get the next free colour and
// can give your name); a notebook you already have is brought up to the newer copy.
@Entry
@Component
struct Join {
  @State pasted: string = '';
  @State invite: Invite | undefined = undefined;
  @State local: Notebook | undefined = undefined;
  @State myName: string = '';
  @State message: string = '';

  private ctx(): common.UIAbilityContext {
    return this.getUIContext().getHostContext() as common.UIAbilityContext;
  }

  private read(text: string): void {
    this.pasted = text;
    this.message = '';
    this.invite = decodeInvite(text);
    this.local = this.invite !== undefined ? NotebookStore.findShared(this.ctx(), this.invite.book.shareKey) : undefined;
    if (text.trim().length > 0 && this.invite === undefined) {
      this.message = '没有认出邀请内容，请把朋友发来的整段文字都粘贴进来';
    }
  }

  private freeIds(book: Notebook): number[] {
    return WRITERS.map((w) => w.id).filter((id: number) => !book.collaborators.includes(id));
  }

  private openEditor(id: string): void {
    const params = new EditorParams();
    params.id = id;
    this.getUIContext().getRouter().replaceUrl({ url: 'pages/Editor', params: params }).catch(() => {});
  }

  private join(): void {
    if (this.invite === undefined) {
      return;
    }
    const book = cloneNotebook(this.invite.book);
    const free = this.freeIds(book);
    if (free.length === 0) {
      this.message = '这本笔记本已经有 4 位作者了';
      return;
    }
    const me = free[0];
    book.id = book.shareKey;     // the same key on every phone
    book.design = false;         // on a friend's phone it sits on their own shelf
    book.collaborators = book.collaborators.concat([me]).sort((a: number, b: number) => a - b);
    if (this.myName.trim().length > 0) {
      setNameIn(book, me, this.myName);
    }
    book.updatedAt = Date.now();
    NotebookStore.saveOne(this.ctx(), book);
    NotebookStore.setMyId(this.ctx(), book.id, me);
    this.openEditor(book.id);
  }

  // keeps whichever copy is newer, and every writer either copy knows about
  private update(): void {
    if (this.invite === undefined || this.local === undefined) {
      return;
    }
    const local = this.local;
    const incoming = cloneNotebook(this.invite.book);
    incoming.id = local.id;
    incoming.design = local.design;
    incoming.collaborators = Array.from(new Set(local.collaborators.concat(incoming.collaborators))).sort((a: number, b: number) => a - b);
    NotebookStore.saveOne(this.ctx(), incoming);
    this.openEditor(local.id);
  }

  build() {
    Column({ space: 14 }) {
      Row() {
        Text('‹').fontSize(30).fontColor(INK).padding({ right: 12 })
          .onClick(() => this.getUIContext().getRouter().back())
        Text('加入').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
      }
      .width('100%')
      .padding({ top: 40 })

      Text('把朋友发来的整段文字粘贴到下面。加入一本新笔记本，或者拿到朋友写完的最新一页。')
        .fontSize(13)
        .lineHeight(20)
        .fontColor('#7D7A74')

      TextArea({ text: this.pasted, placeholder: '长按粘贴朋友发来的邀请' })
        .height(120)
        .fontSize(13)
        .onChange((value: string) => this.read(value))

      if (this.message.length > 0) {
        Text(this.message).fontSize(13).fontColor('#B53A2F')
      }

      if (this.invite !== undefined) {
        this.preview(this.invite)
      }
    }
    .alignItems(HorizontalAlign.Start)
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20 })
    .backgroundColor('#ECECEA')
  }

  @Builder
  preview(invite: Invite) {
    Column({ space: 12 }) {
      Row({ space: 12 }) {
        Column() {
          Text(invite.book.title).fontSize(14).fontWeight(FontWeight.Bold).fontColor(invite.book.textColor).maxLines(3)
        }
        .width(70)
        .height(96)
        .padding(8)
        .justifyContent(FlexAlign.End)
        .backgroundColor(invite.book.color)
        .borderRadius({ topRight: 6, bottomRight: 6 })

        Column({ space: 6 }) {
          Text(`${nameIn(invite.book, invite.from)} 邀请你一起写《${invite.book.title}》`)
            .fontSize(16).fontWeight(FontWeight.Bold).fontColor(INK)
          Row({ space: 4 }) {
            ForEach(invite.book.collaborators, (id: number) => {
              Text(nameIn(invite.book, id))
                .fontSize(11)
                .fontColor(Color.White)
                .padding({ left: 6, right: 6, top: 2, bottom: 2 })
                .borderRadius(8)
                .backgroundColor(writerOf(id).color)
            }, (id: number) => `${id}`)
          }
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
      }

      if (this.local === undefined) {
        TextInput({ text: this.myName, placeholder: '你的名字（朋友会在笔记本里看到）' })
          .maxLength(8)
          .onChange((value: string) => this.myName = value)
        Button('加入并开始写').width('100%').backgroundColor(INK).onClick(() => this.join())
      } else if ((invite.book.updatedAt ?? 0) > (this.local.updatedAt ?? 0)) {
        Text('你已经有这本笔记本了，这是朋友写过之后的新版本。').fontSize(13).fontColor('#5D594F')
        Button('更新到最新').width('100%').backgroundColor(INK).onClick(() => this.update())
      } else {
        Text('你这边的版本已经是最新的了。').fontSize(13).fontColor('#5D594F')
        Button('打开笔记本').width('100%').backgroundColor(INK).onClick(() => this.openEditor((this.local as Notebook).id))
      }
    }
    .width('100%')
    .padding(16)
    .borderRadius(16)
    .backgroundColor(Color.White)
  }
}
