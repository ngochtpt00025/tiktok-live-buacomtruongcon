import Phaser from 'phaser';
import { GATE, HOST_STAGE_SPOT, STAGE_NODE, W, GATE_NODE, COUNTER_NODE } from '../../../shared/layout';
import type { GuestDTO, HeatDTO, NpcId, NpcTarget, ServerMsg, SettingsDTO, Speaker, StatsDTO, VoiceFx } from '../../../shared/protocol';
import { Socket } from '../net/socket';
import { ATLAS_KEY, Person } from '../objects/Person';
import { CHUC_LOOK, HOST_LOOK, HOST_OLD_LOOK, QUANG_LOOK, decodeLook } from '../objects/look';
import { TableUI } from '../objects/TableUI';
import { EventPanel } from '../objects/EventPanel';
import { counterDest, gateDest, guestDest, hostDest, npcDest, route, stageGuestDest } from '../path';
import { drawVenue } from './drawVenue';
import { PartyAudio } from '../audio';
import { GaProp, photoMoment, tableFx } from '../fx';

const FONT = 'system-ui, "Segoe UI", Arial, sans-serif';
const MAX_GUEST_BUBBLES = 6;
const HEAT_TEXT: Record<HeatDTO['level'], string> = { vang: 'Vắng', am: 'Ấm', dong: 'Đông', bungno: 'Bùng nổ' };
const HEAT_COLOR: Record<HeatDTO['level'], number> = { vang: 0x5dade2, am: 0xf5c26b, dong: 0xff8c42, bungno: 0xff3b30 };
const params = new URLSearchParams(location.search);
/** Overlay nhúng trong bảng điều khiển: không phát tiếng. */
export const IS_PREVIEW = params.has('preview');

export class PartyScene extends Phaser.Scene {
  private socket!: Socket;
  private guests = new Map<string, Person>();
  private host!: Person;
  private hudCount!: Phaser.GameObjects.Text;
  private hudDot!: Phaser.GameObjects.Arc;
  private banner!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerTimer?: Phaser.Time.TimerEvent;
  private guestBubbles: Person[] = [];
  private venueSign!: Phaser.GameObjects.Text;
  private bottomBar!: Phaser.GameObjects.Graphics;
  private disclaimer!: Phaser.GameObjects.Text;
  private tables!: TableUI;
  private eventPanel!: EventPanel;
  readonly audio = new PartyAudio();
  private settings?: SettingsDTO;
  private npcs = new Map<NpcId, Person>();
  private ga!: GaProp;
  private heat: HeatDTO = { value: 0, level: 'vang' };
  private heatBar!: Phaser.GameObjects.Graphics;
  private heatText!: Phaser.GameObjects.Text;
  /** Ai đang nói (để mấp máy đúng miệng) */
  private speaking: Person | null = null;
  /** Nhân vật đang đi ra cổng (đã rời danh sách nhưng vẫn phải cập nhật cho tới khi biến mất) */
  private leaving = new Set<Person>();

  constructor() { super('party'); }

  preload() {
    // Đồ hoạ AI (tuỳ chọn). Không có file thì dùng hình vẽ tay.
    this.load.image('bg-ai', 'assets/bg.png');
    this.load.atlas(ATLAS_KEY, 'assets/people.png', 'assets/people.json');
    this.load.on('loaderror', () => { /* bỏ qua: chưa có asset */ });
  }

  create() {
    this.venueSign = drawVenue(this, '66B Ngõ Tình Nghĩa');
    this.tables = new TableUI(this);
    this.eventPanel = new EventPanel(this);
    this.buildHud();
    this.host = new Person(this, HOST_STAGE_SPOT.x, HOST_STAGE_SPOT.y, STAGE_NODE, HOST_LOOK, 'Anh Trường', { host: true });
    this.host.onStuck = () => this.reportStuck('host');
    this.ga = new GaProp(this);

    if (params.has('atlas-test')) return this.atlasTest();

    this.socket = new Socket(IS_PREVIEW ? 'preview' : 'overlay');
    (window as any).__socket = this.socket;
    this.socket.onStatus((up) => this.hudDot.setFillStyle(up ? 0x2ecc71 : 0xe74c3c));
    this.socket.onMessage((m) => this.onMsg(m));

    // Báo fps màn hình live mỗi 10 giây (cho chỉ số phiên). Bản xem trước không báo.
    // Dùng đồng hồ thật: hẹn giờ của Phaser chậm lại khi fps thấp — đúng lúc cần đo nhất.
    if (!IS_PREVIEW) window.setInterval(() => this.socket.send({ t: 'perf', fps: Math.round(this.game.loop.actualFps) }), 10000);
  }

  private reportStuck(who: 'guest' | 'host') {
    if (!IS_PREVIEW) this.socket.send({ t: 'stuck', who });
  }

  update(_t: number, dtMs: number) {
    const dt = Math.min(dtMs, 100) / 1000;
    this.host.update(dt);
    const lvl = this.audio.level();
    this.host.setMouth(this.speaking === this.host ? lvl : 0);
    for (const n of this.npcs.values()) { n.update(dt); n.setMouth(this.speaking === n ? lvl : 0); }
    for (const p of this.guests.values()) p.update(dt);
    for (const p of this.leaving) p.update(dt);
    this.eventPanel.update();
  }

  // ---------- xử lý tin nhắn từ server ----------
  private onMsg(m: ServerMsg) {
    switch (m.t) {
      case 'snapshot': return this.applySnapshot(m);
      case 'join': return this.spawnGuest(m.g, true);
      case 'move': return this.moveGuest(m.id, m.table, m.seat);
      case 'guest_goto': return m.spot === 'stage' ? this.guestToStage(m.id) : this.guestToCounter(m.id, m.index);
      case 'leave': return this.removeGuest(m.id);
      case 'emote': this.guests.get(m.id)?.emote(m.kind); return;
      case 'chat': return this.guestChat(m.id, m.text);
      case 'host_goto': return this.hostGoto(m.target, m.token);
      case 'host_emote': this.host.emote(m.kind); return;
      case 'say': return this.hostSay(m.text, m.ms, m.audioUrl, m.lookAt, m.fx ?? 'normal', m.speaker ?? 'host');
      case 'event_note': return this.eventPanel.setNote(m.text);
      case 'host_costume': this.host.setLook(m.costume === 'old' ? HOST_OLD_LOOK : HOST_LOOK); this.host.emote('star'); return;
      case 'banner': return this.showBanner(m.text, m.ms);
      case 'stats': return this.updateStats(m.stats);
      case 'settings': return this.applySettings(m.settings);
      case 'bond': return this.tables.setBond(m.bond);
      case 'table_fx': return tableFx(this, m.table, m.kind);
      case 'event': return this.eventPanel.set(m.event);
      case 'event_progress': return this.tables.setProgress(m.tables);
      case 'photo': return photoMoment(this, m.names, m.caption, m.ms);
      case 'host_pose': this.host.setPose(m.pose); return;
      case 'npc': return this.npcAction(m.id, m.action, m.target, m.token, m.name);
      case 'npc_emote': this.npcs.get(m.id)?.emote(m.kind); return;
      case 'heat': return this.setHeat(m.heat);
      case 'prop': return m.show ? this.ga.show(m.amount) : this.ga.hide();
      case 'ga_piece': return this.ga.piece(m.table, m.left);
    }
  }

  // ---------- NPC (chú Quang, chú Chực) ----------
  private npcAction(id: NpcId, action: 'spawn' | 'goto' | 'leave', target: NpcTarget, token: number, name: string) {
    let p = this.npcs.get(id);
    if (action === 'leave') {
      if (!p) return;
      this.npcs.delete(id);
      this.walkOut(p);
      return;
    }
    if (!p) {
      p = new Person(this, GATE.x + 80, 1960, GATE_NODE, id === 'quang' ? QUANG_LOOK : CHUC_LOOK, name, { npc: true });
      p.onStuck = () => this.reportStuck('guest');
      this.npcs.set(id, p);
    }
    const d = npcDest(target);
    const person = p;
    person.walk(route(person.anchor, d), () => {
      person.anchor = d.anchor;
      if (target.kind === 'stage') person.face(W / 2 + 1);
      else if (target.kind === 'table') person.face(person.x - 1);
      this.socket.send({ t: 'npc_arrived', id, token });
    });
    person.anchor = d.anchor;
  }

  /** Bản đồ thử sprite: ?atlas-test=1 — hiện nhiều tổ hợp ngoại hình + nhân vật riêng để soát ảnh. */
  private atlasTest() {
    const specials = [HOST_LOOK, HOST_OLD_LOOK, QUANG_LOOK, CHUC_LOOK];
    let i = 0;
    for (let row = 0; row < 7; row++) for (let col = 0; col < 8; col++) {
      const look = i < specials.length ? specials[i] : decodeLook(i * 2654435761);
      new Person(this, 90 + col * 128, 330 + row * 210, 0, look, i < specials.length ? ['Chủ tiệc', 'Ông cụ', 'Quang', 'Chực'][i] : `#${i}`);
      i++;
    }
    this.add.text(W / 2, 175, this.textures.exists(ATLAS_KEY) ? 'Đang dùng sprite AI (people.png)' : 'Chưa có people.png → hình khối', {
      fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(9000);
  }

  // ---------- Độ náo nhiệt ----------
  private setHeat(h: HeatDTO) {
    this.heat = h;
    const g = this.heatBar;
    const x = W - 210, y = 92, w = 160;
    g.clear();
    g.fillStyle(0x000000, 0.5); g.fillRoundedRect(x, y, w, 14, 7);
    g.fillStyle(HEAT_COLOR[h.level], 1); g.fillRoundedRect(x, y, Math.max(8, (w * h.value) / 100), 14, 7);
    this.heatText.setText(`🔥 ${HEAT_TEXT[h.level]}`);
  }

  private applySnapshot(m: Extract<ServerMsg, { t: 'snapshot' }>) {
    this.applySettings(m.settings);
    for (const p of this.guests.values()) p.destroy();
    this.guests.clear();
    for (const p of this.leaving) p.destroy();
    this.leaving.clear();
    for (const g of m.guests) this.spawnGuest(g, false);
    const d = hostDest(m.host);
    this.host.setPosition(d.pos.x, d.pos.y); this.host.anchor = d.anchor; this.host.setDepth(d.pos.y);
    this.updateStats(m.stats);
    this.tables.setBond(m.bond);
    this.eventPanel.set(m.event);
    this.host.setPose(m.hostPose);
    this.setHeat(m.heat);
    for (const p of this.npcs.values()) p.destroy();
    this.npcs.clear();
    for (const n of m.npcs) {
      const d = npcDest(n.target);
      const p = new Person(this, d.pos.x, d.pos.y, d.anchor, n.id === 'quang' ? QUANG_LOOK : CHUC_LOOK, n.name, { npc: true });
      this.npcs.set(n.id, p);
    }
  }

  private applySettings(s: SettingsDTO) {
    this.venueSign.setText(s.venueName);
    this.host.setLabel(s.hostName);
    this.settings = s;
    this.disclaimer.setText(s.disclaimer.text);
    if (this.disclaimer.width > W - 90) this.disclaimer.setScale((W - 90) / this.disclaimer.width); else this.disclaimer.setScale(1);
    this.drawBottomBar(s.disclaimer.show);
    this.audio.setVolumes(s.voiceVolume / 100, s.ambience, s.ambienceVolume / 100);
  }

  private spawnGuest(g: GuestDTO, walkIn: boolean) {
    const existing = this.guests.get(g.id);
    if (existing) { existing.highlight(); return; }
    const look = decodeLook(g.look);
    const dest = guestDest(g.table, g.seat);
    if (!walkIn) {
      const p = new Person(this, dest.pos.x, dest.pos.y, dest.anchor, look, g.nick);
      p.seated = g.table >= 0;
      p.onStuck = () => this.reportStuck('guest');
      this.guests.set(g.id, p);
      return;
    }
    const p = new Person(this, GATE.x + Phaser.Math.Between(-60, 60), 1960, GATE_NODE, look, g.nick);
    p.onStuck = () => this.reportStuck('guest');
    this.guests.set(g.id, p);
    p.highlight(3000);
    p.walk(route(GATE_NODE, dest), () => { p.anchor = dest.anchor; p.seated = g.table >= 0; });
  }

  private moveGuest(id: string, table: number, seat: number) {
    const p = this.guests.get(id);
    if (!p) return;
    const dest = guestDest(table, seat);
    p.walk(route(p.anchor, dest), () => { p.anchor = dest.anchor; p.seated = table >= 0; });
    p.anchor = dest.anchor; // nếu bị gọi lại giữa đường, tính tiếp từ đích mới
  }

  private guestToCounter(id: string, index: number) {
    const p = this.guests.get(id);
    if (!p) return;
    const dest = counterDest(index);
    p.highlight(2500);
    p.walk(route(p.anchor, dest), () => p.face(W));
    p.anchor = COUNTER_NODE;
  }

  private removeGuest(id: string) {
    const p = this.guests.get(id);
    if (!p) return;
    this.guests.delete(id);
    this.walkOut(p);
  }

  /** Chào rồi đi ra cổng, mờ dần và biến mất. */
  private walkOut(p: Person) {
    if (this.speaking === p) this.speaking = null;
    this.leaving.add(p);
    p.emote('wave');
    p.walk(route(p.anchor, gateDest), () => {
      this.tweens.add({ targets: p, alpha: 0, duration: 300, onComplete: () => { this.leaving.delete(p); p.destroy(); } });
    });
  }

  private guestChat(id: string, text: string) {
    const p = this.guests.get(id);
    if (!p) return;
    p.say(text, 3200);
    this.guestBubbles = this.guestBubbles.filter((b) => b !== p && b.active);
    this.guestBubbles.push(p);
    // đông thì bớt bong bóng chat để sân đỡ rối
    const max = this.heat.level === 'dong' || this.heat.level === 'bungno' ? 3 : MAX_GUEST_BUBBLES;
    while (this.guestBubbles.length > max) this.guestBubbles.shift()!.bubble.hide();
  }

  private hostGoto(target: Extract<ServerMsg, { t: 'host_goto' }>['target'], token: number) {
    const d = hostDest(target);
    this.host.walk(route(this.host.anchor, d), () => {
      this.host.anchor = d.anchor;
      if (target.kind === 'stage') this.host.face(W / 2 + 1);
      if (target.kind === 'counter') this.host.face(W);
      this.socket.send({ t: 'host_arrived', token });
    });
    this.host.anchor = d.anchor;
  }

  private guestToStage(id: string) {
    const p = this.guests.get(id);
    if (!p) return;
    p.highlight(5000);
    p.walk(route(p.anchor, stageGuestDest), () => { p.face(0); p.emote('star'); });
    p.anchor = stageGuestDest.anchor;
  }

  private hostSay(text: string, ms: number, audioUrl: string | undefined, lookAt: string | undefined, fx: VoiceFx, speaker: Speaker) {
    const who = speaker === 'host' ? this.host
      : typeof speaker === 'object' ? (this.guests.get(speaker.guest) ?? this.host)
      : (this.npcs.get(speaker) ?? this.host);
    this.speaking = who;
    who.say(text, ms + 600);
    if (lookAt) {
      const g = this.guests.get(lookAt);
      if (g) { who.face(g.x); g.highlight(Math.min(ms, 4000)); }
    }
    // Xem trước trong bảng điều khiển: không phát tiếng, chỉ mấp máy miệng
    if (IS_PREVIEW) { this.audio.talkFor(ms); return; }
    if (audioUrl) {
      void this.audio.playVoice(audioUrl, fx).then((played) => { if (!played) this.audio.talkFor(ms); });
    } else if (this.settings?.tts.provider === 'browser' || params.get('voice') === '1') {
      this.audio.speakBrowser(text, fx);
    } else {
      this.audio.talkFor(ms);
    }
  }

  // ---------- HUD ----------
  private buildHud() {
    const g = this.add.graphics().setDepth(7000);
    g.fillStyle(0x2b120a, 0.92); g.fillRoundedRect(20, 20, W - 40, 112, 22);
    g.lineStyle(3, 0xf5c26b, 1); g.strokeRoundedRect(20, 20, W - 40, 112, 22);
    this.add.text(52, 40, '🍚 BỮA CƠM TÌNH NGHĨA', {
      fontFamily: FONT, fontSize: '36px', fontStyle: '900', color: '#ffd76a',
    }).setDepth(7001);
    this.hudCount = this.add.text(52, 88, 'Đang kết nối…', {
      fontFamily: FONT, fontSize: '24px', color: '#fbe9d0',
    }).setDepth(7001);
    this.hudDot = this.add.circle(W - 56, 52, 10, 0xe74c3c).setDepth(7001);
    // đồng hồ "Độ náo nhiệt"
    this.heatBar = this.add.graphics().setDepth(7001);
    this.heatText = this.add.text(W - 78, 52, '🔥 Vắng', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#fbe9d0' })
      .setOrigin(1, 0.5).setDepth(7001);

    // Thanh hướng dẫn dưới cùng
    // (dòng 2 là nhãn parody/AI — luôn hiện khi bật, không bị gì che)
    this.bottomBar = this.add.graphics().setDepth(7000);
    this.add.text(W / 2, 1866, 'Chat "nhập tiệc" để vào sân  ·  "mâm 1–9" để đổi bàn  ·  "ra về"', {
      fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffe9b8',
    }).setOrigin(0.5).setDepth(7001);
    this.disclaimer = this.add.text(W / 2, 1898, '', {
      fontFamily: FONT, fontSize: '18px', color: '#e8cfb4',
    }).setOrigin(0.5).setDepth(7001);
    this.drawBottomBar(true);

    // Banner thông báo
    this.banner = this.add.container(W / 2, 168).setDepth(7100).setVisible(false);
    const bg = this.add.graphics();
    this.bannerText = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#2b1408', align: 'center',
      wordWrap: { width: 900 },
    }).setOrigin(0.5);
    this.banner.add([bg, this.bannerText]);
    this.banner.setData('bg', bg);
  }

  private drawBottomBar(withDisclaimer: boolean) {
    const b = this.bottomBar;
    b.clear();
    b.fillStyle(0x2b120a, 0.92);
    if (withDisclaimer) b.fillRoundedRect(30, 1840, W - 60, 76, 20);
    else b.fillRoundedRect(40, 1842, W - 80, 48, 24);
    this.disclaimer.setVisible(withDisclaimer);
  }

  private showBanner(text: string, ms: number) {
    this.bannerText.setText(text);
    const bg = this.banner.getData('bg') as Phaser.GameObjects.Graphics;
    const w = this.bannerText.width + 60, h = this.bannerText.height + 24;
    bg.clear(); bg.fillStyle(0xffd76a, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    bg.lineStyle(3, 0x8e1b12, 1); bg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.banner.setVisible(true).setAlpha(0).setY(150);
    this.tweens.add({ targets: this.banner, alpha: 1, y: 168, duration: 250, ease: 'Back.Out' });
    this.bannerTimer?.remove();
    this.bannerTimer = this.time.delayedCall(ms, () =>
      this.tweens.add({ targets: this.banner, alpha: 0, duration: 300, onComplete: () => this.banner.setVisible(false) }));
  }

  private updateStats(s: StatsDTO) {
    const src = s.live.status === 'connected' ? `LIVE @${s.live.uniqueId}` : s.sim > 0 ? 'Giả lập' : 'Chưa kết nối live';
    this.hudCount.setText(`Khách dự tiệc: ${s.guests - s.waiting}/${s.capacity}${s.waiting ? `  ·  Chờ: ${s.waiting}` : ''}  ·  ${src}`);
  }
}
