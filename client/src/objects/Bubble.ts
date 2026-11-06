import Phaser from 'phaser';

/** Bong bóng thoại bám trên đầu nhân vật. */
export class Bubble extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent;
  private lastTail = 0;

  constructor(scene: Phaser.Scene, private big: boolean) {
    super(scene, 0, 0);
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, '', {
      fontFamily: 'system-ui, "Segoe UI", Arial, sans-serif',
      fontSize: big ? '30px' : '20px',
      fontStyle: big ? 'bold' : 'normal',
      color: '#2b1408',
      wordWrap: { width: big ? 520 : 260, useAdvancedWrap: true },
      align: 'center',
    }).setOrigin(0.5, 1);
    this.add([this.bg, this.label]);
    this.setVisible(false);
  }

  show(text: string, ms: number) {
    this.label.setText(text);
    this.lastTail = 0;
    this.redraw(0);
    this.setVisible(true).setAlpha(0).setScale(0.8);
    this.scene.tweens.add({ targets: this, alpha: 1, scale: 1, duration: 160, ease: 'Back.Out' });
    this.timer?.remove();
    this.timer = this.scene.time.delayedCall(ms, () => this.hide());
  }

  private redraw(tail: number) {
    const padX = this.big ? 22 : 12, padY = this.big ? 16 : 8;
    const w = this.label.width + padX * 2;
    const h = this.label.height + padY * 2;
    this.label.setPosition(0, -14 - padY);
    this.bg.clear();
    this.bg.fillStyle(this.big ? 0xfff6dc : 0xffffff, 0.97);
    this.bg.lineStyle(this.big ? 4 : 2, this.big ? 0xc0392b : 0x8d5a3b, 1);
    this.bg.fillRoundedRect(-w / 2, -14 - h, w, h, this.big ? 18 : 10);
    this.bg.strokeRoundedRect(-w / 2, -14 - h, w, h, this.big ? 18 : 10);
    this.bg.fillTriangle(tail - 10, -16, tail + 10, -16, tail, 0);
  }

  hide() {
    this.scene.tweens.add({ targets: this, alpha: 0, duration: 200, onComplete: () => this.setVisible(false) });
  }

  /** Giữ bong bóng trong màn hình 1080 px. */
  clampX(worldX: number) {
    const half = (this.label.width + (this.big ? 44 : 24)) / 2;
    const off = Phaser.Math.Clamp(0, half + 8 - worldX, 1080 - 8 - half - worldX);
    this.x = worldX + off;
    this.tailOffset(-off);
  }

  /** Đuôi bong bóng vẫn chỉ vào nhân vật khi thân bong bóng bị đẩy vào trong màn hình. */
  private tailOffset(dx: number) {
    if (dx === this.lastTail) return;
    this.lastTail = dx;
    this.redraw(dx);
  }
}
