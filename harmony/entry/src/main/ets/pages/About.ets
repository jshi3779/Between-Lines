import { bundleManager } from '@kit.AbilityKit';
import { APP_NAME } from '../common/LegalTexts';
import { LegalParams } from './Legal';

const INK = '#1E2026';

// 关于: app version, privacy policy and user agreement.
@Entry
@Component
struct About {
  @State version: string = '';

  aboutToAppear(): void {
    try {
      const info = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT);
      this.version = info.versionName;
    } catch (e) {
      this.version = '';
    }
  }

  private openLegal(kind: string): void {
    const params = new LegalParams();
    params.kind = kind;
    this.getUIContext().getRouter().pushUrl({ url: 'pages/Legal', params: params }).catch(() => {});
  }

  build() {
    Column() {
      Row() {
        Text('‹').fontSize(30).fontColor(INK).padding({ right: 12 })
          .onClick(() => this.getUIContext().getRouter().back())
        Text('关于').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 40, bottom: 8 })

      Column({ space: 6 }) {
        Text(APP_NAME).fontSize(30).fontWeight(FontWeight.Bold).letterSpacing(6).fontColor(INK)
        Text('和朋友一起写拼贴诗').fontSize(13).fontColor('#7D7A74')
        if (this.version.length > 0) {
          Text(`版本 ${this.version}`).fontSize(12).fontColor('#B1AC9F').margin({ top: 6 })
        }
      }
      .margin({ top: 48, bottom: 40 })

      Column() {
        this.row('隐私政策', () => this.openLegal('privacy'))
        Divider().color('#E4DFD2').margin({ left: 16, right: 16 })
        this.row('用户协议', () => this.openLegal('terms'))
      }
      .width('90%')
      .borderRadius(16)
      .backgroundColor(Color.White)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#ECECEA')
  }

  @Builder
  row(label: string, action: () => void) {
    Row() {
      Text(label).fontSize(16).fontColor(INK)
      Blank()
      Text('›').fontSize(20).fontColor('#B1AC9F')
    }
    .width('100%')
    .height(52)
    .padding({ left: 16, right: 16 })
    .onClick(action)
  }
}
