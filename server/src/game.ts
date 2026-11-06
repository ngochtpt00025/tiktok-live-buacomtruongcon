import { readFileSync } from 'node:fs';
import { TABLE_COUNT } from '../../shared/layout.js';
import type {
  ClientRole, EmoteKind, HeatDTO, HostTarget, LiveStateDTO, LogDTO, ServerMsg, SettingsDTO, StatsDTO, VoiceFx,
} from '../../shared/protocol.js';
import { Bond } from './bond.js';
import { ChucController, CHUC_VOICE } from './chuc.js';
import { Heat, HEAT_LABEL } from './heat.js';
import { NpcManager } from './npc.js';
import { EventDirector, type EventCtx, type SayOpts } from './events.js';
import { classify, type Intent, type IntentMatch } from './intents.js';
import { contentPath } from './paths.js';
import { Room, type Guest } from './room.js';
import { SpeechQueue, type Synthesize } from './speech.js';
import { SessionMetrics } from './metrics.js';
import { cleanChat, cleanNick, fill, hashLook, pick } from './text.js';

/** Sự kiện vào đã chuẩn hoá (từ TikTok hoặc giả lập). */
export type InEvent =
  | { kind: 'chat'; userId: string; nick: string; text: string }
  | { kind: 'like'; userId: string; nick: string; count: number }
  | { kind: 'gift'; userId: string; nick: string; giftName: string; count: number; coins: number }
  | { kind: 'social'; userId: string; nick: string; what: 'follow' | 'share' };

type Lines = Record<string, string[]>;

const INTENT_EMOTE: Partial<Record<Intent, EmoteKind>> = {
  EAT: 'eat', CHAO: 'chao', BEER: 'beer', PAYMENT: 'pay', GREET_HOST: 'wave', REQUEST_FOOD: 'eat', PHOTO: 'camera',
  PRAISE_FOOD: 'eat', CHEER: 'cheer', ASK_HOST: 'wave', TOAST: 'beer',
};
void HEAT_LABEL;
const INTENT_LINES: Partial<Record<Intent, string>> = {
  CHAO: 'chao', PAYMENT: 'payment', QUANG: 'quang', REQUEST_FOOD: 'request_food',
  GREET_HOST: 'greet_host', BEER: 'beer', OLD_VOICE: 'old_voice', PRAISE_FOOD: 'praise_food', ASK_HOST: 'ask_host',
};
/** Điểm tình nghĩa cho mâm khi khách tương tác (ngoài sự kiện). */
const INTENT_BOND: Partial<Record<Intent, number>> = {
  EAT: 0.5, CHAO: 1, BEER: 1, GREET_HOST: 0.5, REQUEST_FOOD: 0.5, PRAISE_FOOD: 0.5, CHEER: 0.5, TOAST: 1,
};

type HostState =
  | { s: 'stage'; since: number }
  | { s: 'walking'; target: HostTarget; token: number; deadline: number; onArrive?: () => void }
  | { s: 'visiting'; table: number; until: number }
  | { s: 'counter'; until: number }
  | { s: 'rest' };

interface Client { send: (m: ServerMsg) => void; role: ClientRole }

export class Game {
  readonly room = new Room();
  readonly bond: Bond;
  readonly director: EventDirector;
  private lines: Lines = JSON.parse(readFileSync(contentPath('lines.json'), 'utf8'));
  private lastLine = new Map<string, string>();
  private speech: SpeechQueue;
  private clients = new Set<Client>();

  private host: HostState = { s: 'stage', since: Date.now() };
  private hostPose: 'stand' | 'sit' = 'stand';
  readonly npc: NpcManager;
  readonly heat = new Heat();
  private heatDto: HeatDTO = { value: 0, level: 'vang' };
  readonly chuc: ChucController;
  /** Lần cuối chủ tiệc ghé từng mâm (cho chấm điểm hành động) */
  private lastVisit = new Map<number, number>();
  private hostToken = 0;
  private nextVisitAt = Date.now() + 15000;
  private recentJoins: Guest[] = [];
  private lastGreetAt = 0;
  private chatTimes: number[] = [];
  private cooldowns = new Map<string, number>();
  private lastHintAt = Date.now();
  private lastActivityAt = Date.now();

  private logBuf: LogDTO[] = [];
  private logPending: LogDTO[] = [];

  live: LiveStateDTO = { status: 'idle', uniqueId: '' };
  simCount = 0;

  /** Cài đặt giọng đổi — index.ts gắn vào để reset trạng thái TTS */
  onTtsChange: () => void = () => {};
  /** Thêm cờ "đã có khoá" khi gửi cài đặt */
  decorateSettings: (s: SettingsDTO) => SettingsDTO = (s) => s;

  /** Gửi comment không khớp rule sang tầng 2 (LLM) — index.ts gắn vào */
  aiOffer: (item: { guestId: string; nick: string; text: string; ts: number }) => void = () => {};

  constructor(
    public settings: SettingsDTO,
    private saveSettings: (s: SettingsDTO) => void,
    synthesize: Synthesize | undefined,
    readonly metrics: SessionMetrics,
  ) {
    this.speech = new SpeechQueue((m) => this.broadcast(m), settings.speechPerMinute, synthesize);
    this.speech.onDispatch = (ms) => this.metrics.speechLatency(ms);
    this.bond = new Bond((table, stars) => {
      this.broadcast({ t: 'table_fx', table, kind: 'celebrate' });
      this.broadcast({ t: 'banner', text: `⭐ Mâm ${table + 1} tình nghĩa đong đầy! (${stars} sao)`, ms: 4500 });
      this.say('bond_full', { table: table + 1, stars }, 2);
      this.log('event', `Mâm ${table + 1} đạt ${stars} sao tình nghĩa`);
    });
    const ctx: EventCtx = {
      room: this.room,
      broadcast: (m) => this.broadcast(m),
      say: (g, v, p, l, fx) => this.sayAs(g, v, p, { lookAt: l, fx }),
      speechIdle: () => !this.speech.busy,
      bond: (t, p) => this.bond.add(t, p),
      hostGoto: (t, cb) => this.hostGoto(t, cb),
      log: (msg) => this.log('event', msg),
      sayAs: (g, v, p, o) => this.sayAs(g, v, p, o),
      sayText: (text, p, o) => this.speech.push({ text, priority: p, tag: this.director?.taggingId ?? undefined, ...o }),
      npc: this.npc = new NpcManager((m) => this.broadcast(m)),
      heat: () => this.heat.level,
      hostPose: (pose) => { this.hostPose = pose; this.broadcast({ t: 'host_pose', pose }); },
      quangVoice: () => this.settings.npc.quangVoice,
    };
    this.director = new EventDirector(ctx, settings.directorEnabled, settings.eventGapSec);
    this.director.onEnd = (id, n, ms) => this.metrics.eventEnd(id, n, ms);
    this.director.onUse = () => this.heat.eventAction();
    this.director.onBeforeEnd = (id) => this.speech.dropTag(id);
    this.chuc = new ChucController(ctx);
    setInterval(() => {
      this.heatDto = this.heat.update(this.chatTimes.length, this.room.guests.size);
      // vắng: chủ tiệc nói nhiều hơn để giữ không khí; bùng nổ: bớt nói
      const adj = { vang: 2, am: 0, dong: 0, bungno: -1 }[this.heatDto.level];
      this.speech.perMinute = Math.max(2, this.settings.speechPerMinute + adj);
      this.metrics.heat(this.heatDto.value);
      this.broadcast({ t: 'heat', heat: this.heatDto });
    }, 2000);
    setInterval(() => this.metrics.tick(this.room.guests.size), 5000);
    setInterval(() => this.tick(), 250);
    setInterval(() => this.broadcast({ t: 'stats', stats: this.stats() }), 2000);
    setInterval(() => this.flushLog(), 500);
    setInterval(() => this.toControl({ t: 'director', enabled: this.director.enabled, nextInSec: this.director.nextInSec() }), 1000);
  }

  // ---------- kết nối client ----------
  attach(send: (m: ServerMsg) => void) {
    const c: Client = { send, role: 'overlay' };
    this.clients.add(c);
    send({
      t: 'snapshot', guests: this.room.dto(), host: this.hostTarget(), stats: this.stats(),
      settings: this.decorateSettings(this.settings), bond: this.bond.dto(), event: this.director.dto(),
      npcs: this.npc.dto(), heat: this.heatDto, hostPose: this.hostPose,
    });
    return {
      setRole: (role: ClientRole) => {
        c.role = role;
        if (role === 'control') { send({ t: 'log', entries: this.logBuf.slice(-150) }); this.onControlHello(send); }
      },
      detach: () => this.clients.delete(c),
    };
  }

  broadcast(m: ServerMsg) { for (const c of this.clients) c.send(m); }
  private toControl(m: ServerMsg) { for (const c of this.clients) if (c.role === 'control') c.send(m); }
  toControlMsg(m: ServerMsg) { this.toControl(m); }
  onControlHello: (send: (m: ServerMsg) => void) => void = () => {};

  /** Danh sách câu cố định để render sẵn giọng (câu có {nick} phải tổng hợp lúc chạy). */
  prerenderTexts(): { text: string; fx: VoiceFx; adj?: { rate: number; pitch: number } }[] {
    const out: { text: string; fx: VoiceFx; adj?: { rate: number; pitch: number } }[] = [];
    for (const [group, list] of Object.entries(this.lines)) {
      if (group.startsWith('_')) continue;
      const fx: VoiceFx = group.startsWith('old_') || group.startsWith('ev_old') ? 'old' : 'normal';
      const adj = group.startsWith('quang_drop') || group === 'quang_arrive' || group === 'quang_none' ? this.settings.npc.quangVoice
        : group.startsWith('chuc_') ? CHUC_VOICE : undefined;
      for (const tpl of list) {
        const keys = [...tpl.matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
        if (!keys.length) out.push({ text: tpl, fx, adj });
        else if (keys.every((k) => k === 'table')) for (let t = 1; t <= TABLE_COUNT; t++) out.push({ text: fill(tpl, { table: t }), fx, adj });
      }
    }
    return out;
  }

  hostArrived(token: number) {
    if (this.host.s === 'walking' && this.host.token === token) this.arrive();
  }

  // ---------- nhật ký (cho bảng điều khiển) ----------
  log(kind: LogDTO['kind'], msg: string) {
    const e = { ts: Date.now(), kind, msg };
    this.logBuf.push(e);
    if (this.logBuf.length > 300) this.logBuf.splice(0, 100);
    this.logPending.push(e);
  }
  private flushLog() {
    if (!this.logPending.length) return;
    this.toControl({ t: 'log', entries: this.logPending });
    this.logPending = [];
  }

  // ---------- cài đặt ----------
  patchSettings(patch: Partial<SettingsDTO>) {
    const s = { ...this.settings };
    if (typeof patch.hostName === 'string') s.hostName = patch.hostName.slice(0, 24) || s.hostName;
    if (typeof patch.venueName === 'string') s.venueName = patch.venueName.slice(0, 32) || s.venueName;
    if (typeof patch.speechPerMinute === 'number') s.speechPerMinute = clamp(patch.speechPerMinute, 1, 15);
    if (typeof patch.afkMinutes === 'number') s.afkMinutes = clamp(patch.afkMinutes, 1, 60);
    if (typeof patch.eventGapSec === 'number') s.eventGapSec = clamp(patch.eventGapSec, 30, 900);
    if (typeof patch.directorEnabled === 'boolean') s.directorEnabled = patch.directorEnabled;
    if (typeof patch.voiceVolume === 'number') s.voiceVolume = clamp(patch.voiceVolume, 0, 100);
    if (typeof patch.ambience === 'boolean') s.ambience = patch.ambience;
    if (typeof patch.ambienceVolume === 'number') s.ambienceVolume = clamp(patch.ambienceVolume, 0, 100);
    if (patch.tts && typeof patch.tts === 'object') {
      const t = { ...s.tts, ...patch.tts };
      const providers = ['edge', 'google', 'fpt', 'elevenlabs', 'browser', 'off'];
      if (!providers.includes(t.provider)) t.provider = s.tts.provider;
      t.voice = String(t.voice ?? '').trim().slice(0, 80);
      t.rate = clamp(Number(t.rate) || 0, -40, 40);
      t.pitch = clamp(Number(t.pitch) || 0, -30, 30);
      // đổi nhà cung cấp mà giọng còn của nhà cung cấp cũ → về giọng mặc định
      if (patch.tts.provider && patch.tts.provider !== s.tts.provider && patch.tts.voice === undefined) t.voice = '';
      s.tts = t;
      this.onTtsChange();
    }
    if (patch.disclaimer && typeof patch.disclaimer === 'object') {
      const d = { ...s.disclaimer, ...patch.disclaimer };
      d.show = !!d.show;
      d.text = String(d.text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) || s.disclaimer.text;
      s.disclaimer = d;
    }
    if (patch.ai && typeof patch.ai === 'object') {
      const a = { ...s.ai, ...patch.ai };
      if (!['anthropic', 'openai', 'mock'].includes(a.provider)) a.provider = s.ai.provider;
      a.enabled = !!a.enabled;
      a.model = String(a.model ?? '').trim().slice(0, 80);
      a.baseUrl = String(a.baseUrl ?? '').trim().slice(0, 200);
      a.maxCallsPerMinute = clamp(Number(a.maxCallsPerMinute) || 20, 1, 120);
      s.ai = a;
    }
    if (typeof patch.joinRequiresCommand === 'boolean') s.joinRequiresCommand = patch.joinRequiresCommand;
    if (typeof patch.tiktokUsername === 'string') s.tiktokUsername = patch.tiktokUsername.slice(0, 40);
    this.settings = s;
    this.speech.perMinute = s.speechPerMinute;
    if (patch.npc && typeof patch.npc === 'object') {
      const n = { ...s.npc, ...patch.npc };
      n.quangOnCall = !!n.quangOnCall;
      n.chucEnabled = !!n.chucEnabled;
      const qv = { ...s.npc.quangVoice, ...(patch.npc.quangVoice ?? {}) };
      n.quangVoice = { rate: clamp(Number(qv.rate) || 0, -30, 30), pitch: clamp(Number(qv.pitch) || 0, -30, 30) };
      s.npc = n;
      this.settings = s;
    }
    if (this.director.enabled !== s.directorEnabled || this.director.gapSec !== s.eventGapSec) {
      this.director.enabled = s.directorEnabled;
      this.director.gapSec = s.eventGapSec;
      this.director.schedule();
    }
    this.saveSettings(s);
    this.broadcastSettings();
  }

  broadcastSettings() {
    this.broadcast({ t: 'settings', settings: this.decorateSettings(this.settings) });
  }

  setLive(s: LiveStateDTO) {
    this.live = s;
    this.broadcast({ t: 'stats', stats: this.stats() });
  }

  /** Dọn sân: mọi khách ra về, điểm tình nghĩa về 0. */
  resetRoom() {
    this.director.stop();
    for (const id of [...this.room.guests.keys()]) {
      this.room.remove(id);
      this.broadcast({ t: 'leave', id });
      this.metrics.leave(id, 'reset', this.room.guests.size);
    }
    this.bond.reset();
    this.chuc.stop();
    this.npc.leave('quang');
    this.recentJoins = [];
    this.hostGoto({ kind: 'stage' });
    this.log('system', 'Đã dọn sân, bắt đầu bữa tiệc mới');
  }

  /** Cho chủ tiệc nói một câu tuỳ ý từ bảng điều khiển. */
  hostSay(text: string) {
    const t = text.trim().slice(0, 160);
    if (t) this.speech.push({ text: t, priority: 3 });
  }

  // ---------- sự kiện vào ----------
  handle(ev: InEvent) {
    this.lastActivityAt = Date.now();
    if (ev.kind === 'chat') return this.onChat(ev.userId, ev.nick, ev.text);
    const g = this.room.get(ev.userId);
    if (ev.kind === 'like') {
      this.metrics.like(ev.userId, ev.count);
      if (g && this.cool(`like:${ev.userId}`, 3000)) {
        this.room.touch(ev.userId);
        this.broadcast({ t: 'emote', id: ev.userId, kind: 'heart' });
        this.bond.add(g.table, 0.25);
      }
      return;
    }
    if (ev.kind === 'social') {
      if (ev.what === 'follow' && this.cool('follow', 4000)) {
        this.broadcast({ t: 'banner', text: `Cảm ơn ${cleanNick(ev.nick)} đã follow! ❤️`, ms: 3000 });
      }
      if (g) this.bond.add(g.table, 3);
      return;
    }
    if (ev.kind === 'gift') {
      this.metrics.gift(ev.userId, ev.coins);
      const guest = g ?? this.join(ev.userId, ev.nick);
      this.room.touch(ev.userId);
      this.broadcast({ t: 'emote', id: ev.userId, kind: 'gift' });
      const nick = cleanNick(ev.nick);
      this.log('gift', `${nick} tặng ${ev.giftName} x${ev.count} (${ev.coins} xu)`);
      this.broadcast({ t: 'banner', text: `Cảm ơn ${nick} đã gửi ${ev.giftName}${ev.count > 1 ? ' x' + ev.count : ''}!`, ms: 3500 });
      // quà cộng thêm tình nghĩa nhưng có trần, để comment miễn phí vẫn là nguồn chính
      this.bond.add(guest.table, Math.min(20, 2 + ev.coins));
      if (this.cool('gift', 10000)) this.say('gift', { nick }, 2, ev.userId);
    }
  }

  private onChat(userId: string, nickRaw: string, text: string) {
    this.chatTimes.push(Date.now());
    const nick = cleanNick(nickRaw);
    const m = classify(text);
    const joined = this.room.has(userId);
    this.log('chat', `${nick}: ${text.slice(0, 80)}${m ? `  → ${m.intent}` : ''}`);
    this.metrics.chat(userId, m ? 'rule' : this.settings.ai.enabled ? 'ai-pending' : 'none', m?.intent);
    if (joined) { const g = this.room.get(userId)!; g.nick = nick; this.room.touch(userId); }

    if (!m) {
      // Tầng 1 không bắt được → hiện bong bóng chat, và gửi tầng 2 (LLM) nếu bật
      if (joined) {
        this.room.get(userId)!.actions++;
        const clean = cleanChat(text);
        if (clean && this.cool(`chat:${userId}`, 2500)) this.broadcast({ t: 'chat', id: userId, text: clean });
      } else if (!this.settings.joinRequiresCommand) {
        this.join(userId, nick);
      }
      if (cleanChat(text)) this.aiOffer({ guestId: userId, nick, text, ts: Date.now() });
      return;
    }
    this.applyIntent(userId, nick, m);
  }

  /** Kết quả từ tầng 2 (LLM). Người chưa vào sân chỉ được xử lý JOIN / MOVE_TABLE. */
  applyAi(userId: string, nick: string, intent: Intent, table?: number) {
    const m: IntentMatch = { intent, table: intent === 'MOVE_TABLE' && table ? table - 1 : undefined };
    if (intent === 'MOVE_TABLE' && m.table === undefined) return;
    this.log('chat', `  ↳ AI: ${nick} → ${intent}${table ? ' ' + table : ''}`);
    this.metrics.aiResult(userId, intent);
    this.applyIntent(userId, nick, m, true);
  }

  private applyIntent(userId: string, nick: string, m: IntentMatch, fromAi = false) {
    if (!this.room.has(userId)) {
      if (m.intent === 'JOIN') return void this.join(userId, nick);
      if (m.intent === 'MOVE_TABLE') return void this.join(userId, nick, m.table);
      if (!this.settings.joinRequiresCommand && !fromAi) this.join(userId, nick);
      else return;
    }
    const g = this.room.get(userId)!;
    g.actions++;

    switch (m.intent) {
      case 'JOIN':
        this.broadcast({ t: 'emote', id: userId, kind: 'wave' });
        return;
      case 'MOVE_TABLE':
        if (m.table === undefined || m.table < 0 || m.table >= TABLE_COUNT) return;
        if (this.room.moveTo(userId, m.table)) {
          this.broadcast({ t: 'move', id: userId, table: g.table, seat: g.seat });
          this.syncWaiting();
          this.director.touch();
        } else if (this.cool(`full:${userId}`, 8000)) {
          this.broadcast({ t: 'chat', id: userId, text: `Mâm ${m.table + 1} hết chỗ rồi!` });
        }
        return;
      case 'LEAVE':
        this.leave(userId, true);
        return;
    }

    // Sự kiện đang chạy được quyền "ăn" intent trước, rồi tới chú Chực
    if (this.director.onIntent(g, m)) return;
    if (this.chuc.onIntent(g, m)) return;

    // "quang ơi" ngoài sự kiện → chú Quang ghé tận mâm (tối đa 1 lần / 3 phút)
    if (m.intent === 'QUANG' && this.settings.npc.quangOnCall && !this.director.current && g.table >= 0
        && !this.npc.isPresent('quang') && this.cool('quang_drop', 180000)) {
      const table = g.table;
      this.npc.spawn('quang', { kind: 'table', table }, () => {
        this.broadcast({ t: 'npc_emote', id: 'quang', kind: 'wave' });
        this.sayAs('quang_drop', { table: table + 1 }, 2, { speaker: 'quang', voice: this.settings.npc.quangVoice, lookAt: userId });
        this.bond.add(table, 2);
        setTimeout(() => this.npc.leave('quang'), 9000);
      });
      return;
    }

    // "giọng ông cụ" ngoài sự kiện → mở luôn sự kiện Giọng ông cụ (tối đa 5 phút/lần)
    if (m.intent === 'OLD_VOICE' && !this.director.current && this.cool('oldvoice_auto', 300000)) {
      this.director.start('oldvoice');
      return;
    }

    const emote = INTENT_EMOTE[m.intent];
    if (emote && this.cool(`emote:${userId}`, 1500)) {
      this.broadcast({ t: 'emote', id: userId, kind: emote });
      const pts = INTENT_BOND[m.intent];
      if (pts) this.bond.add(g.table, pts);
    }

    const group = INTENT_LINES[m.intent];
    if (!group) return;
    // đông / bùng nổ: chủ tiệc bớt trả lời từng người (để dành hơi cho câu chung, sự kiện, NPC)
    const replyChance = { vang: 1, am: 1, dong: 0.4, bungno: 0.15 }[this.heat.level];
    if (Math.random() > replyChance) return;
    if (!this.cool(`intent:${m.intent}`, m.intent === 'GREET_HOST' ? 12000 : 20000)) return;
    const vars = { nick: g.nick, table: g.table >= 0 ? g.table + 1 : '?' };

    if (m.intent === 'REQUEST_FOOD' && g.table >= 0 && this.hostFree()) {
      // Chủ tiệc đi tới tận mâm rồi mới nói
      this.hostGoto({ kind: 'table', table: g.table }, () => this.say(group, vars, 2, userId));
      return;
    }
    this.say(group, vars, 2, userId);
  }

  // ---------- vào / ra ----------
  private join(userId: string, nick: string, preferTable?: number) {
    const g = this.room.add(userId, cleanNick(nick), hashLook(userId), preferTable);
    this.broadcast({ t: 'join', g: { id: g.id, nick: g.nick, look: g.look, table: g.table, seat: g.seat } });
    this.metrics.join(userId, this.room.guests.size);
    this.heat.join();
    if (g.table >= 0) { this.recentJoins.push(g); this.bond.add(g.table, 1); }
    else if (this.cool('full', 15000)) this.say('full', { nick: g.nick }, 1, g.id);
    this.director.touch();
    return g;
  }

  private leave(userId: string, polite: boolean) {
    const { removed, promoted } = this.room.remove(userId);
    if (!removed) return;
    this.broadcast({ t: 'leave', id: userId });
    this.metrics.leave(userId, polite ? 'leave' : 'afk', this.room.guests.size);
    if (polite && this.cool('leave', 15000)) this.say('leave', { nick: removed.nick }, 0);
    if (promoted) {
      this.broadcast({ t: 'move', id: promoted.id, table: promoted.table, seat: promoted.seat });
      this.say('seat_free', { nick: promoted.nick, table: promoted.table + 1 }, 1, promoted.id);
    }
    this.syncWaiting();
    this.director.touch();
  }

  private syncWaiting() {
    for (const w of this.room.waitingGuests()) this.broadcast({ t: 'move', id: w.id, table: -1, seat: w.seat });
  }

  // ---------- chủ tiệc ----------
  private hostTarget(): HostTarget {
    if (this.host.s === 'walking') return this.host.target;
    if (this.host.s === 'visiting') return { kind: 'table', table: this.host.table };
    if (this.host.s === 'counter') return { kind: 'counter' };
    if (this.host.s === 'rest') return { kind: 'rest' };
    return { kind: 'stage' };
  }

  /** Chủ tiệc rảnh để tự đi thăm mâm (không bận sự kiện). */
  private hostFree() { return !this.director.current && this.host.s !== 'walking'; }

  hostGoto(target: HostTarget, onArrive?: () => void) {
    if (this.hostPose === 'sit' && target.kind !== 'rest') { this.hostPose = 'stand'; this.broadcast({ t: 'host_pose', pose: 'stand' }); }
    const token = ++this.hostToken;
    this.host = { s: 'walking', target, token, deadline: Date.now() + 15000, onArrive };
    this.broadcast({ t: 'host_goto', target, token });
  }

  private arrive() {
    if (this.host.s !== 'walking') return;
    const { target, onArrive } = this.host;
    if (target.kind === 'stage') {
      this.host = { s: 'stage', since: Date.now() };
      this.nextVisitAt = Date.now() + this.visitDelay();
      onArrive?.();
    } else if (target.kind === 'rest') {
      this.host = { s: 'rest' };
      onArrive?.();
    } else if (target.kind === 'counter') {
      this.host = { s: 'counter', until: Date.now() + 8000 };
      onArrive?.();
    } else {
      this.host = { s: 'visiting', table: target.table, until: Date.now() + 7000 };
      this.lastVisit.set(target.table, Date.now());
      if (onArrive) onArrive();
      else {
        const at = this.room.guestsAt(target.table);
        if (at.length) { const g = pick(at); this.say('visit', { nick: g.nick, table: target.table + 1 }, 1, g.id); }
        else this.say('visit_empty', { table: target.table + 1 }, 0);
      }
    }
  }

  private tick() {
    const now = Date.now();
    this.chatTimes = this.chatTimes.filter((t) => now - t < 10000);
    void this.speech.tick();
    this.director.tick();
    if (this.bond.dirty && this.cool('bond_send', 700)) { this.bond.dirty = false; this.broadcast({ t: 'bond', bond: this.bond.dto() }); }

    // AFK
    for (const id of this.room.afk(this.settings.afkMinutes * 60000)) this.leave(id, false);

    // Chào khách mới (gộp nhiều người)
    if (this.recentJoins.length && now - this.lastGreetAt > 6000 && this.speech.length < 2 && !this.director.current) {
      const list = this.recentJoins.filter((g) => this.room.has(g.id));
      this.recentJoins = [];
      this.lastGreetAt = now;
      if (list.length === 1) this.say('greet_one', { nick: list[0].nick, table: list[0].table + 1 }, 1, list[0].id, 10000);
      else if (list.length > 1) {
        const names = list.slice(0, 3).map((g) => g.nick).join(', ') + (list.length > 3 ? ` và ${list.length - 3} anh em nữa` : '');
        this.say('greet_many', { nicks: names }, 1, undefined, 10000);
      }
    }

    // Sân "bùng nổ" + comment dồn dập → sự kiện "Nói ít thôi, đau đầu lắm" (tối đa 5 phút/lần)
    if (this.heat.level === 'bungno' && this.chatTimes.length >= 25 && !this.director.current
        && now - this.director.lastEndAt > 30000 && this.cool('headache', 300000)) {
      this.chuc.stop();
      this.director.start('headache');
    }

    // Chú Chực (NPC xin ăn) giữa các sự kiện
    if (this.director.current && this.chuc.isActive) this.chuc.stop();
    this.chuc.tick();
    if (this.settings.npc.chucEnabled && !this.director.current && !this.chuc.isActive && now > this.chuc.nextAt) {
      if (this.room.seatedCount >= 4) this.chuc.start(); else this.chuc.scheduleNext(60000, 90000);
    }

    // Banner hướng dẫn
    if (now - this.lastHintAt > 60000 && !this.director.current) {
      this.lastHintAt = now;
      this.broadcast({ t: 'banner', text: 'Chat "nhập tiệc" để vào sân · "mâm 3" để đổi bàn', ms: 5000 });
    }

    // FSM chủ tiệc (tạm dừng khi có sự kiện — sự kiện tự điều khiển chủ tiệc)
    const h = this.host;
    if (h.s === 'walking') {
      // Không có màn hình nào báo "đã tới" (vd. chưa mở màn hình live) → tự coi như đã tới.
      // Kẹt thật do màn hình live tự phát hiện và báo về (theo thời gian game).
      if (now > h.deadline) this.arrive();
      return;
    }
    if (this.director.current) return;
    if (h.s === 'rest') this.hostGoto({ kind: 'stage' });
    else if (h.s === 'counter' && now > h.until && !this.speech.busy) this.hostGoto({ kind: 'stage' });
    else if (h.s === 'visiting' && now > h.until && !this.speech.busy) {
      // đi tiếp mâm khác hay về bục: vắng thì đi thăm nhiều hơn
      const chain = this.heat.level === 'vang' ? 0.6 : this.heat.level === 'am' ? 0.4 : 0.25;
      if (Math.random() < chain && this.chooseHostAction(h.table)) return;
      this.hostGoto({ kind: 'stage' });
    } else if (h.s === 'stage' && now > this.nextVisitAt && !this.speech.busy) {
      if (!this.chooseHostAction()) {
        this.say(now - this.lastActivityAt > 40000 ? 'quiet' : 'idle_stage', {}, 0);
      }
      this.nextVisitAt = now + this.visitDelay();
    }
  }

  /** Khoảng nghỉ trên bục trước khi chủ tiệc làm việc tiếp, theo độ náo nhiệt. */
  private visitDelay() {
    const r: Record<string, [number, number]> = { vang: [10000, 18000], am: [18000, 35000], dong: [25000, 45000], bungno: [30000, 50000] };
    const [a, b] = r[this.heat.level];
    return rand(a, b);
  }

  /**
   * Chủ tiệc "chấm điểm" các việc có thể làm rồi chọn việc điểm cao nhất (Utility AI, không gọi LLM):
   *  - ghé mâm: mâm đông, có người mới, lâu chưa ghé → điểm cao; vắng thì ưu tiên hơn
   *  - gọi người âm thầm: khách vào > 2 phút chưa nói gì → ghé tận mâm gọi tên (vắng / ấm)
   *  - nói chung cho cả sân: khi đông / bùng nổ, thay vì trả lời từng người
   * Trả về false nếu không có việc gì đáng làm.
   */
  private chooseHostAction(exceptTable = -1): boolean {
    const now = Date.now();
    const lv = this.heat.level;
    const visitMul = lv === 'vang' ? 1.5 : lv === 'am' ? 1 : lv === 'dong' ? 0.8 : 0.6;
    type Act = { score: number; run: () => void };
    const acts: Act[] = [];

    for (const t of this.room.occupiedTables()) {
      if (t === exceptTable) continue;
      const guests = this.room.guestsAt(t);
      const fresh = guests.filter((g) => now - g.joinedAt < 90000).length;
      const since = Math.min(3, (now - (this.lastVisit.get(t) ?? 0)) / 60000);
      acts.push({ score: (guests.length * 0.6 + fresh * 3 + since * 2) * visitMul, run: () => this.hostGoto({ kind: 'table', table: t }) });
    }

    if (lv !== 'bungno') {
      const quiet = [...this.room.guests.values()].find((g) => g.table >= 0 && g.actions === 0 && !g.quietCalled && now - g.joinedAt > 120000);
      if (quiet && quiet.table !== exceptTable) {
        acts.push({
          score: lv === 'dong' ? 2 : 7,
          run: () => {
            quiet.quietCalled = true;
            this.hostGoto({ kind: 'table', table: quiet.table }, () => this.say('quiet_call', { nick: quiet.nick, table: quiet.table + 1 }, 2, quiet.id));
          },
        });
      }
    }

    const crowdScore = { vang: 0, am: 1, dong: 6, bungno: 8 }[lv];
    if (crowdScore && now > (this.cooldowns.get('crowd_line') ?? 0)) {
      acts.push({ score: crowdScore, run: () => { this.cooldowns.set('crowd_line', now + 40000); this.say('crowd_line', {}, 1); } });
    }

    if (!acts.length) return false;
    for (const a of acts) a.score += Math.random() * 2;
    acts.sort((a, b) => b.score - a.score);
    acts[0].run();
    return true;
  }

  // ---------- tiện ích ----------
  say(group: string, vars: Record<string, string | number>, priority: number, lookAt?: string, ttl?: number, fx?: VoiceFx) {
    const options = this.lines[group];
    if (!options?.length) return;
    let tpl = pick(options);
    if (options.length > 1 && tpl === this.lastLine.get(group)) tpl = pick(options.filter((o) => o !== tpl));
    this.lastLine.set(group, tpl);
    this.speech.push({ text: fill(tpl, vars), priority, lookAt, ttl, fx });
  }

  /** Như say() nhưng chọn người nói / giọng / hiệu ứng. */
  sayAs(group: string, vars: Record<string, string | number>, priority: number, o: SayOpts = {}) {
    const options = this.lines[group];
    if (!options?.length) return;
    let tpl = pick(options);
    if (options.length > 1 && tpl === this.lastLine.get(group)) tpl = pick(options.filter((x) => x !== tpl));
    this.lastLine.set(group, tpl);
    this.speech.push({ text: fill(tpl, vars), priority, tag: this.director?.taggingId ?? undefined, ...o });
  }

  npcArrived(id: 'quang' | 'chuc', token: number) { this.npc.arrived(id, token); }

  /** Gọi NPC bằng tay từ bảng điều khiển. */
  callNpc(id: 'quang' | 'chuc') {
    if (id === 'chuc') {
      if (this.chuc.isActive) this.log('system', 'Chú Chực đang ở trong sân rồi');
      else if (!this.chuc.start()) this.log('system', 'Chú Chực: chưa có mâm nào có khách');
      return;
    }
    if (this.npc.isPresent('quang')) return;
    const tables = this.room.occupiedTables();
    const target = tables.length ? { kind: 'table' as const, table: pick(tables) } : { kind: 'stage' as const };
    this.npc.spawn('quang', target, () => {
      this.sayAs('quang_drop', { table: target.kind === 'table' ? target.table + 1 : '' }, 2, { speaker: 'quang', voice: this.settings.npc.quangVoice });
      setTimeout(() => this.npc.leave('quang'), 9000);
    });
  }

  /** true nếu khoá `key` đã hết cooldown (và đặt lại cooldown). */
  private cool(key: string, ms: number) {
    const now = Date.now();
    if (now < (this.cooldowns.get(key) ?? 0)) return false;
    this.cooldowns.set(key, now + ms);
    if (this.cooldowns.size > 8000) {
      for (const [k, v] of this.cooldowns) if (v < now) this.cooldowns.delete(k);
    }
    return true;
  }

  /** Id khách đang có trong sân (để tính chỉ số khi bắt đầu ghi giữa chừng). */
  guestIds() { return [...this.room.guests.keys()]; }

  stats(): StatsDTO {
    return {
      guests: this.room.guests.size,
      capacity: this.room.capacity,
      waiting: this.room.waitingCount,
      chatPer10s: this.chatTimes.length,
      sim: this.simCount,
      live: this.live,
    };
  }
}

function rand(a: number, b: number) { return a + Math.random() * (b - a); }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, Math.round(v))); }
