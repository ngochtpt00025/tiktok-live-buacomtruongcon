import { SEATS_PER_TABLE, TABLE_COUNT } from '../../shared/layout.js';
import type { GuestDTO } from '../../shared/protocol.js';

export interface Guest extends GuestDTO {
  lastActive: number;
  joinedAt: number;
  /** số lần tương tác sau khi vào (0 = "người âm thầm") */
  actions: number;
  quietCalled?: boolean;
}

/**
 * Trạng thái sân tiệc: ai đang ngồi ghế nào, ai đang đứng chờ ở cổng.
 * Bất biến: mỗi ghế tối đa 1 khách; mỗi userId tối đa 1 nhân vật.
 */
export class Room {
  readonly guests = new Map<string, Guest>();
  private seats: (string | null)[][] = Array.from({ length: TABLE_COUNT }, () => Array(SEATS_PER_TABLE).fill(null));
  private waiting: string[] = [];

  get capacity() { return TABLE_COUNT * SEATS_PER_TABLE; }
  get seatedCount() { return this.guests.size - this.waiting.length; }
  get waitingCount() { return this.waiting.length; }

  has(id: string) { return this.guests.has(id); }
  get(id: string) { return this.guests.get(id); }

  touch(id: string) { const g = this.guests.get(id); if (g) g.lastActive = Date.now(); }

  /** Thêm khách. Ưu tiên mâm yêu cầu, nếu không thì mâm còn chỗ ít người nhất... nhưng không trống (cho vui). */
  add(id: string, nick: string, look: number, preferTable?: number): Guest {
    const now = Date.now();
    const g: Guest = { id, nick, look, table: -1, seat: -1, lastActive: now, joinedAt: now, actions: 0 };
    this.guests.set(id, g);
    const spot = this.findSeat(preferTable);
    if (spot) this.sit(g, spot.table, spot.seat);
    else { this.waiting.push(id); this.reindexWaiting(); }
    return g;
  }

  /** Đổi mâm. Trả về true nếu đổi được. */
  moveTo(id: string, table: number): boolean {
    const g = this.guests.get(id);
    if (!g || table < 0 || table >= TABLE_COUNT || g.table === table) return false;
    const seat = this.seats[table].indexOf(null);
    if (seat === -1) return false;
    if (g.table >= 0) this.seats[g.table][g.seat] = null;
    else { this.waiting = this.waiting.filter((w) => w !== id); this.reindexWaiting(); }
    this.sit(g, table, seat);
    return true;
  }

  /** Xoá khách. Trả về khách đang chờ được đưa vào ghế vừa trống (nếu có). */
  remove(id: string): { removed?: Guest; promoted?: Guest } {
    const g = this.guests.get(id);
    if (!g) return {};
    this.guests.delete(id);
    let promoted: Guest | undefined;
    if (g.table >= 0) {
      this.seats[g.table][g.seat] = null;
      const nextId = this.waiting.shift();
      if (nextId) {
        promoted = this.guests.get(nextId)!;
        this.sit(promoted, g.table, g.seat);
        this.reindexWaiting();
      }
    } else {
      this.waiting = this.waiting.filter((w) => w !== id);
      this.reindexWaiting();
    }
    return { removed: g, promoted };
  }

  guestsAt(table: number): Guest[] {
    return this.seats[table].filter((s): s is string => !!s).map((s) => this.guests.get(s)!);
  }

  occupiedTables(): number[] {
    const out: number[] = [];
    for (let t = 0; t < TABLE_COUNT; t++) if (this.seats[t].some((s) => s)) out.push(t);
    return out;
  }

  afk(ms: number): string[] {
    const cut = Date.now() - ms;
    return [...this.guests.values()].filter((g) => g.lastActive < cut).map((g) => g.id);
  }

  /** Danh sách khách đang chờ có chỉ số mới (sau reindex) — để client cập nhật vị trí. */
  waitingGuests(): Guest[] { return this.waiting.map((id) => this.guests.get(id)!); }

  dto(): GuestDTO[] {
    return [...this.guests.values()].map(({ id, nick, look, table, seat }) => ({ id, nick, look, table, seat }));
  }

  private sit(g: Guest, table: number, seat: number) {
    this.seats[table][seat] = g.id;
    g.table = table; g.seat = seat;
  }

  private reindexWaiting() {
    this.waiting.forEach((id, i) => { const g = this.guests.get(id)!; g.table = -1; g.seat = i; });
  }

  private findSeat(prefer?: number): { table: number; seat: number } | null {
    if (prefer !== undefined && prefer >= 0 && prefer < TABLE_COUNT) {
      const s = this.seats[prefer].indexOf(null);
      if (s !== -1) return { table: prefer, seat: s };
    }
    // Lấp đầy dần: chọn mâm đã có người nhưng còn chỗ, ít chỗ trống nhất; nếu không có thì mâm trống.
    let best: { table: number; seat: number } | null = null;
    let bestScore = -1;
    for (let t = 0; t < TABLE_COUNT; t++) {
      const free = this.seats[t].filter((s) => !s).length;
      if (free === 0) continue;
      const used = SEATS_PER_TABLE - free;
      // điểm: mâm có 2-5 người được ưu tiên; thêm chút ngẫu nhiên để không luôn vào mâm 1
      const score = (used > 0 ? 10 + Math.min(used, 5) : 5) + Math.random() * 3;
      if (score > bestScore) {
        bestScore = score;
        // chọn ghế trống ngẫu nhiên trong mâm cho tự nhiên
        const freeSeats = this.seats[t].map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
        best = { table: t, seat: freeSeats[Math.floor(Math.random() * freeSeats.length)] };
      }
    }
    return best;
  }
}
