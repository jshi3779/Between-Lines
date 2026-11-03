import { common } from '@kit.AbilityKit';
import {
  Card, cardText, cloneNotebook, GUIDE_TEXTS, EditorParams, Notebook, Part, PART_BLANK, SENTENCE_LIBRARY, WORD_LIBRARY, WordGroup, writerOf
} from '../model/Models';
import { NotebookStore } from '../common/NotebookStore';
import { splitSuggestion, writeFromTheme } from '../common/AiSuggest';

const INK = '#1E2026';
const PAPER = '#FBFAF6';
const EMPTY_CARD = '#E9E4DA';

// The notebook: pages of sentence cards. Tap a card to write in it; the toolbar adds text, an
// empty word card, or a sentence from the library. Tap a word card to fill it in your colour.
@Entry
@Component
struct Editor {
  @State book: Notebook = new Notebook();
  @State page: number = 0;
  @State active: number = -1;      // card being written in
  @State draft: string = '';
  @State showWords: boolean = false;
  @State showSentences: boolean = false;
  @State wordGroup: number = -1;   // -1 = all categories
  @State newWord: string = '';
  // 「AI 写一句」: the theme the writer typed and the sentence written for it
  @State showAi: boolean = false;
  @State aiTheme: string = '';
  @State aiLoading: boolean = false;
  @State aiLine: string = '';
  private aiRound: number = 0;
  private aiAsked: string = '';
  private blankCard: number = -1;
  private blankPart: number = -1;

  private ctx(): common.UIAbilityContext {
    return this.getUIContext().getHostContext() as common.UIAbilityContext;
  }

  /** who is writing on this device: the notebook's first writer, until accounts exist */
  private me(): number {
    return this.book.collaborators.length > 0 ? this.book.collaborators[0] : 1;
  }

  aboutToAppear(): void {
    const params = this.getUIContext().getRouter().getParams() as EditorParams;
    const found = NotebookStore.find(this.ctx(), params.id);
    if (found !== undefined) {
      if (found.pages.length === 0) {
        found.pages = [[]];
      }
      this.book = found;
    }
  }

  private change(edit: (b: Notebook) => void): void {
    const next = cloneNotebook(this.book);
    edit(next);
    this.book = next;
    NotebookStore.saveOne(this.ctx(), next);
  }

  private cards(): Card[] {
    return this.book.pages[this.page] ?? [];
  }

  private appendDraft(b: Notebook): void {
    const text = this.draft.trim();
    if (text.length > 0 && this.active >= 0) {
      b.pages[this.page][this.active].parts.push(Part.text(text));
    }
    this.draft = '';
  }

  private addCard(): void {
    const index = this.cards().length;
    this.change((b: Notebook) => b.pages[this.page].push(Card.of(this.me(), [])));
    this.active = index;
  }

  private addBlank(): void {
    if (this.active < 0) {
      return;
    }
    this.change((b: Notebook) => {
      this.appendDraft(b);
      b.pages[this.page][this.active].parts.push(Part.blank());
    });
  }

  private openBlank(card: number, part: number): void {
    this.blankCard = card;
    this.blankPart = part;
    this.newWord = '';
    this.showWords = true;
  }

  private fillBlank(word: string): void {
    const value = word.trim();
    if (value.length === 0 || this.blankCard < 0) {
      return;
    }
    this.change((b: Notebook) => {
      const part = b.pages[this.page][this.blankCard].parts[this.blankPart];
      part.text = value.slice(0, 6);
      part.by = this.me();
    });
    this.showWords = false;
  }

  private deleteCard(index: number): void {
    this.change((b: Notebook) => b.pages[this.page].splice(index, 1));
    this.active = -1;
  }

  private addPage(): void {
    this.change((b: Notebook) => b.pages.push([]));
    this.page = this.book.pages.length - 1;
    this.active = -1;
  }

  build() {
    Column() {
      // top bar
      Row({ space: 8 }) {
        Text('‹').fontSize(30).fontColor(INK).padding({ right: 8 })
          .onClick(() => this.getUIContext().getRouter().back())
        TextInput({ text: this.book.title })
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .backgroundColor(Color.Transparent)
          .onChange((value: string) => this.change((b: Notebook) => b.title = value.trim().length > 0 ? value : '无标题'))
        Text('邀请').fontSize(14).fontColor(INK)
          .onClick(() => this.getUIContext().getPromptAction().showToast({ message: '邀请好友需要接入后端，下一步再做' }))
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 40 })

      // writers' tags
      Row({ space: 6 }) {
        ForEach(this.book.collaborators, (id: number) => {
          Column() {
            Text(writerOf(id).name.charAt(0))
              .fontSize(12)
              .width(28)
              .height(28)
              .textAlign(TextAlign.Center)
              .borderRadius(14)
              .backgroundColor(Color.White)
          }
          .padding({ left: 5, right: 5, top: 14, bottom: 6 })
          .backgroundColor(writerOf(id).color)
          .borderRadius({ bottomLeft: 12, bottomRight: 12, topLeft: 6, topRight: 6 })
        }, (id: number) => `${id}`)
        Blank()
        Text('‹').fontSize(22).opacity(this.page > 0 ? 1 : 0.3)
          .onClick(() => { if (this.page > 0) { this.page--; this.active = -1; } })
        Text(`${this.page + 1} / ${this.book.pages.length}`).fontSize(16).margin({ left: 6, right: 6 })
        Text('›').fontSize(22).opacity(this.page < this.book.pages.length - 1 ? 1 : 0.3)
          .onClick(() => { if (this.page < this.book.pages.length - 1) { this.page++; this.active = -1; } })
        Text('＋页').fontSize(14).margin({ left: 10 }).onClick(() => this.addPage())
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 8, bottom: 8 })
      .alignItems(VerticalAlign.Bottom)

      Divider().strokeWidth(2).color(INK).margin({ left: 12, right: 12 })

      // sentence cards
      List({ space: 10 }) {
        ForEach(this.cards(), (card: Card, i: number) => {
          ListItem() {
            this.cardView(card, i)
          }
        }, (card: Card, i: number) => `${this.page}-${i}-${this.active === i}-${JSON.stringify(card)}`)
        ListItem() {
          Text('＋')
            .fontSize(26)
            .fontColor('#6B6A66')
            .width('100%')
            .height(56)
            .textAlign(TextAlign.Center)
            .border({ width: 2, color: '#8B867C', style: BorderStyle.Dashed, radius: 28 })
            .onClick(() => this.addCard())
        }
      }
      .layoutWeight(1)
      .padding({ left: 12, right: 12, top: 14 })
      // one sheet per component: the word sheet sits on the page, the AI sheet on the card list
      .bindSheet($$this.showAi, this.aiSheet(), { height: 420, dragBar: true, title: { title: 'AI 写一句' } })

      if (this.active >= 0) {
        this.writingBar()
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(PAPER)
    .bindSheet($$this.showWords, this.wordSheet(), { height: 460, dragBar: true, title: { title: '词卡' } })
  }

  @Builder
  cardView(card: Card, i: number) {
    Row({ space: 12 }) {
      Text(writerOf(card.avatar).name.charAt(0))
        .fontSize(14)
        .width(42)
        .height(42)
        .textAlign(TextAlign.Center)
        .borderRadius(21)
        .backgroundColor(Color.White)
        .border({ width: 3, color: writerOf(card.avatar).color })

      Flex({ wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
        if (card.parts.length === 0) {
          Text('写点什么…').fontSize(17).fontColor('#B1AC9F')
        }
        ForEach(card.parts, (part: Part, j: number) => {
          if (part.kind === PART_BLANK) {
            Text(part.text.length > 0 ? part.text : '　　　')
              .fontSize(16)
              .fontColor(Color.White)
              .padding({ left: 10, right: 10, top: 3, bottom: 3 })
              .margin({ left: 4, right: 4, top: 3, bottom: 3 })
              .borderRadius(10)
              .backgroundColor(part.by > 0 ? writerOf(part.by).color : EMPTY_CARD)
              .border(part.by > 0 ? { width: 0 } : { width: 1.5, color: '#79746D', style: BorderStyle.Dashed, radius: 10 })
              .onClick(() => this.openBlank(i, j))
          } else {
            Text(part.text).fontSize(17).fontColor(INK)
          }
        }, (part: Part, j: number) => `${j}-${part.kind}-${part.text}-${part.by}`)
      }
      .layoutWeight(1)
    }
    .width('100%')
    .padding(12)
    .borderRadius(18)
    .backgroundColor(this.active === i ? Color.White : Color.Transparent)
    .shadow(this.active === i ? { radius: 10, color: '#1A000000', offsetY: 4 } : { radius: 0, color: Color.Transparent })
    .onClick(() => { this.active = i; this.draft = ''; })
  }

  @Builder
  writingBar() {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        TextInput({ text: this.draft, placeholder: '写下这句…' })
          .layoutWeight(1)
          .onChange((value: string) => this.draft = value)
          .onSubmit(() => this.change((b: Notebook) => this.appendDraft(b)))
        Button('写入').backgroundColor(INK).onClick(() => this.change((b: Notebook) => this.appendDraft(b)))
      }

      Row() {
        this.toolButton('AI', () => this.openAi())
        this.toolButton('句卡', () => this.showSentences = true)
        this.toolButton('词卡', () => this.addBlank())
        this.toolButton('删除', () => this.deleteCard(this.active))
        this.toolButton('完成', () => { this.change((b: Notebook) => this.appendDraft(b)); this.active = -1; })
      }
      .width('100%')
      .justifyContent(FlexAlign.SpaceAround)
    }
    .width('100%')
    .padding({ left: 16, right: 16, top: 12, bottom: 28 })
    .backgroundColor(Color.White)
    .shadow({ radius: 20, color: '#22000000', offsetY: -4 })
    .bindSheet($$this.showSentences, this.sentenceSheet(), { height: 420, dragBar: true, title: { title: '句卡库' } })
  }

  @Builder
  toolButton(label: string, action: () => void) {
    Text(label)
      .fontSize(14)
      .fontColor(Color.White)
      .backgroundColor(INK)
      .borderRadius(18)
      .padding({ left: 16, right: 16, top: 8, bottom: 8 })
      .onClick(action)
  }

  @Builder
  wordSheet() {
    Column({ space: 14 }) {
      Row({ space: 8 }) {
        TextInput({ text: this.newWord, placeholder: '输入一个新词…' })
          .maxLength(6)
          .layoutWeight(1)
          .onChange((value: string) => this.newWord = value)
          .onSubmit(() => this.fillBlank(this.newWord))
        Button('添加').backgroundColor(INK).onClick(() => this.fillBlank(this.newWord))
      }

      Row({ space: 6 }) {
        this.groupChip('全部', -1)
        ForEach(WORD_LIBRARY, (g: WordGroup, k: number) => {
          this.groupChip(g.name, k)
        }, (g: WordGroup) => g.name)
      }
      .width('100%')

      Flex({ wrap: FlexWrap.Wrap }) {
        ForEach(this.visibleWords(), (word: string) => {
          Text(word)
            .fontSize(15)
            .padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .margin(4)
            .borderRadius(10)
            .backgroundColor('#EFE7DB')
            .onClick(() => this.fillBlank(word))
        }, (word: string) => word)
      }
    }
    .padding(20)
  }

  @Builder
  groupChip(name: string, index: number) {
    Text(name)
      .fontSize(14)
      .padding({ left: 12, right: 12, top: 5, bottom: 5 })
      .borderRadius(12)
      .fontColor(this.wordGroup === index ? Color.White : '#5A5C62')
      .backgroundColor(this.wordGroup === index ? INK : '#EFE7DB')
      .onClick(() => this.wordGroup = index)
  }

  /** sentences the writers have actually written (not the example cards) */
  private ownSentences(): string[] {
    const out: string[] = [];
    this.book.pages.forEach((cards: Card[]) => cards.forEach((card: Card) => {
      const text = cardText(card).trim();
      if (text.length > 0 && !GUIDE_TEXTS.includes(text)) {
        out.push(text);
      }
    }));
    return out;
  }

  private openAi(): void {
    this.aiTheme = '';
    this.aiLine = '';
    this.aiAsked = '';
    this.aiRound = 0;
    this.showAi = true;
  }

  // the same theme again is 「换一句」 (next round); a new theme starts over
  private writeWithAi(themeText: string): void {
    const theme = themeText.trim();
    this.aiRound = theme === this.aiAsked && this.aiLine.length > 0 ? this.aiRound + 1 : 0;
    this.aiTheme = theme;
    this.aiLoading = true;
    writeFromTheme(theme, this.book.title, this.ownSentences(), this.aiRound).then((line: string) => {
      this.aiLine = line;
      this.aiAsked = theme;
      this.aiLoading = false;
    });
  }

  // an empty or example card takes the sentence; otherwise it becomes a new card on the page
  private useAiLine(line: string): void {
    if (this.active < 0) {
      return;
    }
    const card = this.cards()[this.active];
    const text = cardText(card).trim();
    const plain = card.parts.every((p: Part) => p.kind !== PART_BLANK);
    const replace = plain && (text.length === 0 || GUIDE_TEXTS.includes(text));
    const index = replace ? this.active : this.cards().length;
    this.change((b: Notebook) => {
      if (replace) {
        b.pages[this.page][this.active].parts = splitSuggestion(line);
      } else {
        b.pages[this.page].push(Card.of(this.me(), splitSuggestion(line)));
      }
    });
    this.active = index;
    this.showAi = false;
  }

  private aiThemes(): string[] {
    const themes: string[] = [];
    if (this.book.title !== '无标题' && !this.book.title.startsWith('未命名诗本')) {
      themes.push(this.book.title);
    }
    return themes.concat(['初到新城市', '想念朋友', '雨天']);
  }

  @Builder
  aiSheet() {
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        TextInput({ text: this.aiTheme, placeholder: '比如：初到新城市，和朋友分开了' })
          .maxLength(30)
          .layoutWeight(1)
          .onChange((value: string) => this.aiTheme = value)
          .onSubmit(() => { if (!this.aiLoading) { this.writeWithAi(this.aiTheme); } })
        Button('生成')
          .backgroundColor(INK)
          .enabled(!this.aiLoading)
          .onClick(() => this.writeWithAi(this.aiTheme))
      }

      Flex({ wrap: FlexWrap.Wrap }) {
        ForEach(this.aiThemes(), (theme: string) => {
          Text(theme)
            .fontSize(13)
            .fontColor('#5A5C62')
            .padding({ left: 10, right: 10, top: 4, bottom: 4 })
            .margin({ right: 6, bottom: 6 })
            .borderRadius(10)
            .backgroundColor('#EFE7DB')
            .onClick(() => { if (!this.aiLoading) { this.writeWithAi(theme); } })
        }, (theme: string) => theme)
      }

      if (this.aiLoading) {
        Row({ space: 8 }) {
          LoadingProgress().width(22).height(22).color('#79746D')
          Text('正在写…').fontSize(14).fontColor('#79746D')
        }
      } else if (this.aiLine.length > 0) {
        Flex({ wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
          ForEach(splitSuggestion(this.aiLine), (part: Part, k: number) => {
            if (part.kind === PART_BLANK) {
              Text('　　　')
                .fontSize(14)
                .margin({ left: 4, right: 4 })
                .backgroundColor(EMPTY_CARD)
                .border({ width: 1.5, color: '#79746D', style: BorderStyle.Dashed, radius: 10 })
            } else {
              Text(part.text).fontSize(16).fontColor(INK)
            }
          }, (part: Part, k: number) => `${k}-${part.kind}-${part.text}`)
        }
        .width('100%')
        .padding({ left: 14, right: 14, top: 12, bottom: 12 })
        .borderRadius(14)
        .backgroundColor(Color.White)
        .border({ width: 1.5, color: '#ECEDF0', radius: 14 })

        Row({ space: 8 }) {
          Button('放进句卡').layoutWeight(1).backgroundColor(INK).onClick(() => this.useAiLine(this.aiLine))
          Button('换一句').layoutWeight(1).backgroundColor('#ECEDF0').fontColor(INK)
            .onClick(() => this.writeWithAi(this.aiAsked))
        }
      }
    }
    .alignItems(HorizontalAlign.Start)
    .padding(20)
  }

  private visibleWords(): string[] {
    if (this.wordGroup >= 0) {
      return WORD_LIBRARY[this.wordGroup].words;
    }
    const all: string[] = [];
    WORD_LIBRARY.forEach((g: WordGroup) => g.words.forEach((w: string) => all.push(w)));
    return all;
  }

  @Builder
  sentenceSheet() {
    List({ space: 8 }) {
      ForEach(SENTENCE_LIBRARY, (sentence: string) => {
        ListItem() {
          Text(sentence)
            .fontSize(15)
            .width('100%')
            .padding({ left: 14, right: 14, top: 10, bottom: 10 })
            .borderRadius(14)
            .backgroundColor('#ECEDF0')
            .onClick(() => {
              this.change((b: Notebook) => b.pages[this.page][this.active].parts.push(Part.text(sentence)));
              this.showSentences = false;
            })
        }
      }, (sentence: string) => sentence)
    }
    .padding(20)
  }
}
