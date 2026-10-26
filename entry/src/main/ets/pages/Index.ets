import { common } from '@kit.AbilityKit';
import { BOOK_PALETTE, EditorParams, guideCards, Notebook, writerOf } from '../model/Models';
import { NotebookStore } from '../common/NotebookStore';

const INK = '#1E2026';
const WALL = '#ECECEA';
const SPINE_W = 44;
const BOOK_H = 220;
const COVER_W = 150;

// The shelf: the first row holds the five design notebooks, the second row the user's own.
// Tap a spine to stand the notebook up and show its cover; tap the cover to open it.
@Entry
@Component
struct Index {
  @State books: Notebook[] = [];
  @State openId: string = '';

  private ctx(): common.UIAbilityContext {
    return this.getUIContext().getHostContext() as common.UIAbilityContext;
  }

  onPageShow(): void {
    this.books = NotebookStore.load(this.ctx());
  }

  private openBook(book: Notebook): void {
    const params = new EditorParams();
    params.id = book.id;
    this.getUIContext().getRouter().pushUrl({ url: 'pages/Editor', params: params }).catch(() => {});
  }

  private tapBook(book: Notebook): void {
    if (this.openId === book.id) {
      this.openBook(book);
      return;
    }
    this.getUIContext().animateTo({ duration: 320, curve: Curve.EaseInOut }, () => {
      this.openId = book.id;
    });
  }

  private newNotebook(): void {
    const ctx = this.ctx();
    const own = this.books.filter((b: Notebook) => !b.design).length;
    const book = new Notebook();
    book.id = `new-${Date.now()}`;
    book.title = NotebookStore.nextNewTitle(ctx);
    book.color = BOOK_PALETTE[own % BOOK_PALETTE.length];
    book.collaborators = [1];
    book.pages = [guideCards(1)];
    NotebookStore.saveOne(ctx, book);
    this.books = NotebookStore.load(ctx);
    this.getUIContext().animateTo({ duration: 320 }, () => {
      this.openId = book.id;
    });
  }

  private confirmDelete(book: Notebook): void {
    this.getUIContext().showAlertDialog({
      title: `删除「${book.title}」？`,
      message: '删除后无法恢复。',
      primaryButton: { value: '取消', action: () => {} },
      secondaryButton: {
        value: '删除',
        fontColor: '#B53A2F',
        action: () => {
          NotebookStore.remove(this.ctx(), book.id);
          this.books = NotebookStore.load(this.ctx());
          this.openId = '';
        }
      }
    });
  }

  build() {
    Column() {
      Column() {
        Text('扣指成诗').fontSize(34).fontWeight(FontWeight.Bold).letterSpacing(6).fontColor(INK)
        Text('我的笔记本').fontSize(11).letterSpacing(3).fontColor('#3B3A36').margin({ top: 4 })
      }
      .padding({ top: 56, bottom: 20 })

      Scroll() {
        Column() {
          this.shelf(this.books.filter((b: Notebook) => b.design), false)
          this.shelf(this.books.filter((b: Notebook) => !b.design), true)
        }
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)

      Button('＋ 新建笔记本')
        .backgroundColor(INK)
        .fontColor(Color.White)
        .height(48)
        .width('86%')
        .margin({ top: 8, bottom: 28 })
        .onClick(() => this.newNotebook())
    }
    .width('100%')
    .height('100%')
    .backgroundColor(WALL)
  }

  @Builder
  shelf(list: Notebook[], own: boolean) {
    Column() {
      Scroll() {
        Row({ space: 10 }) {
          ForEach(list, (book: Notebook) => {
            this.bookView(book, own)
          }, (book: Notebook) => `${book.id}|${book.title}|${book.color}|${this.openId === book.id}`)
          if (own && list.length === 0) {
            Column() {
              Text('这一层留给你自己的诗集').fontSize(16).fontColor(INK)
              Text('点这里，或点下方「新建笔记本」').fontSize(12).fontColor('#5D594F').margin({ top: 8 })
            }
            .width(250)
            .height(120)
            .justifyContent(FlexAlign.Center)
            .border({ width: 2, color: '#B9B4A8', style: BorderStyle.Dashed, radius: 16 })
            .onClick(() => this.newNotebook())
          }
        }
        .alignItems(VerticalAlign.Bottom)
        .padding({ left: 20, right: 20 })
        .height(BOOK_H + 20)
      }
      .scrollable(ScrollDirection.Horizontal)
      .scrollBar(BarState.Off)

      // the shelf board
      Row().width('100%').height(8).backgroundColor(INK).borderRadius(4)
    }
    .margin({ bottom: 28 })
  }

  @Builder
  bookView(book: Notebook, own: boolean) {
    if (this.openId === book.id) {
      // standing up: the cover
      Column() {
        Row() {
          Blank()
          if (own) {
            Text('删除').fontSize(12).fontColor(book.textColor).onClick(() => this.confirmDelete(book))
          }
        }
        .width('100%')

        Column()
          .width('100%')
          .height(110)
          .margin({ top: 8 })
          .borderRadius(10)
          .backgroundColor('#F3F0E9')

        Text(book.title)
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor(book.textColor)
          .maxLines(2)
          .width('100%')
          .margin({ top: 12 })

        Blank()

        // avatars appear once the notebook has been shared
        if (book.collaborators.length > 1) {
          Row({ space: -6 }) {
            ForEach(book.collaborators.slice(0, 4), (id: number) => {
              Text(writerOf(id).name.charAt(0))
                .fontSize(10)
                .width(22)
                .height(22)
                .textAlign(TextAlign.Center)
                .borderRadius(11)
                .backgroundColor(Color.White)
                .border({ width: 2, color: writerOf(id).color })
            }, (id: number) => `${id}`)
          }
          .width('100%')
        }
      }
      .width(COVER_W)
      .height(BOOK_H)
      .padding(12)
      .backgroundColor(book.color)
      .borderRadius({ topRight: 8, bottomRight: 8 })
      .shadow({ radius: 16, color: '#33000000', offsetY: 8 })
      .onClick(() => this.tapBook(book))
    } else {
      // leaning: the spine, title read bottom to top
      Stack() {
        Text(book.title)
          .fontSize(15)
          .fontColor(book.textColor)
          .width(BOOK_H - 24)
          .height(SPINE_W)
          .textAlign(TextAlign.Center)
          .maxLines(1)
          .rotate({ angle: -90 })
      }
      .width(SPINE_W)
      .height(BOOK_H)
      .clip(true)
      .backgroundColor(book.color)
      .borderRadius(3)
      .onClick(() => this.tapBook(book))
    }
  }
}
