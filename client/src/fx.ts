import Phaser from 'phaser';
import { GA_SPOT, H, W, tablePos } from '../../shared/layout';

const FONT = 'system-ui, "Segoe UI", Arial, sans-serif';
const COLORS = [0xffd76a, 0xe74c3c, 0x2ecc71, 0x3498db, 0xff6b9a, 0xffffff];

/** Pháo giấy bung ra từ một điểm. */
export function confetti(scene: Phaser.Scene, x: number, y: number, n = 36) {
  for (let i = 0; i < n; i++) {
    const r = scene.add.rectangle(x, y, 10, 6, Phaser.Utils.Array.GetRandom(COLORS)).setDepth(5200).setAngle(Math.random() * 360);
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 160;
    scene.tweens.add({
      targets: r, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6 - 60, angle: r.angle + 360,
      duration: 700, ease: 'Cubic.Out',
      onComplete: () => scene.tweens.add({ targets: r, y: r.y + 120, alpha: 0, duration: 900, onComplete: () => r.destroy() }),
    });
  }
}

/** Mâm đạt Tình nghĩa / thắng sự kiện. */
export function tableFx(scene: Phaser.Scene, table: number, kind: 'celebrate' | 'win') {
  const c = tablePos(table);
  const ring = scene.add.circle(c.x, c.y, 90, kind === 'win' ? 0xffd76a : 0xff6b9a, 0.35).setDepth(5100);
  scene.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 900, onComplete: () => ring.destroy() });
  confetti(scene, c.x, c.y, kind === 'win' ? 60 : 36);
  const icon = scene.add.text(c.x, c.y - 20, kind === 'win' ? '🏆' : '⭐', { fontSize: '72px' }).setOrigin(0.5).setDepth(5300).setScale(0.2);
  scene.tweens.add({
    targets: icon, scale: 1, y: c.y - 90, duration: 500, ease: 'Back.Out',
    onComplete: () => scene.tweens.add({ targets: icon, alpha: 0, delay: 1400, duration: 400, onComplete: () => icon.destroy() }),
  });
}

/**
 * Ảnh kỷ niệm: chớp đèn, chụp lại khung hình hiện tại, hiện như ảnh polaroid kèm tên người tham gia.
 */
export function photoMoment(scene: Phaser.Scene, names: string[], caption: string, ms: number) {
  const key = `photo_${Date.now()}`;
  scene.game.renderer.snapshot((img) => {
    const flash = scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 1).setDepth(9000);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 450, onComplete: () => flash.destroy() });
    if (!(img instanceof HTMLImageElement)) return;
    const show = () => {
      scene.textures.addImage(key, img);
      const items: Phaser.GameObjects.GameObject[] = [];
      const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(8000); items.push(dim);
      // Dựng nội dung từ trên xuống, rồi co khung polaroid vừa với nội dung.
      const fw = 860, fx = W / 2, pad = 30;
      const srcY = 440, srcH = 1100;          // vùng sân 9 mâm (bỏ HUD trên và cổng dưới)
      const sc = (fw - pad * 2) / W;
      const frame = scene.add.rectangle(fx, 0, fw, 10, 0xfffdf5).setDepth(8001).setStrokeStyle(6, 0xe8dcc0);
      items.push(frame);
      const top = 0;
      // gốc ảnh đặt ở mép trên vùng cắt, để vùng cắt nằm sát mép trên khung
      const pic = scene.add.image(fx, top + pad, key).setDepth(8002)
        .setCrop(0, srcY, W, srcH).setOrigin(0.5, srcY / H).setScale(sc);
      items.push(pic);
      let y = top + pad + srcH * sc + 22;
      const cap = scene.add.text(fx, y, caption, { fontFamily: FONT, fontSize: '42px', fontStyle: '900', color: '#8e1b12' })
        .setOrigin(0.5, 0).setDepth(8003);
      items.push(cap);
      y += cap.height + 10;
      const max = 30;
      const list = names.slice(0, max).join(' · ') + (names.length > max ? ` · +${names.length - max} anh em` : '');
      const who = scene.add.text(fx, y, list, {
        fontFamily: FONT, fontSize: '22px', color: '#3a2a1a', align: 'center', lineSpacing: 4, wordWrap: { width: fw - 80 },
      }).setOrigin(0.5, 0).setDepth(8003);
      items.push(who);
      y += who.height + 16;
      const d = new Date();
      const stamp = scene.add.text(fx + fw / 2 - pad, y, `${d.toLocaleDateString('vi-VN')} · Bữa Cơm Tình Nghĩa`, {
        fontFamily: FONT, fontSize: '18px', color: '#9a8a70',
      }).setOrigin(1, 0).setDepth(8003);
      items.push(stamp);
      y += stamp.height + pad;
      // co khung + căn giữa theo chiều dọc
      const fh = y - top;
      frame.setSize(fw, fh).setDisplaySize(fw, fh).setOrigin(0.5, 0);
      const shift = Math.max(150, (H - fh) / 2) - top;
      for (const o of [frame, pic, cap, who, stamp]) o.y += shift;
      const group = items as (Phaser.GameObjects.GameObject & { alpha: number; setAlpha: (a: number) => unknown })[];
      for (const o of group) o.setAlpha(0);
      scene.tweens.add({ targets: group, alpha: 1, duration: 350, delay: 250 });
      scene.time.delayedCall(ms, () => scene.tweens.add({
        targets: group, alpha: 0, duration: 500,
        onComplete: () => { for (const o of group) o.destroy(); scene.textures.remove(key); },
      }));
    };
    if (img.complete) show(); else img.onload = show;
  });
}

/** Đĩa gà luộc trên bục (minigame "Gà luộc xé tay"). Gà nhỏ dần theo số miếng còn lại. */
export class GaProp {
  private box: Phaser.GameObjects.Container;
  private chicken: Phaser.GameObjects.Container;
  private label: Phaser.GameObjects.Text;
  private total = 24;

  constructor(private scene: Phaser.Scene) {
    const plate = scene.add.graphics();
    plate.fillStyle(0x000000, 0.25); plate.fillEllipse(0, 18, 150, 40);
    plate.fillStyle(0xffffff, 1); plate.fillEllipse(0, 10, 140, 50);
    plate.lineStyle(4, 0x2a6fd6, 1); plate.strokeEllipse(0, 10, 124, 40);
    const c = scene.add.graphics();
    c.fillStyle(0xf5d36b, 1); c.fillEllipse(0, 0, 90, 52);          // thân gà
    c.fillStyle(0xe8b84a, 1); c.fillEllipse(-36, -6, 30, 22); c.fillEllipse(36, -6, 30, 22); // đùi
    c.fillStyle(0xfff3c4, 1); c.fillEllipse(-8, -10, 30, 12);       // ánh bóng
    c.fillStyle(0x2ecc71, 1); c.fillCircle(30, 18, 6); c.fillCircle(38, 14, 5); // lá chanh
    this.chicken = scene.add.container(0, 0, [c]);
    this.label = scene.add.text(0, 46, '', {
      fontFamily: 'system-ui, "Segoe UI", Arial, sans-serif', fontSize: '22px', fontStyle: '900', color: '#ffffff', stroke: '#8e1b12', strokeThickness: 6,
    }).setOrigin(0.5);
    this.box = scene.add.container(GA_SPOT.x, GA_SPOT.y, [plate, this.chicken, this.label]).setDepth(GA_SPOT.y + 5).setVisible(false);
  }

  show(amount: number) {
    this.total = Math.max(1, amount);
    this.set(amount);
    this.box.setVisible(true).setScale(0.2);
    this.scene.tweens.add({ targets: this.box, scale: 1, duration: 400, ease: 'Back.Out' });
  }

  hide() {
    if (!this.box.visible) return;
    this.scene.tweens.add({ targets: this.box, scale: 0, duration: 300, onComplete: () => this.box.setVisible(false) });
  }

  set(left: number) {
    this.label.setText(`🍗 còn ${left}`);
    this.chicken.setScale(0.35 + 0.65 * (left / this.total));
  }

  /** Một miếng gà bay theo đường cong từ đĩa về mâm. */
  piece(table: number, left: number) {
    this.set(left);
    this.scene.tweens.add({ targets: this.chicken, angle: { from: -6, to: 6 }, yoyo: true, duration: 80 });
    const to = tablePos(table);
    const from = { x: GA_SPOT.x, y: GA_SPOT.y - 10 };
    const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 220 };
    const t = this.scene.add.text(from.x, from.y, '🍗', { fontSize: '40px' }).setOrigin(0.5).setDepth(5200);
    const o = { k: 0 };
    this.scene.tweens.add({
      targets: o, k: 1, duration: 700, ease: 'Sine.InOut',
      onUpdate: () => {
        const k = o.k, a = 1 - k;
        t.setPosition(a * a * from.x + 2 * a * k * ctrl.x + k * k * to.x, a * a * from.y + 2 * a * k * ctrl.y + k * k * to.y);
        t.setAngle(k * 540);
      },
      onComplete: () => this.scene.tweens.add({ targets: t, alpha: 0, scale: 1.6, duration: 250, onComplete: () => t.destroy() }),
    });
  }
}
