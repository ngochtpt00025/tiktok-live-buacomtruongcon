import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Heat, heatLevel, rawHeat } from './heat.js';

test('độ náo nhiệt thô: 0 khi vắng, 100 khi mọi thứ vượt ngưỡng', () => {
  assert.equal(rawHeat({ chatPer10s: 0, guests: 0, joinsPerMin: 0, eventActionsPerMin: 0 }), 0);
  assert.equal(Math.round(rawHeat({ chatPer10s: 99, guests: 99, joinsPerMin: 99, eventActionsPerMin: 99 })), 100);
  assert.equal(heatLevel(10), 'vang');
  assert.equal(heatLevel(35), 'am');
  assert.equal(heatLevel(65), 'dong');
  assert.equal(heatLevel(90), 'bungno');
});

test('trung bình trượt tăng dần và không chập chờn ở ngưỡng', () => {
  const h = new Heat();
  for (let i = 0; i < 3; i++) h.update(20, 40); // sân đông dần
  const mid = h.value;
  assert.ok(mid > 20 && mid < 60, `sau 3 nhịp phải tăng dần, được ${mid}`);
  for (let i = 0; i < 20; i++) h.update(20, 40);
  assert.ok(h.level === 'am' || h.level === 'dong');
  const before = h.level;
  h.update(19, 39); // dao động nhẹ quanh mức cũ không được đổi mức ngay
  assert.equal(h.level, before);
});
