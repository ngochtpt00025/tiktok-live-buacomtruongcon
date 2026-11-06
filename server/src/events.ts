import { TABLE_COUNT } from '../../shared/layout.js';
import { readFileSync } from 'node:fs';
import type { EventDTO, EventId, HeatLevel, HostTarget, ServerMsg, Speaker, TableProgress, VoiceFx } from '../../shared/protocol.js';
import { VOTE_WORDS, type IntentMatch } from './intents.js';
import type { NpcManager } from './npc.js';
import { contentPath } from './paths.js';
import type { Guest, Room } from './room.js';

export interface SayOpts { lookAt?: string; fx?: VoiceFx; speaker?: Speaker; voice?: { rate: number; pitch: number } }

/** Giọng "người dẫn" khi khách kể chuyện: nhanh và cao hơn chủ tiệc một chút. */
export const NARRATOR_VOICE = { rate: 6, pitch: 10 };

/** Những gì một sự kiện được phép làm với game. */
export interface EventCtx {
  room: Room;
  broadcast(m: ServerMsg): void;
  say(group: string, vars: Record<string, string | number>, priority: number, lookAt?: string, fx?: VoiceFx): void;
  /** Hàng đợi thoại đang rảnh (để sự kiện canh nhịp) */
  speechIdle(): boolean;
  /** Nói theo nhóm thoại nhưng chọn người nói / giọng */
  sayAs(group: string, vars: Record<string, string | number>, priority: number, opts: SayOpts): void;
  /** Nói một câu cụ thể (không lấy từ lines.json) */
  sayText(text: string, priority: number, opts?: SayOpts): void;
  npc: NpcManager;
  heat(): HeatLevel;
  hostPose(pose: 'stand' | 'sit'): void;
  /** Giọng của chú Quang (chênh so với chủ tiệc) */
  quangVoice(): { rate: number; pitch: number };
  bond(table: number, pts: number): void;
  hostGoto(target: HostTarget, onArrive?: () => void): void;
  log(msg: string): void;
}

export interface GameEvent {
  id: EventId;
  title: string;
  hint: string;
  durationMs: number;
  /** false = không đủ điều kiện để bắt đầu */
  start(ctx: EventCtx): boolean;
  /** true = sự kiện đã "ăn" intent này (game không phản ứng mặc định nữa) */
  onIntent(g: Guest, m: IntentMatch, ctx: EventCtx): boolean;
  /** true = kết thúc sớm */
  tick?(ctx: EventCtx): boolean;
  end(ctx: EventCtx): void;
  progress?(ctx: EventCtx): (TableProgress | null)[];
}

// ---------------------------------------------------------------------------
// 1. Bát cơm – bát cháo: các mâm thi nhau chia cháo cho đủ cả mâm.
// ---------------------------------------------------------------------------
class ChaoEvent implements GameEvent {
  id = 'chao' as const;
  title = '🥣 BÁT CƠM – BÁT CHÁO';
  hint = 'Chat "bát cháo" để chia cháo! Mâm nào ĐỦ CẢ MÂM trước thì thắng';
  durationMs = 45000;
  private served = new Map<number, Set<string>>();
  private winner = -1;

  start(ctx: EventCtx) {
    const eligible = this.eligible(ctx);
    if (!eligible.length) { ctx.log('Bát cháo: cần ít nhất 1 mâm có 2 khách'); return false; }
    ctx.hostGoto({ kind: 'stage' });
    ctx.say('ev_chao_start', {}, 3);
    return true;
  }

  private eligible(ctx: EventCtx) {
    const out: number[] = [];
    for (let t = 0; t < TABLE_COUNT; t++) if (ctx.room.guestsAt(t).length >= 2) out.push(t);
    return out;
  }

  onIntent(g: Guest, m: IntentMatch, ctx: EventCtx) {
    const intent = m.intent;
    if (intent !== 'CHAO' && intent !== 'EAT') return false;
    if (g.table < 0) return true;
    let set = this.served.get(g.table);
    if (!set) this.served.set(g.table, (set = new Set()));
    if (!set.has(g.id)) {
      set.add(g.id);
      ctx.broadcast({ t: 'emote', id: g.id, kind: 'chao' });
      ctx.bond(g.table, 1);
    }
    const total = ctx.room.guestsAt(g.table).length;
    if (this.winner < 0 && total >= 2 && this.count(g.table, ctx) >= total) this.winner = g.table;
    return true;
  }

  /** Chỉ đếm những người còn đang ngồi ở mâm. */
  private count(t: number, ctx: EventCtx) {
    const set = this.served.get(t);
    if (!set) return 0;
    return ctx.room.guestsAt(t).filter((g) => set.has(g.id)).length;
  }

  tick() { return this.winner >= 0; }

  progress(ctx: EventCtx) {
    const out: (TableProgress | null)[] = [];
    for (let t = 0; t < TABLE_COUNT; t++) {
      const total = ctx.room.guestsAt(t).length;
      out.push(total >= 2 ? { done: this.count(t, ctx), total } : null);
    }
    return out;
  }

  end(ctx: EventCtx) {
    let win = this.winner;
    if (win < 0) {
      // hết giờ: mâm có tỉ lệ cao nhất (tối thiểu 50%)
      let best = 0.5;
      for (let t = 0; t < TABLE_COUNT; t++) {
        const total = ctx.room.guestsAt(t).length;
        if (total < 2) continue;
        const r = this.count(t, ctx) / total;
        if (r >= best) { best = r; win = t; }
      }
    }
    if (win < 0) { ctx.say('ev_chao_none', {}, 3); return; }
    ctx.bond(win, 30);
    ctx.broadcast({ t: 'table_fx', table: win, kind: 'win' });
    ctx.broadcast({ t: 'banner', text: `🏆 Mâm ${win + 1}: Tình Nghĩa Đong Đầy! +30`, ms: 5000 });
    for (const g of ctx.room.guestsAt(win)) ctx.broadcast({ t: 'emote', id: g.id, kind: 'cheer' });
    ctx.hostGoto({ kind: 'table', table: win }, () => ctx.say('ev_chao_win', { table: win + 1 }, 3));
    ctx.log(`Bát cháo: mâm ${win + 1} thắng`);
  }
}

// ---------------------------------------------------------------------------
// 2. Anh thanh toán rồi: khách chạy lên quầy giành trả tiền, cú twist cuối.
// ---------------------------------------------------------------------------
class PaymentEvent implements GameEvent {
  id = 'payment' as const;
  title = '💸 ANH THANH TOÁN RỒI!';
  hint = 'Chat "em trả" để chạy lên quầy giành hoá đơn! 3 người nhanh nhất được thưởng';
  durationMs = 32000;
  private runners: Guest[] = [];

  start(ctx: EventCtx) {
    if (ctx.room.seatedCount < 1) { ctx.log('Thanh toán: chưa có khách'); return false; }
    ctx.hostGoto({ kind: 'counter' }, () => ctx.say('ev_pay_start', {}, 3));
    return true;
  }

  onIntent(g: Guest, m: IntentMatch, ctx: EventCtx) {
    const intent = m.intent;
    if (intent !== 'PAYMENT') return false;
    if (g.table < 0 || this.runners.includes(g) || this.runners.length >= 12) return true;
    this.runners.push(g);
    ctx.broadcast({ t: 'guest_goto', id: g.id, spot: 'counter', index: this.runners.length - 1 });
    ctx.broadcast({ t: 'emote', id: g.id, kind: 'pay' });
    if (this.runners.length <= 3) ctx.broadcast({ t: 'banner', text: `#${this.runners.length} ${g.nick} chạy lên quầy!`, ms: 2500 });
    return true;
  }

  end(ctx: EventCtx) {
    ctx.say('ev_pay_twist', {}, 3);
    ctx.broadcast({ t: 'host_emote', kind: 'laugh' });
    const tables = new Set<number>();
    this.runners.forEach((g, i) => {
      ctx.broadcast({ t: 'emote', id: g.id, kind: 'laugh' });
      if (g.table >= 0) { ctx.bond(g.table, i < 3 ? 10 : 3); tables.add(g.table); }
    });
    if (this.runners.length) {
      ctx.broadcast({ t: 'banner', text: `Nhanh nhất: ${this.runners.slice(0, 3).map((g) => g.nick).join(', ')} — mâm được +10 tình nghĩa`, ms: 5000 });
    }
    // trả khách về chỗ sau khi cười xong
    const runners = this.runners;
    setTimeout(() => {
      for (const g of runners) if (ctx.room.has(g.id)) ctx.broadcast({ t: 'move', id: g.id, table: g.table, seat: g.seat });
    }, 3500);
    ctx.log(`Thanh toán: ${runners.length} người chạy lên quầy`);
  }
}

// ---------------------------------------------------------------------------
// 3. Kỷ niệm không bao giờ quên: chụp ảnh tập thể.
// ---------------------------------------------------------------------------
class PhotoEvent implements GameEvent {
  id = 'photo' as const;
  title = '📸 KỶ NIỆM KHÔNG BAO GIỜ QUÊN';
  hint = 'Chat "chụp ảnh" để có tên trong ảnh kỷ niệm!';
  durationMs = 25000;
  private people: Guest[] = [];

  start(ctx: EventCtx) {
    if (ctx.room.guests.size < 1) { ctx.log('Chụp ảnh: chưa có khách'); return false; }
    ctx.hostGoto({ kind: 'stage' }, () => ctx.say('ev_photo_start', {}, 3));
    return true;
  }

  onIntent(g: Guest, m: IntentMatch, ctx: EventCtx) {
    const intent = m.intent;
    if (intent !== 'PHOTO') return false;
    if (!this.people.includes(g)) {
      this.people.push(g);
      ctx.broadcast({ t: 'emote', id: g.id, kind: 'camera' });
    }
    return true;
  }

  end(ctx: EventCtx) {
    if (!this.people.length) { ctx.say('ev_photo_none', {}, 2); return; }
    const names = this.people.map((g) => g.nick);
    ctx.broadcast({ t: 'photo', names, caption: 'Mâm cơm nhỏ, hạnh phúc to', ms: 8000 });
    for (const g of this.people) if (g.table >= 0) ctx.bond(g.table, 2);
    ctx.say('ev_photo_end', { n: names.length }, 3);
    ctx.log(`Chụp ảnh: ${names.length} người`);
  }
}

// ---------------------------------------------------------------------------
// 4. Đại hội anh em bốn bể: khách chat "phát biểu", lần lượt lên bục, chủ tiệc đọc lời chúc.
// ---------------------------------------------------------------------------
class ToastEvent implements GameEvent {
  id = 'toast' as const;
  title = '🎤 ĐẠI HỘI ANH EM BỐN BỂ';
  hint = 'Chat "phát biểu" để được mời lên bục! Mỗi người lên bục: mâm +8 tình nghĩa';
  durationMs = 70000;
  private queue: Guest[] = [];
  private done = new Set<string>();
  private current: Guest | null = null;
  private nextAt = 0;
  private spoken = 0;
  private ended = false;

  start(ctx: EventCtx) {
    if (ctx.room.seatedCount < 1) { ctx.log('Phát biểu: chưa có khách'); return false; }
    ctx.hostGoto({ kind: 'stage' });
    ctx.say('ev_toast_start', {}, 3);
    this.nextAt = Date.now() + 10000;
    return true;
  }

  onIntent(g: Guest, m: IntentMatch, ctx: EventCtx) {
    if (m.intent !== 'TOAST') return false;
    if (g.table < 0 || this.done.has(g.id) || this.queue.includes(g) || this.current === g) return true;
    if (this.queue.length >= 6) return true;
    this.queue.push(g);
    ctx.broadcast({ t: 'emote', id: g.id, kind: 'star' });
    ctx.broadcast({ t: 'event_note', text: `Hàng chờ phát biểu: ${this.queue.map((q) => q.nick).join(', ')}` });
    return true;
  }

  tick(ctx: EventCtx) {
    const now = Date.now();
    if (now < this.nextAt) return false; // thoại sự kiện ưu tiên 3 nên tự chen lên đầu hàng đợi
    // người trước về chỗ
    if (this.current) {
      const g = this.current;
      this.current = null;
      if (ctx.room.has(g.id)) ctx.broadcast({ t: 'move', id: g.id, table: g.table, seat: g.seat });
    }
    while (this.queue.length && !ctx.room.has(this.queue[0].id)) this.queue.shift();
    const g = this.queue.shift();
    if (!g) return this.spoken >= 4; // đã có 4 người thì kết thúc sớm khi hết hàng
    this.current = g;
    this.done.add(g.id);
    this.spoken++;
    ctx.broadcast({ t: 'guest_goto', id: g.id, spot: 'stage', index: 0 });
    ctx.say('toast_call', { nick: g.nick, table: g.table + 1 }, 3, g.id);
    // lời chúc đọc sau khi khách đi lên bục (đọc qua hàng đợi thoại nên tự nối tiếp)
    setTimeout(() => {
      if (this.ended) return;
      ctx.say('toast_wish', { nick: g.nick, table: g.table + 1 }, 3, g.id);
      for (const o of ctx.room.guestsAt(g.table)) ctx.broadcast({ t: 'emote', id: o.id, kind: 'cheer' });
      ctx.bond(g.table, 8);
    }, 2500);
    ctx.broadcast({ t: 'event_note', text: this.queue.length ? `Tiếp theo: ${this.queue.map((q) => q.nick).join(', ')}` : 'Chat "phát biểu" để lên bục!' });
    this.nextAt = now + 9000;
    return false;
  }

  end(ctx: EventCtx) {
    this.ended = true;
    if (this.current && ctx.room.has(this.current.id)) ctx.broadcast({ t: 'move', id: this.current.id, table: this.current.table, seat: this.current.seat });
    ctx.say(this.spoken ? 'ev_toast_end' : 'ev_toast_none', {}, 3);
    ctx.log(`Phát biểu: ${this.spoken} người`);
  }
}

// ---------------------------------------------------------------------------
// 5. Giọng ông cụ: bình chọn chủ đề, chủ tiệc hoá ông cụ kể chuyện bằng giọng trầm có vang.
// ---------------------------------------------------------------------------
const TOPICS = ['Tình bạn', 'Bữa cơm', 'Ngày xưa'];
class OldVoiceEvent implements GameEvent {
  id = 'oldvoice' as const;
  title = '👴 MÀY THÍCH GIỌNG ÔNG CỤ KHÔNG?';
  hint = 'Chat 1 · 2 · 3 để chọn chuyện ông cụ kể';
  durationMs = 30000;
  private votes = new Map<string, number>();
  private noteAt = 0;

  start(ctx: EventCtx) {
    ctx.hostGoto({ kind: 'stage' }, () => {
      ctx.broadcast({ t: 'host_costume', costume: 'old' });
      ctx.say('ev_old_start', {}, 3, undefined, 'old');
    });
    return true;
  }

  private tally() {
    const c = [0, 0, 0];
    for (const v of this.votes.values()) c[v - 1]++;
    return c;
  }

  onIntent(g: Guest, m: IntentMatch, ctx: EventCtx) {
    if (m.intent !== 'VOTE' || !m.value || m.value < 1 || m.value > 3) return false;
    this.votes.set(g.id, m.value);
    ctx.broadcast({ t: 'emote', id: g.id, kind: 'star' });
    return true;
  }

  tick(ctx: EventCtx) {
    if (Date.now() > this.noteAt) {
      this.noteAt = Date.now() + 1500;
      const c = this.tally();
      ctx.broadcast({ t: 'event_note', text: TOPICS.map((t, i) => `${i + 1}. ${t}: ${c[i]}`).join('   ·   ') });
    }
    return false;
  }

  end(ctx: EventCtx) {
    const c = this.tally();
    const total = c[0] + c[1] + c[2];
    const win = total ? c.indexOf(Math.max(...c)) : Math.floor(Math.random() * 3);
    ctx.broadcast({ t: 'banner', text: `Ông cụ kể chuyện: ${TOPICS[win]}${total ? ` (${c[win]}/${total} phiếu)` : ''}`, ms: 4000 });
    ctx.say(`old_story_${win + 1}`, {}, 3, undefined, 'old');
    ctx.say(`old_story_${win + 1}`, {}, 3, undefined, 'old');
    ctx.say('ev_old_end', {}, 3, undefined, 'old');
    // cởi trang phục sau khi kể xong
    setTimeout(() => ctx.broadcast({ t: 'host_costume', costume: 'normal' }), 22000);
    for (const [id, v] of this.votes) {
      const g = ctx.room.get(id);
      if (g && v === win + 1 && g.table >= 0) ctx.bond(g.table, 1);
    }
    ctx.log(`Giọng ông cụ: ${TOPICS[win]} (${total} phiếu)`);
    void VOTE_WORDS;
  }
}

// ---------------------------------------------------------------------------
// 6. Quang lên tiếng: tranh cãi vui A/B, chú Quang (hư cấu) lên bục phán.
// ---------------------------------------------------------------------------
interface Debate { q: string; a: string; b: string }
let debateCache: Debate[] | null = null;
function debates(): Debate[] {
  if (!debateCache) {
    try { debateCache = (JSON.parse(readFileSync(contentPath('debates.json'), 'utf8')).debates as Debate[]).filter((d) => d.q && d.a && d.b); }
    catch { debateCache = []; }
    if (!debateCache.length) debateCache = [{ q: 'Gà luộc chấm gì mới chuẩn?', a: 'Muối tiêu chanh', b: 'Nước mắm gừng' }];
  }
  return debateCache;
}
let lastDebate = -1;

class QuangEvent implements GameEvent {
  id = 'quang' as const;
  title = '🗣 QUANG LÊN TIẾNG';
  hint = '';
  durationMs = 45000;
  private d: Debate;
  private votes = new Map<string, 1 | 2>();
  private noteAt = 0;
  private quangCalled = false;
  private startedAt = 0;

  constructor() {
    const list = debates();
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === lastDebate) i = (i + 1) % list.length;
    lastDebate = i;
    this.d = list[i];
    this.hint = `${this.d.q}  —  chat A hoặc B`;
  }

  start(ctx: EventCtx) {
    this.startedAt = Date.now();
    ctx.hostGoto({ kind: 'stage' });
    ctx.broadcast({ t: 'event_note', text: `A. ${this.d.a}: 0   ·   B. ${this.d.b}: 0` });
    ctx.say('quang_intro', {}, 3);
    ctx.sayText(`${this.d.q} A là ${this.d.a}, B là ${this.d.b}. Chat A hoặc B nhé!`, 3);
    return true;
  }

  onIntent(g: Guest, m: IntentMatch, ctx: EventCtx) {
    let v: 1 | 2 | null = null;
    if (m.intent === 'VOTE_AB') v = m.value === 2 ? 2 : 1;
    else if (m.intent === 'VOTE' && (m.value === 1 || m.value === 2)) v = m.value;
    if (!v) return false;
    this.votes.set(g.id, v);
    ctx.broadcast({ t: 'emote', id: g.id, kind: 'star' });
    return true;
  }

  private tally() {
    let a = 0, b = 0;
    for (const v of this.votes.values()) v === 1 ? a++ : b++;
    return { a, b };
  }

  tick(ctx: EventCtx) {
    const now = Date.now();
    if (now > this.noteAt) {
      this.noteAt = now + 1500;
      const { a, b } = this.tally();
      const tot = a + b || 1;
      ctx.broadcast({ t: 'event_note', text: `A. ${this.d.a}: ${a} (${Math.round((a / tot) * 100)}%)   ·   B. ${this.d.b}: ${b} (${Math.round((b / tot) * 100)}%)` });
    }
    if (!this.quangCalled && now - this.startedAt > 22000) {
      this.quangCalled = true;
      ctx.npc.spawn('quang', { kind: 'stage' }, () => {
        ctx.broadcast({ t: 'npc_emote', id: 'quang', kind: 'think' });
        ctx.sayAs('quang_arrive', {}, 3, { speaker: 'quang', voice: ctx.quangVoice() });
      });
    }
    return false;
  }

  end(ctx: EventCtx) {
    const { a, b } = this.tally();
    const total = a + b;
    let side: 1 | 2;
    let twist = false;
    if (!total) { side = Math.random() < 0.5 ? 1 : 2; ctx.sayAs('quang_none', {}, 3, { speaker: 'quang', voice: ctx.quangVoice() }); }
    else if (a === b) side = Math.random() < 0.5 ? 1 : 2;
    else {
      const major: 1 | 2 = a > b ? 1 : 2;
      twist = Math.random() < 0.3;               // 30%: Quang chọn phe ít người cho bất ngờ
      side = twist ? (major === 1 ? 2 : 1) : major;
    }
    const sideName = side === 1 ? 'A' : 'B';
    const answer = side === 1 ? this.d.a : this.d.b;
    if (!ctx.npc.isPresent('quang')) ctx.npc.spawn('quang', { kind: 'stage' });
    ctx.broadcast({ t: 'npc_emote', id: 'quang', kind: 'star' });
    ctx.sayAs('quang_verdict', { side: sideName, answer }, 3, { speaker: 'quang', voice: ctx.quangVoice() });
    ctx.say(twist ? 'quang_host_twist' : 'quang_host_agree', { side: sideName }, 3);
    ctx.broadcast({ t: 'banner', text: `Quang phán: ${sideName} — ${answer}!${twist ? ' (phe ít người!)' : ''}`, ms: 5000 });

    // thưởng: người đúng phe +1 cho mâm; mâm nhiều người đúng nhất +10
    const perTable = new Map<number, number>();
    for (const [id, v] of this.votes) {
      const g = ctx.room.get(id);
      if (!g || g.table < 0 || v !== side) continue;
      ctx.bond(g.table, 1);
      ctx.broadcast({ t: 'emote', id, kind: 'cheer' });
      perTable.set(g.table, (perTable.get(g.table) ?? 0) + 1);
    }
    const best = [...perTable.entries()].sort((x, y) => y[1] - x[1])[0];
    if (best) { ctx.bond(best[0], 10); ctx.broadcast({ t: 'table_fx', table: best[0], kind: 'win' }); }
    setTimeout(() => ctx.npc.leave('quang'), 9000);
    ctx.log(`Quang lên tiếng: "${this.d.q}" A ${a} – B ${b} → ${sideName}${twist ? ' (lật kèo)' : ''}`);
  }
}

// ---------------------------------------------------------------------------
// 7. Gà luộc xé tay: chat "xé", miếng gà bay về mâm; mâm đủ phần cho mọi người là "công bằng".
// ---------------------------------------------------------------------------
class GaEvent implements GameEvent {
  id = 'ga' as const;
  title = '🍗 GÀ LUỘC XÉ TAY';
  hint = 'Chat "xé" để xé gà về mâm mình (tối đa 2 lần/người). Mâm đủ phần cho MỌI NGƯỜI thì thắng!';
  durationMs = 40000;
  private left = 24;
  private total = 24;
  private pieces = new Map<number, number>();
  private perUser = new Map<string, number>();

  start(ctx: EventCtx) {
    if (ctx.room.seatedCount < 2) { ctx.log('Gà xé: cần ít nhất 2 khách'); return false; }
    // ~1,2 miếng / người đang ngồi: đủ để chia nếu cả sân nhường nhau, thiếu nếu vài mâm giành
    this.total = this.left = Math.max(12, Math.min(60, Math.round(ctx.room.seatedCount * 1.2)));
    ctx.hostGoto({ kind: 'stage' });
    ctx.broadcast({ t: 'prop', id: 'ga', show: true, amount: this.left });
    ctx.say('ga_start', {}, 3);
    return true;
  }

  onIntent(g: Guest, m: IntentMatch, ctx: EventCtx) {
    if (m.intent !== 'TEAR' && m.intent !== 'EAT') return false;
    if (g.table < 0 || this.left <= 0) return true;
    const n = this.perUser.get(g.id) ?? 0;
    if (n >= 2) return true;
    this.perUser.set(g.id, n + 1);
    this.left--;
    this.pieces.set(g.table, (this.pieces.get(g.table) ?? 0) + 1);
    ctx.broadcast({ t: 'ga_piece', table: g.table, left: this.left });
    ctx.broadcast({ t: 'emote', id: g.id, kind: 'chicken' });
    return true;
  }

  tick() { return this.left <= 0; }

  progress(ctx: EventCtx) {
    const out: (TableProgress | null)[] = [];
    for (let t = 0; t < TABLE_COUNT; t++) {
      const total = ctx.room.guestsAt(t).length;
      const done = this.pieces.get(t) ?? 0;
      out.push(total ? { done: Math.min(done, 99), total, icon: '🍗' } : null);
    }
    return out;
  }

  end(ctx: EventCtx) {
    ctx.broadcast({ t: 'prop', id: 'ga', show: false, amount: 0 });
    const fair: number[] = [];
    let greedy = -1, greedyRatio = 0;
    for (let t = 0; t < TABLE_COUNT; t++) {
      const seated = ctx.room.guestsAt(t).length;
      const p = this.pieces.get(t) ?? 0;
      if (!seated || !p) continue;
      if (p >= seated) fair.push(t);
      if (p > seated * 2 && p / seated > greedyRatio) { greedy = t; greedyRatio = p / seated; }
    }
    for (const t of fair) { ctx.bond(t, 15); ctx.broadcast({ t: 'table_fx', table: t, kind: 'win' }); }
    if (fair.length) {
      ctx.say('ga_fair', { table: fair.map((t) => t + 1).join(', ') }, 3);
      ctx.broadcast({ t: 'banner', text: `🍗 Mâm công bằng: ${fair.map((t) => t + 1).join(', ')} — mỗi mâm +15`, ms: 5000 });
    }
    if (greedy >= 0) ctx.say('ga_greedy', { table: greedy + 1 }, 2);
    ctx.say('ga_end', {}, 2);
    ctx.log(`Gà xé: còn ${this.left}/${this.total} miếng, mâm công bằng: ${fair.map((t) => t + 1).join(', ') || 'không'}`);
  }
}

// ---------------------------------------------------------------------------
// 8. Nói ít thôi, đau đầu lắm: chủ tiệc ngồi nghỉ, khách chat "kể chuyện" để gọi dậy.
//    Không nằm trong vòng tự động — game tự mở khi sân "bùng nổ" và comment dồn dập.
// ---------------------------------------------------------------------------
let jokeCache: string[] | null = null;
function jokes(): string[] {
  if (!jokeCache) {
    try { jokeCache = (JSON.parse(readFileSync(contentPath('jokes.json'), 'utf8')).jokes as string[]).filter(Boolean); }
    catch { jokeCache = []; }
    if (!jokeCache.length) jokeCache = ['Em định kể chuyện cười, nhưng quên mất đoạn buồn cười rồi.'];
  }
  return jokeCache;
}
const usedJokes = new Set<number>();
function nextJoke() {
  const list = jokes();
  if (usedJokes.size >= list.length) usedJokes.clear();
  let i: number;
  do { i = Math.floor(Math.random() * list.length); } while (usedJokes.has(i));
  usedJokes.add(i);
  return list[i];
}

class HeadacheEvent implements GameEvent {
  id = 'headache' as const;
  title = '😵‍💫 NÓI ÍT THÔI, ĐAU ĐẦU LẮM!';
  hint = 'Chủ tiệc mệt rồi! Chat "kể chuyện" để kể chuyện vui gọi anh ấy dậy';
  durationMs = 60000;
  private volunteers: Guest[] = [];
  private told: Guest[] = [];
  private nextAt = 0;
  private current: Guest | null = null;
  private woke = false;

  start(ctx: EventCtx) {
    ctx.broadcast({ t: 'host_emote', kind: 'dizzy' });
    ctx.say('headache', {}, 3);
    // chỉ mời người kể sau khi chủ tiệc đã ngồi xuống
    this.nextAt = Date.now() + 60000;
    ctx.hostGoto({ kind: 'rest' }, () => {
      ctx.hostPose('sit');
      ctx.broadcast({ t: 'host_emote', kind: 'sleep' });
      ctx.say('headache_rest', {}, 3);
      this.nextAt = Date.now() + 7000;
    });
    return true;
  }

  onIntent(g: Guest, m: IntentMatch, ctx: EventCtx) {
    if (m.intent !== 'STORY') return false;
    if (g.table >= 0 && !this.volunteers.includes(g) && !this.told.includes(g) && this.current !== g) {
      this.volunteers.push(g);
      ctx.broadcast({ t: 'emote', id: g.id, kind: 'laugh' });
      ctx.broadcast({ t: 'event_note', text: `Xin kể: ${this.volunteers.slice(-6).map((v) => v.nick).join(', ')}` });
    }
    return true;
  }

  tick(ctx: EventCtx) {
    const now = Date.now();
    if (now < this.nextAt) return false;
    if (this.current) {
      const g = this.current;
      this.current = null;
      if (ctx.room.has(g.id)) ctx.broadcast({ t: 'move', id: g.id, table: g.table, seat: g.seat });
      if (this.told.length >= 2) { this.wake(ctx); return true; }
    }
    this.volunteers = this.volunteers.filter((v) => ctx.room.has(v.id));
    if (!this.volunteers.length) { this.nextAt = now + 3000; return false; }
    const g = this.volunteers.splice(Math.floor(Math.random() * this.volunteers.length), 1)[0];
    this.current = g;
    this.told.push(g);
    ctx.broadcast({ t: 'guest_goto', id: g.id, spot: 'stage', index: 0 });
    ctx.say('headache_call', { nick: g.nick, table: g.table + 1 }, 3, g.id);
    // chuyện đọc bằng giọng "người dẫn", bong bóng hiện trên đầu khách kể
    setTimeout(() => { if (!this.woke) ctx.sayText(nextJoke(), 3, { speaker: { guest: g.id }, voice: NARRATOR_VOICE }); }, 2500);
    this.nextAt = now + 15000;
    return false;
  }

  private wake(ctx: EventCtx) {
    if (this.woke) return;
    this.woke = true;
    ctx.hostPose('stand');
    const last = this.told[this.told.length - 1];
    if (this.told.length && last) {
      ctx.say('headache_wake', { table: last.table + 1 }, 3);
      for (const g of this.told) if (g.table >= 0) { ctx.bond(g.table, 10); ctx.broadcast({ t: 'table_fx', table: g.table, kind: 'celebrate' }); }
    } else {
      ctx.say('headache_none', {}, 3);
    }
    ctx.hostGoto({ kind: 'stage' });
  }

  end(ctx: EventCtx) {
    if (this.current && ctx.room.has(this.current.id)) ctx.broadcast({ t: 'move', id: this.current.id, table: this.current.table, seat: this.current.seat });
    this.wake(ctx);
    ctx.log(`Đau đầu: ${this.told.length} người kể chuyện`);
  }
}

const FACTORY: Record<EventId, () => GameEvent> = {
  chao: () => new ChaoEvent(),
  payment: () => new PaymentEvent(),
  photo: () => new PhotoEvent(),
  toast: () => new ToastEvent(),
  oldvoice: () => new OldVoiceEvent(),
  quang: () => new QuangEvent(),
  ga: () => new GaEvent(),
  headache: () => new HeadacheEvent(),
};

/**
 * Trọng số chọn sự kiện tự động theo độ náo nhiệt.
 * Vắng: sự kiện ít người cũng vui (chụp ảnh, ông cụ, Quang). Đông: sự kiện tập thể (bát cháo, gà xé).
 * "Đau đầu" không nằm ở đây — game tự mở khi sân bùng nổ.
 */
const WEIGHTS: Record<HeatLevel, [EventId, number][]> = {
  vang: [['photo', 3], ['oldvoice', 3], ['quang', 3], ['payment', 2], ['toast', 2], ['chao', 1], ['ga', 1]],
  am: [['chao', 3], ['payment', 3], ['quang', 3], ['ga', 3], ['photo', 2], ['toast', 2], ['oldvoice', 2]],
  dong: [['chao', 4], ['ga', 4], ['quang', 3], ['payment', 3], ['toast', 2], ['photo', 1], ['oldvoice', 1]],
  bungno: [['chao', 4], ['ga', 4], ['quang', 3], ['payment', 3], ['toast', 1], ['photo', 1], ['oldvoice', 1]],
};
/** Giãn cách sự kiện theo độ náo nhiệt (vắng: dày hơn để giữ người; bùng nổ: thưa hơn) */
const GAP_MULT: Record<HeatLevel, number> = { vang: 0.75, am: 1, dong: 1, bungno: 1.3 };

/**
 * Event Director: mỗi lúc tối đa 1 sự kiện. Tự chọn sự kiện theo trọng số, không lặp lại liền nhau,
 * chỉ chạy khi sân đủ đông. Bảng điều khiển có thể bật/tắt hoặc gọi sự kiện bằng tay.
 */
export class EventDirector {
  current: GameEvent | null = null;
  private endsAt = 0;
  private startedAt = 0;
  private nextAt = 0;
  private last: EventId | null = null;
  private progressDirty = false;
  private participants = new Set<string>();
  /** Báo khi sự kiện kết thúc (cho chỉ số phiên) */
  onEnd: (id: EventId, participants: number, durationMs: number) => void = () => {};

  /** Mỗi lần khách tham gia sự kiện (cho Độ náo nhiệt) */
  onUse: () => void = () => {};
  /** Trước khi gọi end(): bỏ các câu thoại còn chờ của sự kiện */
  onBeforeEnd: (id: EventId) => void = () => {};
  /** Sự kiện đang "sở hữu" các câu thoại được đẩy vào lúc này */
  taggingId: EventId | null = null;
  /** Lúc sự kiện gần nhất kết thúc */
  lastEndAt = 0;

  constructor(private ctx: EventCtx, public enabled: boolean, public gapSec: number) {
    this.schedule();
  }

  schedule() {
    const mult = GAP_MULT[this.ctx.heat()] ?? 1;
    this.nextAt = Date.now() + this.gapSec * 1000 * mult * (0.8 + Math.random() * 0.4);
  }

  nextInSec(): number | null {
    if (!this.enabled || this.current) return null;
    return Math.max(0, Math.round((this.nextAt - Date.now()) / 1000));
  }

  start(id: EventId): boolean {
    if (this.current) this.stop();
    const ev = FACTORY[id]();
    this.taggingId = id;
    if (!ev.start(this.ctx)) { this.taggingId = null; return false; }
    this.current = ev;
    this.participants.clear();
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + ev.durationMs;
    this.last = id;
    this.ctx.broadcast({ t: 'event', event: this.dto() });
    this.ctx.broadcast({ t: 'banner', text: ev.hint, ms: 6000 });
    this.progressDirty = true;
    this.ctx.log(`Sự kiện bắt đầu: ${ev.title}`);
    return true;
  }

  stop() {
    const ev = this.current;
    if (!ev) return;
    this.current = null;
    this.onBeforeEnd(ev.id);
    this.taggingId = ev.id;
    ev.end(this.ctx);
    this.taggingId = null;
    this.lastEndAt = Date.now();
    this.onEnd(ev.id, this.participants.size, Date.now() - this.startedAt);
    this.ctx.broadcast({ t: 'event', event: null });
    this.ctx.broadcast({ t: 'event_progress', tables: [] });
    this.schedule();
  }

  onIntent(g: Guest, m: IntentMatch): boolean {
    if (!this.current) return false;
    const used = this.current.onIntent(g, m, this.ctx);
    if (used) { this.progressDirty = true; this.participants.add(g.id); this.onUse(); }
    return used;
  }

  tick() {
    const now = Date.now();
    if (this.current) {
      if (this.current.tick?.(this.ctx) || now >= this.endsAt) return this.stop();
      if (this.progressDirty && this.current.progress) {
        this.progressDirty = false;
        this.ctx.broadcast({ t: 'event_progress', tables: this.current.progress(this.ctx) });
      }
      return;
    }
    if (!this.enabled || now < this.nextAt) return;
    if (this.ctx.room.seatedCount < 3) { this.nextAt = now + 10000; return; }
    const pool = WEIGHTS[this.ctx.heat()].filter(([id]) => id !== this.last);
    let r = Math.random() * pool.reduce((s, [, w]) => s + w, 0);
    let pick = pool[0][0];
    for (const [id, w] of pool) { r -= w; if (r <= 0) { pick = id; break; } }
    if (!this.start(pick)) this.schedule();
  }

  /** Ghế thay đổi (vào/ra/đổi mâm) → cập nhật tiến độ. */
  touch() { this.progressDirty = true; }

  dto(): EventDTO | null {
    const ev = this.current;
    if (!ev) return null;
    return { id: ev.id, title: ev.title, hint: ev.hint, durationMs: ev.durationMs, remainingMs: Math.max(0, this.endsAt - Date.now()) };
  }
}
