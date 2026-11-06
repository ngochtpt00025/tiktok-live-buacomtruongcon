import Phaser from 'phaser';
import { STAGE, W } from '../../../shared/layout';
import type { EventDTO } from '../../../shared/protocol';

const FONT = 'system-ui, "Segoe UI", Arial, sans-serif';

/** Bảng LED trên phông sân khấu: tên sự kiện, cách chơi, thanh thời gian. */
export class EventPanel {
  private box: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private timeBar: Phaser.GameObjects.Graphics;
  private note: Phaser.GameObjects.Text;
  private endsAt = 0;
  private duration = 1;

  constructor(private scene: Phaser.Scene) {
    const x = W / 2, y = STAGE.y + 52;
    const w = STAGE.w + 40, h = 150;
    const bg = scene.add.graphics();
    bg.fillStyle(0x3a0a06, 0.97); bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(5, 0xffd76a, 1); bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    this.title = scene.add.text(0, -44, '', { fontFamily: FONT, fontSize: '38px', fontStyle: '900', color: '#ffd76a' }).setOrigin(0.5);
    this.hint = scene.add.text(0, -6, '', {
      fontFamily: FONT, fontSize: '21px', fontStyle: 'bold', color: '#fff3dd', align: 'center', wordWrap: { width: w - 40 },
    }).setOrigin(0.5);
    this.note = scene.add.text(0, 30, '', {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffd76a', align: 'center', wordWrap: { width: w - 40 },
    }).setOrigin(0.5);
    this.timeBar = scene.add.graphics();
    this.box = scene.add.container(x, y, [bg, this.title, this.hint, this.note, this.timeBar]).setDepth(6500).setVisible(false);
  }

  set(ev: EventDTO | null) {
    if (!ev) {
      if (this.box.visible) this.scene.tweens.add({ targets: this.box, alpha: 0, scale: 0.9, duration: 250, onComplete: () => this.box.setVisible(false) });
      return;
    }
    // tự thu nhỏ tiêu đề dài cho vừa bảng
    const maxW = STAGE.w;
    this.title.setScale(1).setText(ev.title);
    if (this.title.width > maxW) this.title.setScale(maxW / this.title.width);
    this.hint.setText(ev.hint);
    this.note.setText('');
    this.duration = ev.durationMs;
    this.endsAt = Date.now() + ev.remainingMs;
    this.box.setVisible(true).setAlpha(0).setScale(1.15);
    this.scene.tweens.add({ targets: this.box, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' });
  }

  setNote(text: string) { this.note.setText(text); }

  update() {
    if (!this.box.visible) return;
    const w = STAGE.w + 40 - 40;
    const left = Math.max(0, this.endsAt - Date.now());
    const k = left / this.duration;
    const g = this.timeBar;
    g.clear();
    g.fillStyle(0x000000, 0.5); g.fillRoundedRect(-w / 2, 54, w, 10, 5);
    g.fillStyle(k < 0.25 ? 0xe74c3c : 0xffd76a, 1); g.fillRoundedRect(-w / 2, 54, Math.max(4, w * k), 10, 5);
  }
}
