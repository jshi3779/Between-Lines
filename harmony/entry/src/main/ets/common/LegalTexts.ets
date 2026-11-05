// Privacy policy and user agreement, shown in the app (pages/Legal) and mirrored on the web at
// https://jshi3779.github.io/Between-Lines/legal/privacy.html and …/legal/terms.html — keep the
// two in step when either changes.

export const APP_NAME = '扣指成诗';
export const LEGAL_UPDATED = '2026年11月5日';
/** fill in before release: an address users can reach the developer at */
export const CONTACT = '（上架前填写联系邮箱）';

export const PRIVACY_URL = 'https://jshi3779.github.io/Between-Lines/legal/privacy.html';
export const TERMS_URL = 'https://jshi3779.github.io/Between-Lines/legal/terms.html';

export class LegalSection {
  title: string;
  body: string;

  constructor(title: string, body: string) {
    this.title = title;
    this.body = body;
  }
}

export const PRIVACY_POLICY: LegalSection[] = [
  new LegalSection('概述', `「${APP_NAME}」是一款拼贴诗笔记本应用。我们重视你的隐私，本政策说明本应用如何处理你的信息。本应用当前版本不需要注册账号，我们不收集、不上传任何个人信息。`),
  new LegalSection('我们处理的信息', '你在应用里创建的笔记本、句卡、词卡和设置，只保存在你的设备上（应用的本地存储），不会发送到我们或任何第三方的服务器。卸载应用或清除应用数据后，这些内容会被删除，且无法恢复。'),
  new LegalSection('邀请朋友', '当你使用「邀请」时，这本笔记本的内容（句子、词卡、作者名字和颜色）会被编码成一段文字，通过系统分享或剪贴板，由你发送给你选择的人。这段文字只经过你选择的应用（例如聊天软件），不经过我们的服务器；收到的人在「加入」里粘贴后，内容保存在他们自己的设备上。请只把邀请发给你信任的人。'),
  new LegalSection('权限', '当前版本不申请相机、麦克风、位置、通讯录等敏感权限。如果以后的版本需要用到某项权限（例如拍照放入图片卡），我们会在使用该功能时向你单独说明并征得同意。'),
  new LegalSection('「AI 写一句」', '「AI 写一句」根据你输入的主题，在设备上从预置的句子和句式中生成句卡。你输入的主题不会上传，也不会用于任何其他目的。'),
  new LegalSection('第三方', '本应用没有接入第三方统计、广告或登录服务，我们不与任何第三方共享你的信息。'),
  new LegalSection('未成年人', '如果你是未满 14 周岁的未成年人，请在监护人的陪同下阅读本政策并使用本应用。'),
  new LegalSection('政策更新', '如果本政策发生变化，我们会在应用内提示你，并在你同意后生效。'),
  new LegalSection('联系我们', `如对本政策有任何疑问，请联系：${CONTACT}`),
];

export const USER_AGREEMENT: LegalSection[] = [
  new LegalSection('协议范围', `欢迎使用「${APP_NAME}」。本协议是你与本应用开发者之间关于使用本应用的约定。使用本应用即表示你已阅读并同意本协议。`),
  new LegalSection('你的内容', '你在本应用中写下的句子、词卡和其他内容归你所有。内容只保存在你的设备上，请自行注意备份；因设备损坏、卸载应用或清除数据造成的内容丢失，开发者无法恢复。'),
  new LegalSection('使用规范', '请勿利用本应用创作、存储或传播违反法律法规、侵犯他人合法权益或违背公序良俗的内容。'),
  new LegalSection('「AI 写一句」', '「AI 写一句」生成的句子仅供创作参考，由你决定是否使用及如何修改。'),
  new LegalSection('服务变更', '开发者可能会更新、调整或停止部分功能，并会尽量提前在应用内告知。'),
  new LegalSection('免责', '本应用按现状提供。在法律允许的范围内，开发者不对因使用或无法使用本应用造成的间接损失承担责任。'),
  new LegalSection('联系我们', `如对本协议有任何疑问，请联系：${CONTACT}`),
];
