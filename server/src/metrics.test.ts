import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionMetrics } from './metrics.js';

test('tỉ lệ nhập tiệc, giữ chân 3 phút, khách có sẵn, báo cáo', () => {
  mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  try {
    const root = mkdtempSync(join(tmpdir(), 'buacom-'));
    const m = new SessionMetrics(root);
    m.start('test', ['old1']);                 // 1 khách đã ngồi sẵn

    // 4 người comment, 2 người nhập tiệc
    for (const u of ['a', 'b', 'c', 'old1']) m.chat(u, 'rule', 'EAT');
    m.join('a', 2);
    m.join('b', 3);

    mock.timers.tick(200_000);                 // 3 phút 20 giây sau
    m.chat('a', 'rule', 'CHAO');               // a còn tương tác, b thì không
    m.speechLatency(1200);
    m.eventEnd('chao', 3, 45_000);

    const s = m.snapshot();
    assert.equal(s.chatters, 4);
    assert.equal(s.joined, 3);                 // a, b + old1
    assert.equal(s.joinRate, 75);
    assert.equal(s.retained3, 33);             // chỉ a (trong a, b, old1)
    assert.equal(s.peakGuests, 3);
    assert.equal(s.events, 1);

    const r = m.stop()!;
    assert.ok(existsSync(join(root, 'sessions', r.reportFile)));
    const html = readFileSync(join(root, 'sessions', r.reportFile), 'utf8');
    assert.ok(html.includes('Bát cơm'));
    // log không chứa id gốc của người xem
    const log = readFileSync(join(root, 'sessions', r.reportFile.replace('.html', '.jsonl')), 'utf8');
    assert.ok(!log.includes('"old1"') && !log.includes('"a"'));
  } finally {
    mock.timers.reset();
  }
});
