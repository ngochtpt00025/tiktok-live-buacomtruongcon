import Phaser from 'phaser';
import { H, W } from '../../shared/layout';
import { IS_PREVIEW, PartyScene } from './scenes/PartyScene';

// Màn hình game (overlay). Điều khiển ở /control.html.
// __game: để debug từ console trình duyệt
(window as any).__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#1a0f0a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [PartyScene],
  fps: { target: 60 },
});

// ---------- Cửa sổ live 9:16 (học từ avatar-arena) ----------
// Mở với ?size=720 → tự chỉnh cửa sổ để phần nội dung đúng 720×1280 (hoặc vừa màn hình),
// dùng làm nguồn "Cửa sổ" trong TikTok LIVE Studio.
const params = new URLSearchParams(location.search);
const sizeTag = document.getElementById('sizeTag')!;
let tagTimer = 0;
if (params.get('size')) {
  const want = Number(params.get('size')) || 720;
  const fx = outerWidth - innerWidth, fy = outerHeight - innerHeight;
  const h = Math.min(Math.round((want * 16) / 9), screen.availHeight - fy);
  const w = Math.round((h * 9) / 16);
  try { resizeTo(w + fx, h + fy); } catch { /* trình duyệt chặn thì bỏ qua */ }
  addEventListener('resize', () => {
    const ok = innerWidth === want && innerHeight === Math.round((want * 16) / 9);
    sizeTag.textContent = `${innerWidth} × ${innerHeight}${ok ? ' ✓' : ''}`;
    sizeTag.hidden = false;
    clearTimeout(tagTimer);
    tagTimer = window.setTimeout(() => (sizeTag.hidden = true), 2500);
  });
}

// ---------- Bật tiếng ----------
// OBS và cửa sổ live (OPEN-LIVE-WINDOW.bat) cho phép tự phát; tab trình duyệt thường cần 1 cú bấm.
const unlockBtn = document.getElementById('unlock')!;
const scene = () => (window as any).__game?.scene?.getScene('party') as PartyScene | undefined;
async function tryUnlock() {
  const s = scene();
  if (!s) return;
  await s.audio.unlock();
  unlockBtn.classList.toggle('on', s.audio.needsUnlock);
}
if (!IS_PREVIEW) {
  setTimeout(tryUnlock, 800);
  setTimeout(tryUnlock, 3000);
  unlockBtn.addEventListener('click', tryUnlock);
  document.addEventListener('pointerdown', () => void tryUnlock());
}
