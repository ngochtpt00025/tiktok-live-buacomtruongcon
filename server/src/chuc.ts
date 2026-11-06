// NPC "Thánh ăn chực" (hư cấu): giữa các sự kiện, chú Chực đi vào xin ăn từng mâm.
// Mâm đó chat "mời chú" → +2 tình nghĩa / lời mời (tối đa +10 mỗi mâm); "đuổi" hoặc 20 giây không ai mời → sang mâm khác.
// Sau tối đa 3 mâm thì về; cả sân mời nhiều (≥ 5) → chú "trả lễ" hát tặng cả sân.
import type { EventCtx } from './events.js';
import type { Guest } from './room.js';
import type { IntentMatch } from './intents.js';

const STAY_MS = 20000;
const MAX_TABLES = 3;

export class ChucController {
  private active = false;
  private table = -1;
  private visited: number[] = [];
  private invites = new Map<number, number>();
  private totalInvites = 0;
  private leaveAt = 0;
  private arrived = false;
  nextAt = Date.now() + 120000;

  constructor(private ctx: EventCtx) {}

  get isActive() { return this.active; }
  /** Mâm chú Chực đang đứng (để bot giả lập biết mà mời) */
  get currentTable() { return this.arrived ? this.table : -1; }

  scheduleNext(minMs = 240000, maxMs = 360000) { this.nextAt = Date.now() + minMs + Math.random() * (maxMs - minMs); }

  /** Bắt đầu một lượt đi xin. Trả về false nếu sân chưa đủ khách. */
  start(): boolean {
    if (this.active) return false;
    const t = this.pickTable();
    if (t < 0) return false;
    this.active = true;
    this.visited = [];
    this.invites.clear();
    this.totalInvites = 0;
    this.goTo(t, true);
    this.ctx.log('Chú Chực vào sân xin ăn');
    return true;
  }

  /** Huỷ lượt (vd. có sự kiện lớn bắt đầu). */
  stop() {
    if (!this.active) return;
    this.active = false;
    this.arrived = false;
    this.ctx.npc.leave('chuc');
    this.scheduleNext(120000, 200000); // bị sự kiện cắt ngang → lượt sau 2–3 phút
  }

  onIntent(g: Guest, m: IntentMatch): boolean {
    if (!this.active || !this.arrived) return false;
    if (m.intent !== 'INVITE' && m.intent !== 'SHOO') return false;
    if (g.table !== this.table) return false; // chỉ mâm chú đang đứng mới quyết
    if (m.intent === 'SHOO') {
      this.ctx.broadcast({ t: 'npc_emote', id: 'chuc', kind: 'sad' });
      this.ctx.sayAs('chuc_sad', {}, 3, { speaker: 'chuc', voice: CHUC_VOICE });
      this.next();
      return true;
    }
    const n = this.invites.get(this.table) ?? 0;
    this.ctx.broadcast({ t: 'emote', id: g.id, kind: 'wave' });
    if (n < 5) { this.invites.set(this.table, n + 1); this.totalInvites++; this.ctx.bond(this.table, 2); }
    if (n === 0) {
      this.ctx.broadcast({ t: 'npc_emote', id: 'chuc', kind: 'happy' });
      this.ctx.sayAs('chuc_happy', { table: this.table + 1 }, 3, { speaker: 'chuc', voice: CHUC_VOICE });
    } else this.ctx.broadcast({ t: 'npc_emote', id: 'chuc', kind: 'eat' });
    return true;
  }

  tick() {
    if (!this.active || !this.arrived) return;
    if (Date.now() > this.leaveAt) this.next();
  }

  private next() {
    this.arrived = false;
    if (this.visited.length >= MAX_TABLES) return this.finish();
    const t = this.pickTable();
    if (t < 0) return this.finish();
    this.ctx.sayAs('chuc_next', {}, 1, { speaker: 'chuc', voice: CHUC_VOICE });
    this.goTo(t, false);
  }

  private goTo(t: number, spawn: boolean) {
    this.table = t;
    this.visited.push(t);
    const onArrive = () => {
      if (!this.active) return;
      this.arrived = true;
      this.leaveAt = Date.now() + STAY_MS;
      this.ctx.broadcast({ t: 'npc_emote', id: 'chuc', kind: 'chicken' });
      this.ctx.sayAs('chuc_ask', { table: t + 1 }, 3, { speaker: 'chuc', voice: CHUC_VOICE });
      this.ctx.broadcast({ t: 'banner', text: `Chú Chực xin ăn ở mâm ${t + 1}: chat "mời chú" hoặc "đuổi"`, ms: 5000 });
    };
    if (spawn) this.ctx.npc.spawn('chuc', { kind: 'table', table: t }, onArrive);
    else this.ctx.npc.goto('chuc', { kind: 'table', table: t }, onArrive);
  }

  private finish() {
    if (this.totalInvites >= 5) {
      this.ctx.sayAs('chuc_thanks', {}, 2, { speaker: 'chuc', voice: CHUC_VOICE });
      const best = [...this.invites.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best) this.ctx.broadcast({ t: 'table_fx', table: best[0], kind: 'celebrate' });
    } else {
      this.ctx.sayAs('chuc_leave', {}, 1, { speaker: 'chuc', voice: CHUC_VOICE });
    }
    this.ctx.log(`Chú Chực về: ${this.totalInvites} lời mời qua ${this.visited.length} mâm`);
    this.active = false;
    setTimeout(() => this.ctx.npc.leave('chuc'), 4000);
    this.scheduleNext();
  }

  /** Mâm chưa ghé, đông người + nhiều tình nghĩa thì ưu tiên. */
  private pickTable(): number {
    let best = -1, bestScore = 0;
    for (const t of this.ctx.room.occupiedTables()) {
      if (this.visited.includes(t)) continue;
      const n = this.ctx.room.guestsAt(t).length;
      const score = n * 3 + Math.random() * 4;
      if (n >= 1 && score > bestScore) { best = t; bestScore = score; }
    }
    return best;
  }
}

/** Giọng chú Chực: chậm, trầm hơn chủ tiệc (chênh %) */
export const CHUC_VOICE = { rate: -6, pitch: -14 };
