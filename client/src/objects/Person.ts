import Phaser from 'phaser';
import type { EmoteKind } from '../../../shared/protocol';
import type { Pt } from '../../../shared/layout';
import { Bubble } from './Bubble';
import type { Look } from './look';

const EMOJI: Record<EmoteKind, string> = {
  eat: '🍚', chao: '🥣', cheer: '🎉', heart: '❤️', gift: '🎁', pay: '💸', wave: '👋', dizzy: '😵‍💫', beer: '🍻',
  camera: '📸', laugh: '😂', star: '⭐', think: '🤔', sleep: '💤', chicken: '🍗', sad: '😢', happy: '😋',
};

/**
 * Một nhân vật trong sân (khách hoặc chủ tiệc).
 * Đi theo danh sách điểm (path), tự sắp xếp chiều sâu theo y, có bong bóng thoại và emoji.
 */
export class Person extends Phaser.GameObjects.Container {
  anchor: number;          // nút lối đi gần nhất (để tính đường đi tiếp)
  seated = false;
  private path: Pt[] = [];
  private onArrive?: () => void;
  private speed: number;
  private bodyG: Phaser.GameObjects.Image;
  private nameT: Phaser.GameObjects.Text;
  private ring: Phaser.GameObjects.Image;
  readonly bubble: Bubble;
  private walkT = 0;
  private sc: number;
  private bubbleDy: number;
  private mouth?: Phaser.GameObjects.Ellipse;
  private isHost: boolean;
  private pose: 'stand' | 'sit' = 'stand';
  private poseDy = 0;
  private zzz?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, x: number, y: number, anchor: number, look: Look, name: string, opts: { host?: boolean; npc?: boolean } = {}) {
    super(scene, x, y);
    this.anchor = anchor;
    this.sc = opts.host ? 1.45 : opts.npc ? 1.25 : 1;
    this.isHost = !!opts.host || !!opts.npc;
    this.speed = opts.host ? 190 : opts.npc ? 200 : 230 + Math.random() * 60;

    // Vẽ 1 lần thành texture rồi dùng Image (Graphics vẽ lại mỗi frame rất tốn khi có 150 người)
    this.ring = scene.add.image(0, 4, ringTexture(scene)).setScale(this.sc).setVisible(false);
    this.bodyG = scene.add.image(0, 0, bodyTexture(scene, look, this.isHost)).setOrigin(0.5, BODY_OY / BODY_H);
    this.bodyG.setScale(this.sc / BAKE);

    this.nameT = scene.add.text(0, -62 * this.sc, opts.host || opts.npc ? name : shortName(name), {
      fontFamily: 'system-ui, "Segoe UI", Arial, sans-serif',
      fontSize: opts.host ? '26px' : opts.npc ? '22px' : '17px',
      fontStyle: 'bold',
      color: opts.host ? '#ffe08a' : opts.npc ? '#9fe0ff' : '#ffffff',
      stroke: '#1a0d06',
      strokeThickness: opts.host || opts.npc ? 6 : 4,
    }).setOrigin(0.5, 1);

    // Bong bóng nằm ngoài container để luôn vẽ trên cùng (không bị khách hàng dưới che)
    this.bubble = new Bubble(scene, this.isHost);
    this.bubbleDy = -62 * this.sc - (this.isHost ? 30 : 20);
    this.bubble.setDepth(opts.host ? 6800 : opts.npc ? 6750 : 5500); // chủ tiệc / NPC: trên cả bảng LED sự kiện
    scene.add.existing(this.bubble);

    this.add([this.ring, this.bodyG, this.nameT]);
    if (this.isHost) {
      // miệng mấp máy theo âm lượng giọng
      this.mouth = scene.add.ellipse(0, -43 * this.sc, 7 * this.sc, 1.5 * this.sc, 0x5a1a10);
      this.add(this.mouth);
    }
    scene.add.existing(this);
    this.setDepth(y);
  }

  setLabel(n: string) { this.nameT.setText(shortName(n)); }

  /** Đổi ngoại hình (vd. chủ tiệc hoá ông cụ). */
  setLook(look: Look) { this.bodyG.setTexture(bodyTexture(this.scene, look, this.isHost)); }

  /** 0 = ngậm, 1 = mở to */
  setMouth(level: number) {
    if (!this.mouth) return;
    this.mouth.setDisplaySize(7 * this.sc, (1.5 + level * 6) * this.sc);
    this.mouth.y = this.bodyG.y - 43 * this.sc + level * 1.5 * this.sc;
  }

  /** Ngồi (chủ tiệc nghỉ "đau đầu") hoặc đứng. */
  setPose(pose: 'stand' | 'sit') {
    if (pose === this.pose) return;
    this.pose = pose;
    this.poseDy = pose === 'sit' ? 10 * this.sc : 0;
    this.bodyG.setScale(this.sc / BAKE, (this.sc / BAKE) * (pose === 'sit' ? 0.86 : 1));
    this.nameT.y = -62 * this.sc + this.poseDy;
    this.zzz?.remove();
    if (pose === 'sit') this.zzz = this.scene.time.addEvent({ delay: 2200, loop: true, callback: () => this.emote('sleep') });
  }

  /** Gọi khi đi quá lâu so với quãng đường (kẹt) — PartyScene gắn vào để báo server. */
  onStuck?: () => void;
  private walkElapsed = 0;
  private walkExpected = 0;
  private stuckReported = false;

  walk(points: Pt[], onArrive?: () => void) {
    this.path = points.slice();
    this.onArrive = onArrive;
    this.seated = false;
    // thời gian dự kiến (tính theo thời gian game, nên máy chậm không bị báo nhầm)
    let len = 0, px = this.x, py = this.y;
    for (const p of this.path) { len += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y; }
    this.walkExpected = len / this.speed;
    this.walkElapsed = 0;
    this.stuckReported = false;
  }

  get moving() { return this.path.length > 0; }

  update(dt: number) {
    if (this.bubble.visible) { this.bubble.setPosition(this.x, this.y + this.bubbleDy); this.bubble.clampX(this.x); }
    if (!this.path.length) {
      this.bodyG.y = this.poseDy;
      return;
    }
    this.walkElapsed += dt;
    if (!this.stuckReported && this.walkElapsed > this.walkExpected * 1.5 + 3) {
      this.stuckReported = true;
      this.onStuck?.();
    }
    const tgt = this.path[0];
    const dx = tgt.x - this.x, dy = tgt.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step) {
      this.setPosition(tgt.x, tgt.y);
      this.path.shift();
      if (!this.path.length) { const cb = this.onArrive; this.onArrive = undefined; cb?.(); }
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      if (Math.abs(dx) > 1) this.bodyG.setFlipX(dx < 0);
    }
    this.walkT += dt * 14;
    this.bodyG.y = -Math.abs(Math.sin(this.walkT)) * 5;
    this.setDepth(this.y);
  }

  destroy(fromScene?: boolean) { this.zzz?.remove(); this.bubble.destroy(); super.destroy(fromScene); }

  face(x: number) { this.bodyG.setFlipX(x < this.x); }

  emote(kind: EmoteKind) {
    const t = this.scene.add.text(this.x, this.y - 70 * this.sc, EMOJI[kind] ?? '✨', { fontSize: `${Math.round(34 * this.sc)}px` })
      .setOrigin(0.5).setDepth(5000);
    this.scene.tweens.add({ targets: t, y: t.y - 70, alpha: { from: 1, to: 0 }, scale: { from: 0.6, to: 1.3 }, duration: 1300, ease: 'Cubic.Out', onComplete: () => t.destroy() });
    if (kind === 'dizzy') this.scene.tweens.add({ targets: this.bodyG, angle: { from: -8, to: 8 }, yoyo: true, repeat: 5, duration: 140, onComplete: () => this.bodyG.setAngle(0) });
    else this.scene.tweens.add({ targets: this.bodyG, y: -14, yoyo: true, duration: 140 });
  }

  /** Vòng sáng nhấp nháy dưới chân — để người xem nhận ra nhân vật của mình. */
  highlight(ms = 2500) {
    this.ring.setVisible(true).setAlpha(1);
    this.scene.tweens.killTweensOf(this.ring);
    this.scene.tweens.add({ targets: this.ring, alpha: { from: 1, to: 0.2 }, yoyo: true, repeat: Math.floor(ms / 500), duration: 250, onComplete: () => this.ring.setVisible(false) });
  }

  say(text: string, ms: number) {
    this.bubble.show(text, ms);
    this.bubble.setPosition(this.x, this.y + this.bubbleDy);
    this.bubble.clampX(this.x);
  }
}

/** Rút gọn tên để đỡ đè nhau quanh mâm. */
function shortName(n: string) { return n.length > 11 ? n.slice(0, 10) + '…' : n; }

// ---------- texture cache ----------
const BAKE = 2;          // vẽ ở độ phân giải 2x cho nét
const BODY_W = 64, BODY_H = 84, BODY_OY = 72; // khung texture; gốc chân nằm ở (32, 72)

function bodyTexture(scene: Phaser.Scene, l: Look, host: boolean): string {
  const key = `body_${host ? 'h' : ''}${l.skin}_${l.shirt}_${l.pants}_${l.hair}_${l.hairStyle}_${l.accessory}_${l.beard ? 'b' : ''}_${l.pattern ?? ''}_${l.shirtStyle}`;
  if (scene.textures.exists(key)) return key;
  const fromAtlas = atlasTexture(scene, key, l);
  if (fromAtlas) return fromAtlas;
  const g = scene.make.graphics({}, false);
  g.scaleCanvas(BAKE, BAKE);
  g.translateCanvas(BODY_W / 2, BODY_OY);
  drawBody(g, l, host);
  g.generateTexture(key, BODY_W * BAKE, BODY_H * BAKE);
  g.destroy();
  return key;
}

function ringTexture(scene: Phaser.Scene): string {
  const key = 'ring';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.lineStyle(4, 0xffe08a, 1);
  g.strokeEllipse(30, 13, 56, 22);
  g.generateTexture(key, 60, 26);
  g.destroy();
  return key;
}

// ---------- Sprite AI theo lớp (M6) ----------
// Nếu có client/public/assets/people.png + people.json (atlas Phaser), ghép các lớp (đã vẽ xám) và tô màu,
// "bake" vào một DynamicTexture theo Look → vẫn rẻ như cache hình khối. Quy cách: docs/SPRITE-PROMPTS.md
export const ATLAS_KEY = 'people';

function hasFrame(scene: Phaser.Scene, f: string) {
  return scene.textures.exists(ATLAS_KEY) && scene.textures.get(ATLAS_KEY).has(f);
}

function atlasTexture(scene: Phaser.Scene, key: string, l: Look): string | null {
  if (!scene.textures.exists(ATLAS_KEY)) return null;
  // nhân vật vẽ riêng nguyên bộ
  if (l.special && hasFrame(scene, `char_${l.special}`)) {
    const dt = scene.textures.addDynamicTexture(key, BODY_W * BAKE, BODY_H * BAKE);
    dt?.stamp(ATLAS_KEY, `char_${l.special}`, 0, 0, { originX: 0, originY: 0 });
    return dt ? key : null;
  }
  if (l.special) return null; // chưa có ảnh riêng → hình khối
  const layers: [string, number][] = [
    [`body_${l.skinIdx}`, 0xffffff],
    ['pants', l.pants],
    [`shirt_${l.shirtStyle}`, l.shirt],
    [`hair_${l.hairStyle}`, l.hair],
  ];
  if (l.accessory === 1) layers.push(['acc_glasses', 0xffffff]);
  if (l.accessory === 2) layers.push(['acc_scarf', 0xffffff]);
  if (!layers.every(([f]) => hasFrame(scene, f))) return null; // atlas thiếu lớp → hình khối
  const dt = scene.textures.addDynamicTexture(key, BODY_W * BAKE, BODY_H * BAKE);
  if (!dt) return null;
  for (const [f, tint] of layers) dt.stamp(ATLAS_KEY, f, 0, 0, { originX: 0, originY: 0, tint });
  return key;
}

function drawBody(g: Phaser.GameObjects.Graphics, l: Look, host: boolean) {
  // bóng
  g.fillStyle(0x000000, 0.25); g.fillEllipse(0, 4, 40, 14);
  // chân
  g.fillStyle(l.pants, 1); g.fillRoundedRect(-11, -16, 9, 18, 3); g.fillRoundedRect(2, -16, 9, 18, 3);
  // thân / áo
  g.fillStyle(l.shirt, 1); g.fillRoundedRect(-15, -40, 30, 28, 8);
  if (l.pattern === 'plaid') {
    g.lineStyle(1.5, 0xffffff, 0.45);
    for (let x = -11; x <= 11; x += 6) g.lineBetween(x, -39, x, -13);
    for (let y = -35; y <= -15; y += 6) g.lineBetween(-14, y, 14, y);
  }
  if (l.pattern === 'tank') { g.fillStyle(l.skin, 1); g.fillRect(-15, -40, 6, 10); g.fillRect(9, -40, 6, 10); }
  if (host) { g.fillStyle(0xd4a017, 1); g.fillRect(-2, -38, 4, 22); } // cà vạt vàng cho dễ nhận
  // tay
  g.fillStyle(l.skin, 1); g.fillCircle(-17, -22, 5); g.fillCircle(17, -22, 5);
  // đầu
  g.fillStyle(l.skin, 1); g.fillCircle(0, -50, 13);
  // tóc
  g.fillStyle(l.hair, 1);
  switch (l.hairStyle) {
    case 0: g.slice(0, -51, 13.5, Math.PI, 0, false); g.fillPath(); break;
    case 1: g.slice(0, -51, 14, Math.PI, 0, false); g.fillPath(); g.fillRect(-14, -52, 5, 16); g.fillRect(9, -52, 5, 16); break;
    case 2: g.fillRect(-11, -63, 22, 6); break;
    case 4: // mũ phớt
      g.fillStyle(0x3e2723, 1); g.fillEllipse(0, -60, 38, 8); g.fillRoundedRect(-11, -72, 22, 13, 4);
      g.fillStyle(0xc0392b, 1); g.fillRect(-11, -63, 22, 3);
      break;
    default: g.fillStyle(l.shirt === 0xe74c3c ? 0x2c3e50 : 0xc0392b, 1); g.slice(0, -53, 14, Math.PI, 0, false); g.fillPath(); g.fillRect(0, -55, 18, 4); break;
  }
  // mắt
  g.fillStyle(0x1b1b1b, 1); g.fillCircle(-4.5, -49, 1.8); g.fillCircle(4.5, -49, 1.8);
  if (l.accessory === 1) { g.lineStyle(1.5, 0x111111, 1); g.strokeCircle(-4.5, -49, 4); g.strokeCircle(4.5, -49, 4); }
  if (l.accessory === 2) { g.fillStyle(0xc0392b, 1); g.fillRect(-12, -40, 24, 5); }
  if (l.accessory === 3) { g.fillStyle(0x111111, 1); g.fillRoundedRect(-11, -52, 9, 5, 2); g.fillRoundedRect(2, -52, 9, 5, 2); g.fillRect(-2, -51, 4, 1.5); }
  if (l.accessory === 4) { // cầm bát + đũa
    g.fillStyle(0xffffff, 1); g.slice(20, -22, 8, 0, Math.PI, false); g.fillPath();
    g.lineStyle(1.5, 0x8d6e63, 1); g.lineBetween(16, -34, 26, -24); g.lineBetween(19, -35, 28, -26);
  }
  if (l.beard) { g.fillStyle(0xf0f0f0, 1); g.fillTriangle(-9, -44, 9, -44, 0, -30); g.fillRect(-8, -46, 16, 3); }
}
