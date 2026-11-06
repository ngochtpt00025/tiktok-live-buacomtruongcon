import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize as normPath } from 'node:path';
import { WebSocketServer } from 'ws';
import type { ClientMsg, EventId, SecretName, SettingsDTO, VoiceFx } from '../../shared/protocol.js';
import { AiClassifier } from './ai/classifier.js';
import { Game } from './game.js';
import { SessionMetrics } from './metrics.js';
import { TtsService } from './tts/service.js';
import { defaultTts, type Secrets } from './tts/providers.js';
import { CLIENT_DIST, ROOT } from './paths.js';
import { Simulator } from './sources/simulator.js';
import { createTikTokAdapter, isValidUsername, parseUsername } from './sources/tiktok.js';
import { createEventFilter } from './sources/tiktokMapping.js';

// ---------- cấu hình ----------
const DEFAULTS: SettingsDTO & { port: number } = {
  port: 8787,
  tiktokUsername: '',
  hostName: 'Anh Trường',
  venueName: '66B Ngõ Tình Nghĩa',
  speechPerMinute: 6,
  afkMinutes: 6,
  directorEnabled: true,
  eventGapSec: 120,
  joinRequiresCommand: true,
  tts: defaultTts(),
  voiceVolume: 90,
  ambience: true,
  ambienceVolume: 30,
  ai: { enabled: false, provider: 'anthropic', model: 'claude-haiku-5-5', baseUrl: '', maxCallsPerMinute: 20 },
  disclaimer: { show: true, text: '🎭 Parody giải trí · Nhân vật hư cấu, giọng nói do AI tạo · Không phải người thật' },
  npc: { quangOnCall: true, chucEnabled: true, quangVoice: { rate: 10, pitch: 12 } },
};
const cfgFile = join(ROOT, 'config.json');
const fileCfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
delete fileCfg.overlayVoice; // cài đặt cũ (0.2) — nay chọn "Trình duyệt" trong mục Giọng
const cfg = {
  ...DEFAULTS, ...fileCfg,
  tts: { ...DEFAULTS.tts, ...fileCfg.tts }, ai: { ...DEFAULTS.ai, ...fileCfg.ai }, disclaimer: { ...DEFAULTS.disclaimer, ...fileCfg.disclaimer },
  npc: { ...DEFAULTS.npc, ...fileCfg.npc, quangVoice: { ...DEFAULTS.npc.quangVoice, ...fileCfg.npc?.quangVoice } },
};

// Khoá API để riêng trong secrets.json (đã có trong .gitignore), không bao giờ gửi ra trình duyệt
const secretsFile = join(ROOT, 'secrets.json');
let secrets: Secrets = existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, 'utf8')) : {};
const SECRET_NAMES: SecretName[] = ['googleKey', 'fptKey', 'elevenKey', 'anthropicKey', 'openaiKey'];
function setSecret(name: SecretName, value: string) {
  if (!SECRET_NAMES.includes(name)) return;
  const v = String(value || '').trim();
  if (v) secrets[name] = v.slice(0, 300); else delete secrets[name];
  writeFileSync(secretsFile, JSON.stringify(secrets, null, 2) + '\n');
}

// CLI: --sim <số bot>  --port <cổng>  --tiktok <username> (tự kết nối ngay)  --lan (nghe mọi địa chỉ)
const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return undefined;
  const a = argv[i];
  return a.includes('=') ? a.split('=')[1] : argv[i + 1] ?? '';
};
const simCount = Number(arg('sim') ?? 0);
const port = Number(arg('port') ?? cfg.port);
const listenHost = argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';

const { port: _p, ...settings } = cfg;
let game!: Game;

// ---------- Chỉ số phiên live ----------
const metrics = new SessionMetrics(ROOT);

// ---------- Giọng chủ tiệc (TTS) ----------
const tts = new TtsService(ROOT, () => game.settings.tts, () => secrets, (status) => game?.toControlMsg({ t: 'tts_status', status }));

game = new Game(settings, (s) => {
  const { secrets: _s, ...plain } = s;
  try { writeFileSync(cfgFile, JSON.stringify({ ...fileCfg, ...plain, port: cfg.port }, null, 2) + '\n'); }
  catch (e) { console.error('Không lưu được config.json', e); }
}, (text, fx, waitMs, voice) => tts.synth(text, fx, waitMs, voice), metrics);
tts.onSynth = (ms, ok) => metrics.tts(ms, ok);

function stopSession() {
  const r = metrics.stop();
  if (!r) return;
  const url = `/sessions/${r.reportFile}`;
  game.log('system', `Đã lưu báo cáo phiên: ${url}`);
  game.toControlMsg({ t: 'session_report', url });
  game.toControlMsg({ t: 'sessions', list: metrics.list() });
}
setInterval(() => game.toControlMsg({ t: 'metrics', m: metrics.snapshot() }), 2000);
game.decorateSettings = (s) => ({ ...s, secrets: Object.fromEntries(SECRET_NAMES.map((n) => [n, !!secrets[n]])) });
game.onTtsChange = () => tts.resetStatus();
const sim = new Simulator(game);

// ---------- Tầng 2: LLM phân loại comment ----------
const nicks = new Map<string, string>();
const ai = new AiClassifier(
  () => game.settings.ai,
  () => secrets,
  (r) => game.applyAi(r.guestId, nicks.get(r.guestId) ?? 'Khách', r.intent as any, r.table),
  (status) => game.toControlMsg({ t: 'ai_status', status }),
);
game.aiOffer = (item) => {
  nicks.set(item.guestId, item.nick);
  if (nicks.size > 5000) nicks.clear();
  ai.offer(item);
};
game.onControlHello = (send) => {
  send({ t: 'metrics', m: metrics.snapshot() });
  send({ t: 'sessions', list: metrics.list() });
  send({ t: 'tts_status', status: tts.status() });
  send({ t: 'ai_status', status: ai.status() });
};

// ---------- TikTok LIVE ----------
const filter = createEventFilter();
const live = createTikTokAdapter({
  onStatus: (s) => {
    game.setLive(s);
    // Kết nối live thành công → tự bắt đầu ghi phiên (nếu chưa ghi)
    if (s.status === 'connected' && !metrics.isActive) {
      metrics.start('@' + s.uniqueId, game.guestIds());
      game.log('system', `Bắt đầu ghi chỉ số phiên @${s.uniqueId}`);
    }
  },
  log: (msg) => { console.log('[live]', msg); game.log('live', msg); },
  emit: (raw) => {
    if (raw.createTime) metrics.tiktokLatency(Date.now() - raw.createTime);
    const e = filter(raw);
    if (!e) return;
    const base = { userId: e.user.id, nick: e.user.name };
    switch (e.type) {
      case 'chat': return game.handle({ kind: 'chat', ...base, text: e.text });
      case 'like': return game.handle({ kind: 'like', ...base, count: e.count });
      case 'gift': return game.handle({ kind: 'gift', ...base, giftName: e.name, count: e.count, coins: e.coins });
      case 'social': return game.handle({ kind: 'social', ...base, what: e.kind });
      case 'member': metrics.member(e.user.id); return; // người vào xem live → mẫu số tỉ lệ nhập tiệc
    }
  },
});

// ---------- HTTP: phục vụ client đã build ----------
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml',
};
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') { res.end(JSON.stringify(game.stats())); return; }
  const rep = url.pathname.match(/^\/sessions\/([A-Za-z0-9._-]+\.html)$/);
  if (rep) {
    const f = join(metrics.sessionsDir, rep[1]);
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(f));
    return;
  }
  const ttsFile = url.pathname.match(/^\/tts\/([a-f0-9]{20})\.mp3$/);
  if (ttsFile) {
    const f = join(tts.cacheDir, `${ttsFile[1]}.mp3`);
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'max-age=86400', 'access-control-allow-origin': '*' });
    res.end(readFileSync(f));
    return;
  }
  if (!existsSync(CLIENT_DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Chưa build client. Khi dev: mở http://127.0.0.1:5173/control.html . Khi live: chạy "npm run build" rồi mở lại trang này.');
    return;
  }
  const pathname = url.pathname === '/control' ? '/control.html' : url.pathname;
  let p = normPath(join(CLIENT_DIST, decodeURIComponent(pathname)));
  if (!p.startsWith(CLIENT_DIST)) { res.writeHead(403); res.end(); return; }
  if (!existsSync(p) || statSync(p).isDirectory()) {
    if (extname(pathname)) { res.writeHead(404); res.end(); return; } // file tĩnh không có (vd. assets/bg.png)
    p = join(CLIENT_DIST, 'index.html');
  }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(p));
});

// ---------- WebSocket ----------
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  // Chỉ cho trang local điều khiển (chặn trang web lạ gửi lệnh qua trình duyệt của bạn)
  const origin = req.headers.origin;
  const trusted = !origin || LOCAL_ORIGIN.test(origin) || listenHost === '0.0.0.0';
  (req.socket as any).setNoDelay?.(true);
  const send = (m: import('../../shared/protocol.js').ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
  const conn = game.attach(send);
  let role: 'overlay' | 'preview' | 'control' = 'overlay';

  ws.on('message', (buf) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(buf)); } catch { return; }
    if (m.t === 'hello') { role = m.role; conn.setRole(m.role); return; }
    if (m.t === 'host_arrived') { if (role !== 'control') game.hostArrived(m.token); return; }
    if (m.t === 'npc_arrived') { if (role !== 'control' && (m.id === 'quang' || m.id === 'chuc')) game.npcArrived(m.id, m.token); return; }
    // sức khoẻ màn hình live: chỉ lấy từ overlay thật (không lấy bản xem trước)
    if (m.t === 'perf') { if (role === 'overlay') metrics.overlayFps(Number(m.fps)); return; }
    if (m.t === 'stuck') { if (role === 'overlay') { metrics.stuck(m.who === 'host' ? 'host' : 'guest'); } return; }
    if (!trusted) return;
    switch (m.t) {
      case 'live_connect': {
        const u = parseUsername(m.username);
        if (!isValidUsername(u)) { game.log('live', `Tên TikTok không hợp lệ: "${m.username}"`); return; }
        game.patchSettings({ tiktokUsername: u });
        void live.start(u);
        return;
      }
      case 'live_disconnect': void live.stop(); game.log('live', 'Đã ngắt kết nối'); return;
      case 'event_start':
        if (!game.director.start(m.id as EventId)) game.log('event', 'Không bắt đầu được sự kiện (chưa đủ khách?)');
        return;
      case 'event_stop': game.director.stop(); return;
      case 'npc_call': if (m.id === 'quang' || m.id === 'chuc') game.callNpc(m.id); return;
      case 'settings_patch': game.patchSettings(m.patch); return;
      case 'secret_set':
        setSecret(m.name, m.value);
        game.log('system', `Đã ${m.value ? 'lưu' : 'xoá'} khoá ${m.name}`);
        tts.resetStatus();
        game.broadcastSettings();
        return;
      case 'tts_test': {
        const fx: VoiceFx = m.fx === 'old' ? 'old' : 'normal';
        const text = String(m.text || '').slice(0, 200) || 'Anh em mình đến với nhau bằng cái tình cảm!';
        if (!tts.active) { send({ t: 'tts_test_result', error: 'Đang chọn "Trình duyệt" hoặc "Tắt" — không có file giọng để nghe thử ở đây.' }); return; }
        tts.synth(text, fx, 30000)
          .then((r) => send(r ? { t: 'tts_test_result', url: r.url, ms: r.ms } : { t: 'tts_test_result', error: tts.status().lastError || 'Không tạo được giọng' }));
        return;
      }
      case 'tts_prerender':
        void tts.prerender(game.prerenderTexts()).then((st) => st && game.log('system', `Render sẵn thoại: ${st.done}/${st.total} (lỗi ${st.failed})`));
        return;
      case 'tts_clear_cache': tts.clearCache(); game.log('system', 'Đã xoá cache giọng'); return;
      case 'ai_test':
        ai.test(String(m.text || '').slice(0, 200))
          .then((r) => send({ t: 'ai_test_result', text: m.text, intent: r.intent, table: r.table, ms: r.ms }))
          .catch((e) => send({ t: 'ai_test_result', text: m.text, error: String(e?.message ?? e) }));
        return;
      case 'host_say': game.hostSay(String(m.text || '')); return;
      case 'reset_room': game.resetRoom(); return;
      case 'session_start':
        if (!metrics.isActive) {
          metrics.start(String(m.label || '').slice(0, 40) || (live.state().uniqueId ? '@' + live.state().uniqueId : 'phiên thử'), game.guestIds());
          game.log('system', 'Bắt đầu ghi chỉ số phiên');
        }
        return;
      case 'session_stop': stopSession(); return;
      case 'sim_comment': {
        const nick = String(m.nick || 'Tester').slice(0, 18);
        game.handle({ kind: 'chat', userId: `dev_${nick}`, nick, text: String(m.text || '') });
        return;
      }
      case 'sim_bots': sim.setTarget(Number(m.count) || 0); game.log('system', `Giả lập: ${sim.count} bot`); return;
    }
  });
  ws.on('close', conn.detach);
});

server.listen(port, listenHost, () => {
  const base = `http://127.0.0.1:${port}`;
  console.log(`\n🍚 Bữa Cơm Tình Nghĩa`);
  console.log(`   Bảng điều khiển : ${base}/control`);
  console.log(`   Màn hình live   : ${base}/   (OBS Browser Source 1080x1920, hoặc OPEN-LIVE-WINDOW.bat)`);
  console.log(`   Giọng chủ tiệc  : ${game.settings.tts.provider}${game.settings.ai.enabled ? `  ·  AI phân loại: ${game.settings.ai.provider}` : ''}`);
  const autoUser = arg('tiktok');
  if (autoUser) void live.start(autoUser);
  if (simCount > 0) { sim.setTarget(simCount); console.log(`   Giả lập: ${simCount} bot`); }
  // Giọng Edge miễn phí → tự render sẵn thư viện thoại ở nền (nhà cung cấp trả phí: bấm nút trong bảng điều khiển)
  if (game.settings.tts.provider === 'edge') {
    setTimeout(() => void tts.prerender(game.prerenderTexts()).then((st) => st && game.log('system', `Render sẵn thoại: ${st.done - st.failed}/${st.total} câu`)), 3000);
  }
});

// Tắt server (Ctrl+C / đóng cửa sổ) → vẫn lưu báo cáo phiên đang ghi
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => { try { stopSession(); } finally { process.exit(0); } });
}
