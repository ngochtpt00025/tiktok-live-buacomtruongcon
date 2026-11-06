import Phaser from 'phaser';
import {
  COUNTER, GATE, HOST_REST_SPOT, H, SEATS_PER_TABLE, STAGE, TABLE_COUNT, TABLE_RADIUS, W, seatPos, tablePos,
} from '../../../shared/layout';

const FONT = 'system-ui, "Segoe UI", Arial, sans-serif';

/**
 * Vẽ sân tiệc bằng hình khối (placeholder). Khi có ảnh AI:
 *  - đặt file vào client/public/assets/bg.png (1080x1920) → tự dùng thay nền vẽ tay
 *  - mâm, ghế vẫn vẽ ở đây để khớp toạ độ với logic.
 */
export function drawVenue(scene: Phaser.Scene, venueName: string): Phaser.GameObjects.Text {
  if (scene.textures.exists('bg-ai')) {
    scene.add.image(0, 0, 'bg-ai').setOrigin(0).setDepth(-10);
  } else {
    drawGround(scene);
  }
  drawStage(scene);
  drawCounter(scene);
  const sign = drawGate(scene, venueName);
  for (let t = 0; t < TABLE_COUNT; t++) drawTable(scene, t);
  return sign;
}

function drawGround(scene: Phaser.Scene) {
  const g = scene.make.graphics({}, false);
  // sân gạch đỏ
  g.fillStyle(0xa95a3a, 1); g.fillRect(0, 0, W, H);
  const bw = 72, bh = 36;
  for (let y = 0, r = 0; y < H; y += bh, r++) {
    for (let x = (r % 2) * -bw / 2; x < W; x += bw) {
      const shade = 0xa95a3a + ((((x * 7 + y * 13) >> 3) % 3) - 1) * 0x060303;
      g.fillStyle(shade, 1); g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  // lối đi lát xi măng nhạt
  g.fillStyle(0xd8c3a5, 0.18);
  for (const x of [60, 380, 700, 1020]) g.fillRect(x - 26, 470, 52, 1100);
  for (const y of [480, 840, 1200, 1560]) g.fillRect(30, y - 22, W - 60, 44);
  // phông bạt sọc xanh-trắng phía trên
  for (let i = 0; i < 24; i++) {
    g.fillStyle(i % 2 ? 0xf4f1ea : 0x2f6fb5, 1);
    g.fillRect(i * 45, 150, 45, 40);
  }
  g.fillStyle(0x000000, 0.18); g.fillRect(0, 190, W, 10);
  g.generateTexture('bg-drawn', W, H);
  g.destroy();
  scene.add.image(0, 0, 'bg-drawn').setOrigin(0).setDepth(-10);
}

function drawStage(scene: Phaser.Scene) {
  const g = scene.add.graphics().setDepth(-5);
  const { x, y, w, h } = STAGE;
  // phông nền đỏ
  g.fillStyle(0x8e1b12, 1); g.fillRoundedRect(x - 20, y, w + 40, 120, 12);
  g.lineStyle(6, 0xf5c26b, 1); g.strokeRoundedRect(x - 20, y, w + 40, 120, 12);
  // bục
  g.fillStyle(0x5c2a15, 1); g.fillRect(x, y + 120, w, h - 120);
  g.fillStyle(0x7a3a1f, 1); g.fillRect(x, y + 120, w, 18);
  g.fillStyle(0x3a1a0c, 1); g.fillRect(x, y + h - 14, w, 14);
  // ghế nghỉ của chủ tiệc (mép trái bục)
  g.fillStyle(0xd6322b, 1); g.fillRoundedRect(HOST_REST_SPOT.x - 20, HOST_REST_SPOT.y - 16, 40, 26, 6);
  g.fillStyle(0xa82820, 1); g.fillRect(HOST_REST_SPOT.x - 20, HOST_REST_SPOT.y - 30, 40, 14);
  // bục phát biểu
  g.fillStyle(0x6d3317, 1); g.fillRect(x + w / 2 - 50, y + h - 70, 100, 56);
  g.fillStyle(0xf5c26b, 1); g.fillRect(x + w / 2 - 50, y + h - 70, 100, 8);
  // đèn lồng
  for (let i = 0; i < 6; i++) {
    const lx = x + 30 + i * ((w - 60) / 5);
    g.fillStyle(0xe74c3c, 1); g.fillEllipse(lx, y - 6, 26, 32);
    g.fillStyle(0xf5c26b, 1); g.fillRect(lx - 7, y - 24, 14, 5);
  }
  scene.add.text(W / 2, y + 60, 'BỮA CƠM TÌNH NGHĨA', {
    fontFamily: FONT, fontSize: '50px', fontStyle: '900', color: '#ffd76a', stroke: '#5a0d07', strokeThickness: 8,
  }).setOrigin(0.5).setDepth(-4);
}

function drawCounter(scene: Phaser.Scene) {
  const g = scene.add.graphics().setDepth(COUNTER.y + 40);
  const { x, y } = COUNTER;
  g.fillStyle(0x000000, 0.25); g.fillEllipse(x, y + 46, 150, 26);
  g.fillStyle(0x6d3317, 1); g.fillRoundedRect(x - 70, y, 140, 46, 6);
  g.fillStyle(0x8a4520, 1); g.fillRect(x - 70, y, 140, 10);
  g.fillStyle(0x2c3e50, 1); g.fillRect(x + 22, y - 18, 30, 18); // máy tính tiền
  g.fillStyle(0x1abc9c, 1); g.fillRect(x + 26, y - 15, 22, 8);
  g.fillStyle(0xc0392b, 1); g.fillRoundedRect(x - 62, y - 62, 124, 34, 8);
  scene.add.text(x, y - 45, 'QUẦY', {
    fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#fff3c4',
  }).setOrigin(0.5).setDepth(COUNTER.y + 41);
}

function drawGate(scene: Phaser.Scene, venueName: string): Phaser.GameObjects.Text {
  const g = scene.add.graphics().setDepth(2500);
  const y = GATE.y;
  g.fillStyle(0x6d3317, 1);
  g.fillRect(GATE.x - 170, y - 110, 26, 120);
  g.fillRect(GATE.x + 144, y - 110, 26, 120);
  g.fillStyle(0xc0392b, 1); g.fillRoundedRect(GATE.x - 190, y - 150, 380, 54, 10);
  g.lineStyle(4, 0xf5c26b, 1); g.strokeRoundedRect(GATE.x - 190, y - 150, 380, 54, 10);
  return scene.add.text(GATE.x, y - 123, venueName, {
    fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#fff3c4',
  }).setOrigin(0.5).setDepth(2501);
}

function drawTable(scene: Phaser.Scene, t: number) {
  const c = tablePos(t);
  // ghế nhựa
  const chairs = scene.add.graphics().setDepth(c.y - 200);
  for (let s = 0; s < SEATS_PER_TABLE; s++) {
    const p = seatPos(t, s);
    chairs.fillStyle(0x000000, 0.2); chairs.fillEllipse(p.x, p.y + 6, 34, 14);
    chairs.fillStyle(t % 2 ? 0xd6322b : 0x2a6fd6, 1); chairs.fillRoundedRect(p.x - 15, p.y - 12, 30, 22, 6);
  }
  // bàn + mâm
  const g = scene.add.graphics().setDepth(c.y);
  g.fillStyle(0x000000, 0.25); g.fillEllipse(c.x, c.y + 10, TABLE_RADIUS * 2 + 10, TABLE_RADIUS * 1.2);
  g.fillStyle(0xeae3d2, 1); g.fillCircle(c.x, c.y, TABLE_RADIUS);
  g.lineStyle(4, 0xb9ae96, 1); g.strokeCircle(c.x, c.y, TABLE_RADIUS);
  g.fillStyle(0xc9c2b4, 1); g.fillCircle(c.x, c.y, TABLE_RADIUS - 16); // mâm inox
  // món ăn
  const dishes: [number, number, number, number][] = [
    [-22, -16, 16, 0xf5d36b], // gà luộc
    [22, -14, 14, 0x4caf50],  // rau
    [0, 18, 15, 0xffffff],    // cơm
    [-24, 18, 10, 0xd35400],  // nem
    [24, 18, 11, 0x8d6e63],   // canh
  ];
  for (const [dx, dy, r, col] of dishes) {
    g.fillStyle(0xffffff, 1); g.fillCircle(c.x + dx, c.y + dy, r + 3);
    g.fillStyle(col, 1); g.fillCircle(c.x + dx, c.y + dy, r);
  }
  scene.add.text(c.x, c.y - TABLE_RADIUS - 4, `Mâm ${t + 1}`, {
    fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#fff7e0', stroke: '#4a200d', strokeThickness: 5,
  }).setOrigin(0.5, 1).setDepth(c.y + 1);
}
