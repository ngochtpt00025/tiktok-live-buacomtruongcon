import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockClassify, parseAiJson } from './classifier.js';
import { cleanForSpeech } from '../tts/service.js';
import { mp3DurationMs } from '../tts/mp3.js';

test('đọc JSON trả về của model, kể cả có chữ thừa', () => {
  const r = parseAiJson('Đây: {"r":[{"i":0,"intent":"EAT"},{"i":1,"intent":"MOVE_TABLE","table":4}]} xong');
  assert.equal(r.length, 2);
  assert.equal(r[1].table, 4);
  assert.deepEqual(parseAiJson('không có json'), []);
});

test('bộ phân loại giả', () => {
  assert.equal(mockClassify('cho em vào với anh ơi').intent, 'JOIN');
  assert.deepEqual(mockClassify('em qua bàn số 4 nhé'), { intent: 'MOVE_TABLE', table: 4 });
  assert.equal(mockClassify('món gà nhìn ngon thế').intent, 'PRAISE_FOOD');
});

test('làm sạch câu trước khi đọc', () => {
  assert.equal(cleanForSpeech('Chào 🎉 Linh =)) nhé!!'), 'Chào Linh nhé!!');
});

test('đo thời lượng MP3 (frame MPEG2 24kHz 48kbps)', () => {
  // dựng 100 frame giả: MPEG2 Layer III, 48kbps, 24000Hz → mỗi frame 576 mẫu = 24ms, dài 144 byte
  const frame = Buffer.alloc(144);
  frame[0] = 0xff; frame[1] = 0xf3; frame[2] = 0x64; frame[3] = 0xc4; // ver=2 (MPEG2), layer III, br idx 6 (48k), sr idx 1 (24k)
  const buf = Buffer.concat(Array(100).fill(frame));
  assert.equal(mp3DurationMs(buf), 2400);
});
