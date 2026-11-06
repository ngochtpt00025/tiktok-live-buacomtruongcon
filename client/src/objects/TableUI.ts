import Phaser from 'phaser';
import { TABLE_COUNT, TABLE_RADIUS, tablePos } from '../../../shared/layout';
import type { BondDTO, TableProgress } from '../../../shared/protocol';

const FONT = 'system-ui, "Segoe UI", Arial, sans-serif';
const BAR_W = 120;

/** Thanh "Tình nghĩa", số sao và tiến độ sự kiện hiển thị trên mỗi mâm. */
export class TableUI {
  private bars: Phaser.GameObjects.Graphics[] = [];
  private stars: Phaser.GameObjects.Text[] = [];
  private progress: Phaser.GameObjects.Text[] = [];
  private shown = new Array<number>(TABLE_COUNT).fill(0);

  constructor(private scene: Phaser.Scene) {
    for (let t = 0; t < TABLE_COUNT; t++) {
      const c = tablePos(t);
      this.bars.push(scene.add.graphics().setDepth(4100));
      this.stars.push(scene.add.text(c.x + BAR_W / 2 + 6, c.y - TABLE_RADIUS + 8, '', {
        fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffe08a', stroke: '#3a1a0c', strokeThickness: 4,
      }).setOrigin(0, 0.5).setDepth(4101));
      this.progress.push(scene.add.text(c.x, c.y, '', {
        fontFamily: FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff', stroke: '#8e1b12', strokeThickness: 7,
      }).setOrigin(0.5).setDepth(4200).setVisible(false));
      this.drawBar(t, 0);
    }
  }

  setBond(b: BondDTO) {
    for (let t = 0; t < TABLE_COUNT; t++) {
      const target = b.score[t] ?? 0;
      const from = this.shown[t];
      if (target !== from) {
        // chạy số mượt
        const o = { v: from };
        this.scene.tweens.add({ targets: o, v: target < from ? target : target, duration: 500, ease: 'Cubic.Out',
          onUpdate: () => this.drawBar(t, o.v), onComplete: () => this.drawBar(t, target) });
        this.shown[t] = target;
      }
      const s = b.stars[t] ?? 0;
      this.stars[t].setText(s ? `⭐${s}` : '');
    }
  }

  setProgress(list: (TableProgress | null)[]) {
    for (let t = 0; t < TABLE_COUNT; t++) {
      const p = list[t];
      const txt = this.progress[t];
      if (!p) { txt.setVisible(false); continue; }
      const full = p.done >= p.total;
      txt.setText(`${p.icon ?? '🥣'} ${p.done}/${p.total}`).setColor(full ? '#ffe08a' : '#ffffff').setVisible(true);
    }
  }

  private drawBar(t: number, v: number) {
    const c = tablePos(t);
    const g = this.bars[t];
    const x = c.x - BAR_W / 2, y = c.y - TABLE_RADIUS + 2;
    g.clear();
    g.fillStyle(0x2b120a, 0.85); g.fillRoundedRect(x - 2, y - 2, BAR_W + 4, 14, 7);
    const w = Math.max(0, Math.min(1, v / 100)) * BAR_W;
    if (w > 2) { g.fillStyle(v >= 80 ? 0xffd76a : 0xe74c3c, 1); g.fillRoundedRect(x, y, w, 10, 5); }
  }
}
