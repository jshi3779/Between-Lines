import { LEGAL_UPDATED, LegalSection, PRIVACY_POLICY, USER_AGREEMENT } from '../common/LegalTexts';

export class LegalParams {
  kind: string = 'privacy'; // 'privacy' | 'terms'
}

const INK = '#1E2026';

// The privacy policy or the user agreement, readable in the app without a network connection.
@Entry
@Component
struct Legal {
  @State kind: string = 'privacy';

  aboutToAppear(): void {
    const params = this.getUIContext().getRouter().getParams() as LegalParams | undefined;
    if (params !== undefined && params.kind.length > 0) {
      this.kind = params.kind;
    }
  }

  private sections(): LegalSection[] {
    return this.kind === 'terms' ? USER_AGREEMENT : PRIVACY_POLICY;
  }

  build() {
    Column() {
      Row() {
        Text('‹').fontSize(30).fontColor(INK).padding({ right: 12 })
          .onClick(() => this.getUIContext().getRouter().back())
        Text(this.kind === 'terms' ? '用户协议' : '隐私政策').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 40, bottom: 8 })

      Scroll() {
        Column({ space: 16 }) {
          Text(`更新日期：${LEGAL_UPDATED}`).fontSize(12).fontColor('#7D7A74')
          ForEach(this.sections(), (section: LegalSection) => {
            Column({ space: 6 }) {
              Text(section.title).fontSize(16).fontWeight(FontWeight.Bold).fontColor(INK)
              Text(section.body).fontSize(14).lineHeight(22).fontColor('#3B3A36')
            }
            .alignItems(HorizontalAlign.Start)
            .width('100%')
          }, (section: LegalSection) => section.title)
        }
        .alignItems(HorizontalAlign.Start)
        .padding({ left: 20, right: 20, top: 8, bottom: 40 })
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#FBFAF6')
  }
}
