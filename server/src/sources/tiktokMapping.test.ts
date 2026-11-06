import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventFilter, mapTikTokEvent } from './tiktokMapping.js';
import { parseUsername } from './tiktok.js';

const user = { userId: '123', nickname: 'Linh' };
const gift = (repeatCount: number, repeatEnd = false, msgId = String(Math.random())) =>
  mapTikTokEvent('gift', { user, giftId: 5655, repeatCount, repeatEnd, groupId: 'g1', giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 1 }, common: { msgId } })!;

test('combo quà: cộng phần tăng thêm ở từng nhịp, không cộng lại khi kết thúc', () => {
  const f = createEventFilter();
  const counts = [gift(1), gift(3), gift(5), gift(5, true)].map((e) => f(e)).map((e) => (e && e.type === 'gift' ? e.count : 0));
  assert.deepEqual(counts, [1, 2, 2, 0]);
});

test('bỏ gói trùng theo msgId', () => {
  const f = createEventFilter();
  const c = mapTikTokEvent('chat', { user, comment: 'nhập tiệc', common: { msgId: 'm1' } })!;
  assert.ok(f(c));
  assert.equal(f(c), null);
});

test('quà không combo: tính đủ số lượng', () => {
  const f = createEventFilter();
  const e = mapTikTokEvent('gift', { user, repeatCount: 2, giftDetails: { giftName: 'Hat', giftType: 2, diamondCount: 99 } })!;
  const out = f(e);
  assert.ok(out && out.type === 'gift' && out.count === 2 && out.coins === 198);
});

test('đọc username từ link', () => {
  assert.equal(parseUsername('https://www.tiktok.com/@ten.kenh_1/live'), 'ten.kenh_1');
  assert.equal(parseUsername('@abc'), 'abc');
});
