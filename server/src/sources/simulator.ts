import type { Game } from '../game.js';

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô'];
const TEN = ['Tuấn', 'Hùng', 'Linh', 'Trang', 'Nam', 'Hà', 'Minh', 'Quân', 'Phương', 'Đức', 'Long', 'Hoa', 'Sơn', 'Thảo', 'Khánh', 'Bảo'];
const NICK_STYLE = [
  (h: string, t: string) => `${t} ${h}`,
  (_h: string, t: string) => `${t.toLowerCase()}${Math.floor(Math.random() * 99)}`,
  (_h: string, t: string) => `${t} Nam Định`,
  (_h: string, t: string) => `anh ${t.toLowerCase()} bốn bể`,
];

const CHATTER: [string, number][] = [
  ['ăn cơm', 6], ['bát cháo', 3], ['anh thanh toán rồi', 2], ['quang ơi', 1], ['một hai ba dô', 3],
  ['anh Trường ơi', 2], ['mâm em hết cơm rồi', 1], ['hay quá', 4], ['vui ghê', 4], ['=))', 3],
  ['mâm {n}', 2], ['ra về', 0.6], ['nhập tiệc', 1], ['ngon quá anh ơi', 3],
  // câu tự do (rule không bắt được → thử tầng AI)
  ['món gà nhìn hấp dẫn thế', 1.5], ['anh ơi bao giờ có cháo?', 1], ['vui quá haha', 2], ['cho em xin miếng nem', 1],
];
const totalW = CHATTER.reduce((s, [, w]) => s + w, 0);

function chatter() {
  let r = Math.random() * totalW;
  for (const [t, w] of CHATTER) { r -= w; if (r <= 0) return t.replace('{n}', String(1 + Math.floor(Math.random() * 9))); }
  return 'ăn cơm';
}

const EVENT_CHAT: Record<string, () => string> = {
  chao: () => 'bát cháo', payment: () => 'em trả', photo: () => 'chụp ảnh',
  toast: () => 'phát biểu', oldvoice: () => String(1 + Math.floor(Math.random() * 3)),
  quang: () => (Math.random() < 0.6 ? 'A' : 'B'), ga: () => 'xé', headache: () => 'kể chuyện',
};

let botSeq = 0;
function makeBot() {
  const h = HO[Math.floor(Math.random() * HO.length)];
  const t = TEN[Math.floor(Math.random() * TEN.length)];
  const nick = NICK_STYLE[Math.floor(Math.random() * NICK_STYLE.length)](h, t);
  return { id: `bot_${++botSeq}`, nick };
}

/**
 * Giả lập người xem để test không cần live.
 * `target` = số bot muốn duy trì trong sân. Mỗi bot nói chuyện ngẫu nhiên mỗi 6–25s.
 */
export class Simulator {
  private bots: { id: string; nick: string; next: number }[] = [];
  private target = 0;
  private timer: NodeJS.Timeout;

  constructor(private game: Game) {
    this.timer = setInterval(() => this.tick(), 250);
  }

  setTarget(n: number) {
    this.target = Math.max(0, Math.min(300, n));
    this.game.simCount = this.target;
  }

  get count() { return this.target; }

  private tick() {
    const now = Date.now();
    // Bot mới vào dần dần (mỗi tick tối đa 1)
    if (this.bots.length < this.target) {
      const b = makeBot();
      this.bots.push({ ...b, next: now + 4000 + Math.random() * 8000 });
      this.game.handle({ kind: 'chat', userId: b.id, nick: b.nick, text: Math.random() < 0.15 ? `mâm ${1 + Math.floor(Math.random() * 9)}` : 'nhập tiệc' });
    } else if (this.bots.length > this.target) {
      const b = this.bots.pop()!;
      this.game.handle({ kind: 'chat', userId: b.id, nick: b.nick, text: 'ra về' });
    }

    for (const b of this.bots) {
      if (now < b.next) continue;
      b.next = now + (this.game.director.current ? 2500 + Math.random() * 9000 : 6000 + Math.random() * 19000);
      const roll = Math.random();
      if (roll < 0.08) this.game.handle({ kind: 'like', userId: b.id, nick: b.nick, count: 5 });
      else if (roll < 0.09) this.game.handle({ kind: 'gift', userId: b.id, nick: b.nick, giftName: 'Hoa hồng', count: 1, coins: 1 });
      else {
        // Khi có sự kiện, bot hưởng ứng câu lệnh của sự kiện
        const ev = this.game.director.current?.id;
        const chucTable = this.game.chuc.currentTable;
        const myTable = this.game.room.get(b.id)?.table;
        let text: string;
        if (ev && Math.random() < 0.55) text = EVENT_CHAT[ev]();
        else if (chucTable >= 0 && myTable === chucTable && Math.random() < 0.7) text = Math.random() < 0.95 ? 'mời chú' : 'đuổi';
        else text = chatter();
        this.game.handle({ kind: 'chat', userId: b.id, nick: b.nick, text });
        if (text === 'ra về') {
          // Bot về rồi thì thay bằng bot mới
          this.bots = this.bots.filter((x) => x !== b);
          break;
        }
      }
    }
  }

  stop() { clearInterval(this.timer); }
}
