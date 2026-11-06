// Ghi chỉ số một phiên live để biết game có giữ chân người xem không.
// - Id người xem được băm (không lưu tên) — file log không chứa thông tin nhận dạng.
// - Log thô dạng JSONL (mỗi dòng 1 sự kiện) + bản tóm tắt JSON + báo cáo HTML.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MetricsDTO, SessionListItem } from '../../shared/protocol.js';
import { renderReport } from './report.js';

const anon = (id: string) => createHash('sha1').update('bua-com|' + id).digest('hex').slice(0, 10);

interface GuestTrack { joinedAt: number; lastActive: number; leftAt?: number; actions: number }
interface Minute { comments: number; joins: number; leaves: number; likes: number; gifts: number; guests: number; aiHits: number; heat: number }

export interface SessionSummary extends MetricsDTO {
  id: string;
  label: string;
  startedAt: number;
  endedAt: number;
  timeline: (Minute & { t: number })[];
  eventLog: { id: string; at: number; participants: number; durationMs: number }[];
  intents: Record<string, number>;
}

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return Math.round(s[Math.floor(s.length / 2)]);
};
const p90 = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]);
};

export class SessionMetrics {
  private dir: string;
  private active = false;
  private id = '';
  private label = '';
  private startedAt = 0;
  private buf: string[] = [];

  private viewers = new Set<string>();     // vào xem live (member)
  private chatters = new Set<string>();    // có comment
  private guests = new Map<string, GuestTrack>();
  private minutes: Minute[] = [];
  private intents: Record<string, number> = {};
  private comments = 0;
  private ruleHits = 0;
  private aiHits = 0;
  private unmatched = 0;
  private gifts = 0;
  private coins = 0;
  private likes = 0;
  private tiktokDelay: number[] = [];
  private speechWait: number[] = [];
  private ttsMs: number[] = [];
  private ttsFail = 0;
  private stuckGuest = 0;
  private stuckHost = 0;
  private fps: number[] = [];
  private peakGuests = 0;
  private curGuests = 0;
  private events: SessionSummary['eventLog'] = [];

  constructor(root: string) {
    this.dir = join(root, 'sessions');
    mkdirSync(this.dir, { recursive: true });
    setInterval(() => this.flush(), 2000).unref();
  }

  get isActive() { return this.active; }
  get sessionsDir() { return this.dir; }

  /** `present`: id khách đang ngồi sẵn trong sân lúc bắt đầu ghi — tính là đã vào (mốc giờ = lúc bắt đầu). */
  start(label: string, present: string[] = []) {
    if (this.active) return;
    Object.assign(this, new SessionMetrics.Blank());
    this.active = true;
    this.startedAt = Date.now();
    const d = new Date(this.startedAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    this.label = label || 'phiên thử';
    this.id = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
      + `-${this.label.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 30)}`;
    for (const id of present) this.guests.set(anon(id), { joinedAt: this.startedAt, lastActive: this.startedAt, actions: 0 });
    this.curGuests = this.peakGuests = present.length;
    this.write({ type: 'session_start', label: this.label, present: present.length });
  }

  /** Kết thúc phiên: ghi tóm tắt JSON + báo cáo HTML. Trả về đường dẫn báo cáo. */
  stop(): { summary: SessionSummary; reportFile: string } | null {
    if (!this.active) return null;
    this.write({ type: 'session_end' });
    this.flush();
    const summary = this.summary();
    this.active = false;
    writeFileSync(join(this.dir, `${this.id}.json`), JSON.stringify(summary, null, 2));
    const reportFile = `${this.id}.html`;
    writeFileSync(join(this.dir, reportFile), renderReport(summary));
    return { summary, reportFile };
  }

  list(): SessionListItem[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 20).map((f) => {
      try {
        const s = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as SessionSummary;
        return { id: s.id, label: s.label, startedAt: s.startedAt, durationMin: Math.round((s.endedAt - s.startedAt) / 60000),
          joinRate: s.joinRate, retained3: s.retained3, peakGuests: s.peakGuests, report: `/sessions/${s.id}.html` };
      } catch { return null; }
    }).filter((x): x is SessionListItem => !!x);
  }

  // ---------- ghi nhận ----------
  member(userId: string) {
    if (!this.active) return;
    this.viewers.add(anon(userId));
  }

  chat(userId: string, source: 'rule' | 'ai-pending' | 'none', intent?: string) {
    if (!this.active) return;
    const u = anon(userId);
    this.chatters.add(u);
    this.viewers.add(u);
    this.comments++;
    this.bucket().comments++;
    if (source === 'rule') { this.ruleHits++; this.countIntent(intent); }
    else this.unmatched++;
    this.touch(userId);
    this.write({ type: 'chat', u, src: source, intent });
  }

  aiResult(userId: string, intent: string) {
    if (!this.active) return;
    this.aiHits++;
    this.unmatched = Math.max(0, this.unmatched - 1);
    this.bucket().aiHits++;
    this.countIntent(intent);
    this.write({ type: 'ai', u: anon(userId), intent });
  }

  join(userId: string, guests: number) {
    if (!this.active) return;
    const u = anon(userId);
    const now = Date.now();
    if (!this.guests.has(u)) this.guests.set(u, { joinedAt: now, lastActive: now, actions: 0 });
    else { const g = this.guests.get(u)!; g.leftAt = undefined; g.lastActive = now; }
    this.bucket().joins++;
    this.setGuests(guests);
    this.write({ type: 'join', u });
  }

  leave(userId: string, reason: 'leave' | 'afk' | 'reset', guests: number) {
    if (!this.active) return;
    const g = this.guests.get(anon(userId));
    if (g) g.leftAt = Date.now();
    this.bucket().leaves++;
    this.setGuests(guests);
    this.write({ type: 'leave', u: anon(userId), reason });
  }

  touch(userId: string) {
    const g = this.guests.get(anon(userId));
    if (g) { g.lastActive = Date.now(); g.actions++; }
  }

  like(userId: string, n: number) {
    if (!this.active) return;
    this.likes += n; this.bucket().likes += n; this.viewers.add(anon(userId)); this.touch(userId);
  }

  gift(userId: string, coins: number) {
    if (!this.active) return;
    this.gifts++; this.coins += coins; this.bucket().gifts++; this.viewers.add(anon(userId)); this.touch(userId);
    this.write({ type: 'gift', u: anon(userId), coins });
  }

  tiktokLatency(ms: number) { if (this.active && ms >= 0 && ms < 120000) this.push(this.tiktokDelay, ms); }
  speechLatency(ms: number) { if (this.active) this.push(this.speechWait, ms); }
  tts(ms: number, ok: boolean) { if (!this.active) return; if (ok) this.push(this.ttsMs, ms); else this.ttsFail++; }
  stuck(who: 'guest' | 'host') { if (!this.active) return; if (who === 'host') this.stuckHost++; else this.stuckGuest++; this.write({ type: 'stuck', who }); }
  private heats: number[] = [];
  heat(v: number) {
    if (!this.active) return;
    this.push(this.heats, v);
    const b = this.bucket();
    b.heat = Math.max(b.heat, Math.round(v));
  }

  overlayFps(f: number) { if (this.active && f > 0 && f < 500) this.push(this.fps, f); }

  eventEnd(id: string, participants: number, durationMs: number) {
    if (!this.active) return;
    this.events.push({ id, at: Date.now() - this.startedAt, participants, durationMs });
    this.write({ type: 'event', id, participants, durationMs });
  }

  // ---------- tổng hợp ----------
  snapshot(): MetricsDTO {
    const now = Date.now();
    const joined = this.guests.size;
    // chỉ xét khách đã vào đủ lâu để có thể đạt mốc
    const elig3 = [...this.guests.values()].filter((g) => now - g.joinedAt >= 180000);
    const elig10 = [...this.guests.values()].filter((g) => now - g.joinedAt >= 600000);
    const stay = (g: GuestTrack) => g.lastActive - g.joinedAt;
    const durMin = Math.max(1 / 60, (now - this.startedAt) / 60000);
    const last5 = this.minutes.slice(-5);
    return {
      active: this.active,
      label: this.label,
      startedAt: this.startedAt,
      minutes: Math.round((now - this.startedAt) / 60000),
      viewers: this.viewers.size,
      chatters: this.chatters.size,
      joined,
      joinRate: pct(joined, this.chatters.size),
      joinRateOfViewers: pct(joined, this.viewers.size),
      // -1 = chưa đủ dữ liệu (chưa ai vào đủ 3 / 10 phút)
      retained3: elig3.length ? pct(elig3.filter((g) => stay(g) >= 180000).length, elig3.length) : -1,
      retained10: elig10.length ? pct(elig10.filter((g) => stay(g) >= 600000).length, elig10.length) : -1,
      avgStayMin: joined ? Math.round(([...this.guests.values()].reduce((s, g) => s + stay(g), 0) / joined / 60000) * 10) / 10 : 0,
      activeGuests: this.curGuests,
      peakGuests: this.peakGuests,
      commentsPerMin: Math.round(this.comments / durMin),
      commentsPerMinNow: last5.length ? Math.round(last5.reduce((s, m) => s + m.comments, 0) / last5.length) : 0,
      understood: pct(this.ruleHits + this.aiHits, this.comments),
      aiShare: pct(this.aiHits, this.ruleHits + this.aiHits),
      tiktokDelayMs: median(this.tiktokDelay),
      tiktokDelayP90: p90(this.tiktokDelay),
      speechWaitMs: median(this.speechWait),
      speechWaitP90: p90(this.speechWait),
      ttsMs: median(this.ttsMs),
      ttsFail: this.ttsFail,
      stuckGuest: this.stuckGuest,
      stuckHost: this.stuckHost,
      fpsAvg: this.fps.length ? Math.round(this.fps.reduce((a, b) => a + b, 0) / this.fps.length) : 0,
      fpsMin: this.fps.length ? Math.round(Math.min(...this.fps)) : 0,
      gifts: this.gifts,
      coins: this.coins,
      likes: this.likes,
      events: this.events.length,
      eventParticipantsAvg: this.events.length ? Math.round(this.events.reduce((s, e) => s + e.participants, 0) / this.events.length) : 0,
      spark: this.minutes.slice(-30).map((m) => m.comments),
      sparkGuests: this.minutes.slice(-30).map((m) => m.guests),
      heatAvg: this.heats.length ? Math.round(this.heats.reduce((a, b) => a + b, 0) / this.heats.length) : 0,
      heatPeak: this.heats.length ? Math.round(Math.max(...this.heats)) : 0,
    };
  }

  summary(): SessionSummary {
    return {
      ...this.snapshot(),
      id: this.id,
      label: this.label,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      timeline: this.minutes.map((m, i) => ({ ...m, t: i })),
      eventLog: this.events,
      intents: this.intents,
    };
  }

  // ---------- nội bộ ----------
  private bucket(): Minute {
    const idx = Math.floor((Date.now() - this.startedAt) / 60000);
    while (this.minutes.length <= idx) {
      this.minutes.push({ comments: 0, joins: 0, leaves: 0, likes: 0, gifts: 0, guests: this.curGuests, aiHits: 0, heat: 0 });
    }
    return this.minutes[idx];
  }

  private setGuests(n: number) {
    this.curGuests = n;
    this.peakGuests = Math.max(this.peakGuests, n);
    const b = this.bucket();
    b.guests = Math.max(b.guests, n);
  }

  /** Gọi định kỳ để mốc phút vẫn có số khách khi không ai làm gì. */
  tick(guests: number) { if (this.active) this.setGuests(guests); }

  private countIntent(intent?: string) { if (intent) this.intents[intent] = (this.intents[intent] ?? 0) + 1; }

  private push(arr: number[], v: number) { arr.push(v); if (arr.length > 5000) arr.splice(0, 1000); }

  private write(o: Record<string, unknown>) {
    if (!this.active) return;
    this.buf.push(JSON.stringify({ t: Date.now() - this.startedAt, ...o }));
  }

  private flush() {
    if (!this.buf.length || !this.id) return;
    try { appendFileSync(join(this.dir, `${this.id}.jsonl`), this.buf.join('\n') + '\n'); } catch { /* bỏ qua */ }
    this.buf = [];
  }

  /** Trạng thái rỗng để reset nhanh khi bắt đầu phiên mới. */
  private static Blank = class {
    viewers = new Set<string>(); chatters = new Set<string>(); guests = new Map<string, GuestTrack>(); minutes: Minute[] = [];
    intents: Record<string, number> = {}; comments = 0; ruleHits = 0; aiHits = 0; unmatched = 0; gifts = 0; coins = 0; likes = 0;
    tiktokDelay: number[] = []; speechWait: number[] = []; ttsMs: number[] = []; ttsFail = 0; stuckGuest = 0; stuckHost = 0;
    fps: number[] = []; heats: number[] = []; peakGuests = 0; events: SessionSummary['eventLog'] = []; buf: string[] = [];
  };
}

function pct(a: number, b: number) { return b ? Math.round((a / b) * 100) : 0; }
