import { TABLE_COUNT } from '../../../shared/layout';
import type {
  AiStatusDTO, BondDTO, HeatDTO, MetricsDTO, SessionListItem, EventDTO, EventId, LiveStateDTO, LogDTO, SecretName, ServerMsg, SettingsDTO, StatsDTO, TtsProviderId, TtsStatusDTO,
} from '../../../shared/protocol';
import { Socket } from '../net/socket';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const inputs = {
  username: $<HTMLInputElement>('username'),
  hostName: $<HTMLInputElement>('hostName'),
  venueName: $<HTMLInputElement>('venueName'),
  spm: $<HTMLInputElement>('spm'),
  afk: $<HTMLInputElement>('afk'),
  director: $<HTMLInputElement>('director'),
  gap: $<HTMLSelectElement>('gap'),
  sayText: $<HTMLInputElement>('sayText'),
  simNick: $<HTMLInputElement>('simNick'),
  simText: $<HTMLInputElement>('simText'),
};

const sock = new Socket('control');
let settings: SettingsDTO | null = null;
let event: (EventDTO & { endsAt: number }) | null = null;

// ---------- xem trước ----------
const overlayUrl = `${location.origin}/`;
$('obsUrl').textContent = overlayUrl;
$<HTMLIFrameElement>('preview').src = '/?preview=1';
$('copyUrl').onclick = () => { void navigator.clipboard?.writeText(overlayUrl); flash($('copyUrl'), '✓'); };
$('openLive').onclick = () => window.open('/?size=720', 'bua-com-live', 'popup=yes,width=560,height=1000');

// ---------- nhận từ server ----------
sock.onStatus((up) => { $('serverState').textContent = up ? 'Server: đã kết nối.' : 'Mất kết nối server — đang thử lại…'; });
sock.onMessage((m: ServerMsg) => {
  switch (m.t) {
    case 'snapshot': applySettings(m.settings); applyStats(m.stats); applyBond(m.bond); applyEvent(m.event); applyHeat(m.heat); return;
    case 'settings': return applySettings(m.settings);
    case 'stats': return applyStats(m.stats);
    case 'bond': return applyBond(m.bond);
    case 'event': return applyEvent(m.event);
    case 'log': return appendLog(m.entries);
    case 'tts_status': return applyTtsStatus(m.status);
    case 'metrics': return applyMetrics(m.m);
    case 'heat': return applyHeat(m.heat);
    case 'sessions': return applySessions(m.list);
    case 'session_report': {
      const el = $('sessReport');
      el.innerHTML = '';
      const a = document.createElement('a'); a.href = m.url; a.target = '_blank'; a.textContent = '📊 Mở báo cáo vừa tạo';
      el.append('Đã lưu báo cáo. ', a);
      window.open(m.url, '_blank');
      return;
    }
    case 'ai_status': return applyAiStatus(m.status);
    case 'tts_test_result': return onTtsTest(m.url, m.error);
    case 'ai_test_result': {
      const out = $('aiTestOut');
      out.className = `state ${m.error ? 'bad' : 'ok'}`;
      out.textContent = m.error ? `Lỗi: ${m.error}` : `→ ${m.intent}${m.table ? ` (mâm ${m.table})` : ''} · ${m.ms} ms`;
      return;
    }
    case 'director': {
      $('nextEvent').textContent = !m.enabled ? 'Sự kiện tự động đang tắt.'
        : m.nextInSec === null ? 'Đang có sự kiện.'
        : `Sự kiện tự động tiếp theo sau ~${m.nextInSec}s (cần ít nhất 3 khách ngồi).`;
      return;
    }
  }
});

function applySettings(s: SettingsDTO) {
  settings = s;
  const keep = (el: HTMLInputElement | HTMLSelectElement, v: string) => { if (document.activeElement !== el) el.value = v; };
  if (!inputs.username.value) inputs.username.value = s.tiktokUsername ? '@' + s.tiktokUsername : '';
  keep(inputs.hostName, s.hostName);
  keep(inputs.venueName, s.venueName);
  keep(inputs.spm, String(s.speechPerMinute));
  $('spmVal').textContent = String(s.speechPerMinute);
  keep(inputs.afk, String(s.afkMinutes));
  applyVoiceSettings(s);
  $<HTMLInputElement>('quangOnCall').checked = s.npc.quangOnCall;
  $<HTMLInputElement>('chucEnabled').checked = s.npc.chucEnabled;
  keep($<HTMLInputElement>('qRate'), String(s.npc.quangVoice.rate)); $('qRateVal').textContent = pctText(s.npc.quangVoice.rate);
  keep($<HTMLInputElement>('qPitch'), String(s.npc.quangVoice.pitch)); $('qPitchVal').textContent = pctText(s.npc.quangVoice.pitch);
  $<HTMLInputElement>('discShow').checked = s.disclaimer.show;
  keep($<HTMLInputElement>('discText'), s.disclaimer.text);
  inputs.director.checked = s.directorEnabled;
  if (![...inputs.gap.options].some((o) => o.value === String(s.eventGapSec))) {
    inputs.gap.add(new Option(`${s.eventGapSec}s`, String(s.eventGapSec)));
  }
  keep(inputs.gap, String(s.eventGapSec));
}

const STATUS_TEXT: Record<LiveStateDTO['status'], string> = {
  idle: 'CHƯA KẾT NỐI', connecting: 'ĐANG KẾT NỐI…', connected: 'ĐANG LIVE', disconnected: 'MẤT KẾT NỐI', error: 'LỖI KẾT NỐI',
};

function applyStats(s: StatsDTO) {
  const live = s.live;
  const pill = $('livePill');
  pill.className = `pill ${live.status}`;
  pill.querySelector('span')!.textContent = STATUS_TEXT[live.status] + (live.uniqueId ? ` · @${live.uniqueId}` : '');
  const st = $('liveState');
  st.innerHTML = '';
  st.append(document.createTextNode(
    live.status === 'idle' ? 'Chưa kết nối.'
      : live.status === 'connected' ? `Đã kết nối @${live.uniqueId}${live.roomId ? ` · room ${live.roomId}` : ''}`
      : live.status === 'connecting' ? `Đang kết nối @${live.uniqueId}…`
      : `@${live.uniqueId}: ${live.status === 'error' ? 'lỗi' : 'mất kết nối'} — đang tự thử lại`,
  ));
  if (live.error) { const e = document.createElement('div'); e.className = 'err'; e.textContent = live.error; st.append(e); }
  $<HTMLButtonElement>('connect').disabled = live.status === 'connected' || live.status === 'connecting';
  $<HTMLButtonElement>('disconnect').disabled = live.status === 'idle';

  $('stGuests').textContent = String(s.guests - s.waiting);
  $('stWaiting').textContent = String(s.waiting);
  $('stChat').textContent = String(s.chatPer10s);
  $('botCount').textContent = s.sim ? `${s.sim} bot` : '';
}

// ---------- mâm ----------
const tableBox = $('tables');
const tableEls = Array.from({ length: TABLE_COUNT }, (_, t) => {
  const el = document.createElement('div');
  el.className = 't';
  el.innerHTML = `<div class="row"><b>Mâm ${t + 1}</b><span class="stars"></span></div><div class="bar"><i></i></div>`;
  tableBox.append(el);
  return el;
});
function applyBond(b: BondDTO) {
  tableEls.forEach((el, t) => {
    const v = b.score[t] ?? 0;
    const bar = el.querySelector<HTMLElement>('.bar i')!;
    bar.style.width = `${v}%`;
    bar.classList.toggle('hot', v >= 80);
    el.querySelector('.stars')!.textContent = `${v}${b.stars[t] ? ` · ⭐${b.stars[t]}` : ''}`;
  });
}

// ---------- sự kiện ----------
function applyEvent(e: EventDTO | null) {
  event = e ? { ...e, endsAt: Date.now() + e.remainingMs } : null;
  renderEvent();
}
function renderEvent() {
  const box = $('eventNow');
  if (!event) { box.className = 'eventNow idle'; box.textContent = 'Không có sự kiện'; return; }
  const left = Math.max(0, event.endsAt - Date.now());
  box.className = 'eventNow on';
  box.innerHTML = '';
  box.append(document.createTextNode(`${event.title} · còn ${Math.ceil(left / 1000)}s`));
  const small = document.createElement('small'); small.textContent = event.hint; box.append(small);
  const bar = document.createElement('div'); bar.className = 'bar';
  const i = document.createElement('i'); i.style.width = `${(left / event.durationMs) * 100}%`; bar.append(i); box.append(bar);
}
setInterval(() => { if (event) renderEvent(); }, 1000);

// ---------- nhật ký ----------
const logBox = $('log');
const shown = new Set(['live', 'event', 'gift', 'system']);
let allLogs: LogDTO[] = [];
document.querySelectorAll<HTMLInputElement>('.filters input').forEach((cb) => {
  cb.onchange = () => { cb.checked ? shown.add(cb.dataset.kind!) : shown.delete(cb.dataset.kind!); redrawLog(); };
});
function logLine(e: LogDTO) {
  const d = document.createElement('div');
  d.className = e.kind;
  const t = document.createElement('time');
  t.textContent = new Date(e.ts).toLocaleTimeString('vi-VN');
  d.append(t, document.createTextNode(e.msg));
  return d;
}
function appendLog(entries: LogDTO[]) {
  allLogs.push(...entries);
  if (allLogs.length > 600) allLogs = allLogs.slice(-400);
  const atBottom = logBox.scrollTop + logBox.clientHeight >= logBox.scrollHeight - 20;
  for (const e of entries) if (shown.has(e.kind)) logBox.append(logLine(e));
  while (logBox.childElementCount > 400) logBox.firstElementChild!.remove();
  if (atBottom) logBox.scrollTop = logBox.scrollHeight;
}
function redrawLog() {
  logBox.replaceChildren(...allLogs.filter((e) => shown.has(e.kind)).slice(-400).map(logLine));
  logBox.scrollTop = logBox.scrollHeight;
}

// ---------- gửi lệnh ----------
const patch = (p: Partial<SettingsDTO>) => sock.send({ t: 'settings_patch', patch: p });

$('connect').onclick = () => {
  const u = inputs.username.value.trim();
  if (!u) { inputs.username.focus(); return; }
  sock.send({ t: 'live_connect', username: u });
};
$('disconnect').onclick = () => sock.send({ t: 'live_disconnect' });
inputs.username.onkeydown = (e) => { if (e.key === 'Enter') $('connect').click(); };

document.querySelectorAll<HTMLButtonElement>('[data-event]').forEach((b) => {
  b.onclick = () => sock.send({ t: 'event_start', id: b.dataset.event as EventId });
});
$('eventStop').onclick = () => sock.send({ t: 'event_stop' });
inputs.director.onchange = () => patch({ directorEnabled: inputs.director.checked });
inputs.gap.onchange = () => patch({ eventGapSec: Number(inputs.gap.value) });

const say = () => { const t = inputs.sayText.value.trim(); if (t) { sock.send({ t: 'host_say', text: t }); inputs.sayText.value = ''; } };
$('say').onclick = say;
inputs.sayText.onkeydown = (e) => { if (e.key === 'Enter') say(); };
inputs.hostName.onchange = () => patch({ hostName: inputs.hostName.value.trim() });
inputs.venueName.onchange = () => patch({ venueName: inputs.venueName.value.trim() });
inputs.spm.oninput = () => { $('spmVal').textContent = inputs.spm.value; };
inputs.spm.onchange = () => patch({ speechPerMinute: Number(inputs.spm.value) });
inputs.afk.onchange = () => patch({ afkMinutes: Number(inputs.afk.value) });

$<HTMLInputElement>('discShow').onchange = (e) => patch({ disclaimer: { ...settings!.disclaimer, show: (e.target as HTMLInputElement).checked } });
$<HTMLInputElement>('discText').onchange = (e) => patch({ disclaimer: { ...settings!.disclaimer, text: (e.target as HTMLInputElement).value } });

const simSend = (text: string) => sock.send({ t: 'sim_comment', nick: inputs.simNick.value.trim() || 'Tester', text });
inputs.simText.onkeydown = (e) => {
  if (e.key === 'Enter' && inputs.simText.value.trim()) { simSend(inputs.simText.value.trim()); inputs.simText.value = ''; }
};
document.querySelectorAll<HTMLButtonElement>('[data-say]').forEach((b) => { b.onclick = () => simSend(b.dataset.say!); });
document.querySelectorAll<HTMLButtonElement>('[data-bots]').forEach((b) => {
  b.onclick = () => sock.send({ t: 'sim_bots', count: Number(b.dataset.bots) });
});

$('reset').onclick = () => {
  if (confirm('Dọn sân: mọi khách ra về và điểm tình nghĩa về 0. Tiếp tục?')) sock.send({ t: 'reset_room' });
};

function flash(el: HTMLElement, text: string) {
  const old = el.textContent;
  el.textContent = text;
  setTimeout(() => (el.textContent = old), 1200);
}


// ---------- 08 / Giọng chủ tiệc ----------
const VOICES: Record<TtsProviderId, { list: string[]; label: string; key?: SecretName; keyHint?: string }> = {
  edge: { list: ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'], label: 'Giọng (Edge)' },
  google: { list: ['vi-VN-Neural2-D', 'vi-VN-Wavenet-D', 'vi-VN-Wavenet-B', 'vi-VN-Standard-D', 'vi-VN-Standard-B'], label: 'Giọng (Google)', key: 'googleKey', keyHint: 'Google Cloud API key' },
  fpt: { list: ['leminh', 'minhquang', 'giahuy', 'banmai', 'thuminh'], label: 'Giọng (FPT.AI)', key: 'fptKey', keyHint: 'FPT.AI api-key' },
  elevenlabs: { list: [], label: 'voice_id (giọng có sẵn trong Voice Library)', key: 'elevenKey', keyHint: 'ElevenLabs xi-api-key' },
  browser: { list: [], label: 'Giọng (dùng giọng tiếng Việt của Windows)' },
  off: { list: [], label: 'Giọng' },
};
const tts = {
  provider: $<HTMLSelectElement>('ttsProvider'), voice: $<HTMLInputElement>('ttsVoice'),
  rate: $<HTMLInputElement>('ttsRate'), pitch: $<HTMLInputElement>('ttsPitch'),
  key: $<HTMLInputElement>('ttsKey'), testText: $<HTMLInputElement>('ttsTestText'),
  vol: $<HTMLInputElement>('voiceVol'), amb: $<HTMLInputElement>('ambience'), ambVol: $<HTMLInputElement>('ambVol'),
};
const aiIn = {
  enabled: $<HTMLInputElement>('aiEnabled'), provider: $<HTMLSelectElement>('aiProvider'), model: $<HTMLInputElement>('aiModel'),
  base: $<HTMLInputElement>('aiBase'), key: $<HTMLInputElement>('aiKey'), max: $<HTMLInputElement>('aiMax'), test: $<HTMLInputElement>('aiTestText'),
};
const pctText = (v: number) => `${v > 0 ? '+' : ''}${v}%`;

function applyVoiceSettings(s: SettingsDTO) {
  const keep = (el: HTMLInputElement | HTMLSelectElement, v: string) => { if (document.activeElement !== el) el.value = v; };
  const p = s.tts.provider;
  keep(tts.provider, p);
  keep(tts.voice, s.tts.voice);
  keep(tts.rate, String(s.tts.rate)); $('rateVal').textContent = pctText(s.tts.rate);
  keep(tts.pitch, String(s.tts.pitch)); $('pitchVal').textContent = pctText(s.tts.pitch);
  const meta = VOICES[p];
  $('voiceLabel').textContent = meta.label;
  tts.voice.placeholder = meta.list[0] ? `mặc định: ${meta.list[0]}` : p === 'elevenlabs' ? 'dán voice_id' : '—';
  tts.voice.disabled = p === 'browser' || p === 'off';
  $('voiceList').replaceChildren(...meta.list.map((v) => new Option(v, v)));
  const keyRow = $('ttsKeyRow');
  keyRow.style.display = meta.key ? '' : 'none';
  if (meta.key) {
    tts.key.placeholder = meta.keyHint ?? 'API key';
    const has = !!s.secrets?.[meta.key];
    const st = $('ttsKeyState'); st.textContent = has ? '✓ đã lưu' : 'chưa có'; st.className = `keystate ${has ? 'ok' : ''}`;
  }
  const serverTts = p !== 'browser' && p !== 'off';
  $<HTMLButtonElement>('ttsTest').disabled = !serverTts;
  $<HTMLButtonElement>('ttsTestOld').disabled = !serverTts;
  $<HTMLButtonElement>('ttsPrerender').disabled = !serverTts;
  keep(tts.vol, String(s.voiceVolume)); $('volVal').textContent = String(s.voiceVolume);
  tts.amb.checked = s.ambience;
  keep(tts.ambVol, String(s.ambienceVolume)); $('ambVal').textContent = String(s.ambienceVolume);

  // AI
  aiIn.enabled.checked = s.ai.enabled;
  keep(aiIn.provider, s.ai.provider);
  keep(aiIn.model, s.ai.model);
  keep(aiIn.base, s.ai.baseUrl);
  keep(aiIn.max, String(s.ai.maxCallsPerMinute)); $('aiMaxVal').textContent = String(s.ai.maxCallsPerMinute);
  $('aiBaseRow').style.display = s.ai.provider === 'openai' ? '' : 'none';
  $('aiKeyRow').style.display = s.ai.provider === 'mock' ? 'none' : '';
  const aiKey: SecretName = s.ai.provider === 'anthropic' ? 'anthropicKey' : 'openaiKey';
  aiIn.key.placeholder = s.ai.provider === 'anthropic' ? 'Anthropic API key' : 'API key (Ollama: để trống)';
  const hasAi = !!s.secrets?.[aiKey];
  const st = $('aiKeyState'); st.textContent = hasAi ? '✓ đã lưu' : 'chưa có'; st.className = `keystate ${hasAi ? 'ok' : ''}`;
  aiIn.model.placeholder = s.ai.provider === 'anthropic' ? 'claude-haiku-5-5' : s.ai.provider === 'openai' ? 'gpt-4o-mini / qwen2.5:7b …' : '—';
}

function applyTtsStatus(st: TtsStatusDTO) {
  const el = $('ttsState');
  const pr = st.prerender;
  el.className = `state ${st.ok ? 'ok' : 'bad'}`;
  el.textContent = (st.ok ? '● Giọng hoạt động' : `● Lỗi: ${st.lastError}`) + ` · cache ${st.cacheFiles} câu`
    + (pr ? ` · đang render ${pr.done}/${pr.total}${pr.failed ? ` (lỗi ${pr.failed})` : ''}` : '');
  $<HTMLButtonElement>('ttsPrerender').textContent = pr ? `⏳ ${pr.done}/${pr.total}` : '⤓ Render sẵn thư viện thoại';
}

function applyAiStatus(a: AiStatusDTO) {
  $('aiState').textContent = !a.enabled ? 'Đang tắt.'
    : `${a.calls} lần gọi · ${a.comments} comment · hiểu được ${a.matched} · lỗi ${a.errors} · ~${a.avgMs} ms/lần · chờ ${a.queue}`
      + (a.lastError ? ` · lỗi gần nhất: ${a.lastError}` : '');
}

let testAudio: HTMLAudioElement | null = null;
function onTtsTest(url?: string, error?: string) {
  for (const id of ['ttsTest', 'ttsTestOld']) $<HTMLButtonElement>(id).disabled = false;
  $('ttsTest').textContent = '▶ Nghe thử';
  if (error || !url) { const el = $('ttsState'); el.className = 'state bad'; el.textContent = `Lỗi: ${error}`; return; }
  testAudio?.pause();
  testAudio = new Audio(url);
  testAudio.volume = Number(tts.vol.value) / 100;
  if (testFx === 'old') testAudio.playbackRate = 0.94;
  void testAudio.play();
}
let testFx: 'normal' | 'old' = 'normal';
const runTest = (fx: 'normal' | 'old') => {
  testFx = fx;
  for (const id of ['ttsTest', 'ttsTestOld']) $<HTMLButtonElement>(id).disabled = true;
  $('ttsTest').textContent = '⏳ Đang tạo…';
  sock.send({ t: 'tts_test', text: tts.testText.value, fx });
};
$('ttsTest').onclick = () => runTest('normal');
$('ttsTestOld').onclick = () => runTest('old');
$('ttsPrerender').onclick = () => sock.send({ t: 'tts_prerender' });
$('ttsClear').onclick = () => { if (confirm('Xoá toàn bộ file giọng đã tạo?')) sock.send({ t: 'tts_clear_cache' }); };

const ttsPatch = () => patch({ tts: {
  provider: tts.provider.value as TtsProviderId, voice: tts.voice.value.trim(), rate: Number(tts.rate.value), pitch: Number(tts.pitch.value),
} });
tts.provider.onchange = () => patch({ tts: { ...settings!.tts, provider: tts.provider.value as TtsProviderId, voice: '' } });
tts.voice.onchange = ttsPatch;
tts.rate.oninput = () => { $('rateVal').textContent = pctText(Number(tts.rate.value)); };
tts.pitch.oninput = () => { $('pitchVal').textContent = pctText(Number(tts.pitch.value)); };
tts.rate.onchange = ttsPatch;
tts.pitch.onchange = ttsPatch;
$('ttsKeySave').onclick = () => {
  const k = VOICES[tts.provider.value as TtsProviderId].key;
  if (!k) return;
  sock.send({ t: 'secret_set', name: k, value: tts.key.value });
  tts.key.value = '';
};
tts.vol.oninput = () => { $('volVal').textContent = tts.vol.value; };
tts.vol.onchange = () => patch({ voiceVolume: Number(tts.vol.value) });
tts.amb.onchange = () => patch({ ambience: tts.amb.checked });
tts.ambVol.oninput = () => { $('ambVal').textContent = tts.ambVol.value; };
tts.ambVol.onchange = () => patch({ ambienceVolume: Number(tts.ambVol.value) });

// ---------- 09 / AI ----------
const aiPatch = () => patch({ ai: {
  enabled: aiIn.enabled.checked, provider: aiIn.provider.value as 'anthropic' | 'openai' | 'mock',
  model: aiIn.model.value.trim(), baseUrl: aiIn.base.value.trim(), maxCallsPerMinute: Number(aiIn.max.value),
} });
aiIn.enabled.onchange = aiPatch;
aiIn.provider.onchange = () => {
  const p = aiIn.provider.value;
  aiIn.model.value = p === 'anthropic' ? 'claude-haiku-5-5' : p === 'openai' ? 'gpt-4o-mini' : '';
  if (p === 'openai' && !aiIn.base.value) aiIn.base.value = 'https://api.openai.com/v1';
  aiPatch();
};
aiIn.model.onchange = aiPatch;
aiIn.base.onchange = aiPatch;
aiIn.max.oninput = () => { $('aiMaxVal').textContent = aiIn.max.value; };
aiIn.max.onchange = aiPatch;
$('aiKeySave').onclick = () => {
  const name: SecretName = aiIn.provider.value === 'anthropic' ? 'anthropicKey' : 'openaiKey';
  sock.send({ t: 'secret_set', name, value: aiIn.key.value });
  aiIn.key.value = '';
};
$('aiTest').onclick = () => {
  const out = $('aiTestOut'); out.className = 'state'; out.textContent = '⏳ …';
  sock.send({ t: 'ai_test', text: aiIn.test.value });
};

// ---------- 11 / Chỉ số phiên ----------
type Lv = 'good' | 'ok' | 'bad' | '';
const lv = (v: number, good: number, ok: number, higher = true, has = true): Lv =>
  !has ? '' : higher ? (v >= good ? 'good' : v >= ok ? 'ok' : 'bad') : (v <= good ? 'good' : v <= ok ? 'ok' : 'bad');
const sec = (ms: number) => (ms ? (ms / 1000).toFixed(1) + 's' : '—');

function applyMetrics(x: MetricsDTO) {
  const st = $('sessState');
  st.className = `sessState ${x.active ? 'on' : ''}`;
  st.textContent = x.active ? `● Đang ghi "${x.label}" · ${x.minutes} phút` : 'Chưa ghi';
  $<HTMLButtonElement>('sessStart').disabled = x.active;
  $<HTMLButtonElement>('sessStop').disabled = !x.active;
  const items: [string, string, string, Lv][] = [
    ['Nhập tiệc / người comment', `${x.joinRate}%`, `${x.joined}/${x.chatters} · /người xem ${x.joinRateOfViewers}%`, lv(x.joinRate, 50, 30, true, x.chatters > 0)],
    ['Còn tương tác sau 3 phút', x.retained3 < 0 ? '—' : `${x.retained3}%`, x.retained3 < 0 ? 'cần khách vào đủ 3 phút' : `10 phút: ${x.retained10 < 0 ? '—' : x.retained10 + '%'} · TB ${x.avgStayMin}'`, lv(x.retained3, 50, 35, true, x.retained3 >= 0)],
    ['Comment / phút', `${x.commentsPerMinNow}`, `TB cả phiên ${x.commentsPerMin}`, ''],
    ['Được hiểu', `${x.understood}%`, `nhờ AI ${x.aiShare}%`, lv(x.understood, 60, 40, true, x.chatters > 0)],
    ['Khách hiện tại', `${x.activeGuests}`, `đỉnh ${x.peakGuests} · xem ${x.viewers}`, ''],
    ['Trễ TikTok → game', sec(x.tiktokDelayMs), `P90 ${sec(x.tiktokDelayP90)}`, lv(x.tiktokDelayMs, 2000, 4000, false, x.tiktokDelayMs > 0)],
    ['Chủ tiệc nói trễ', sec(x.speechWaitMs), `P90 ${sec(x.speechWaitP90)} · TTS lỗi ${x.ttsFail}`, lv(x.speechWaitP90, 4000, 7000, false, x.speechWaitMs > 0)],
    ['Kẹt đường đi', `${x.stuckGuest + x.stuckHost}`, `khách ${x.stuckGuest} · chủ ${x.stuckHost}`, lv(x.stuckGuest + x.stuckHost, 0, 3, false, x.active)],
    ['FPS màn hình live', x.fpsAvg ? `${x.fpsAvg}` : '—', x.fpsAvg ? `thấp nhất ${x.fpsMin}` : 'chưa mở màn hình live', lv(x.fpsAvg, 55, 40, true, x.fpsAvg > 0)],
    ['Sự kiện', `${x.events}`, `TB ${x.eventParticipantsAvg} người tham gia`, ''],
  ];
  $('kpis').replaceChildren(...items.map(([label, val, sub, level]) => {
    const d = document.createElement('div');
    d.className = `kpi ${level}`;
    const b = document.createElement('b'); b.textContent = val;
    const sp = document.createElement('span'); sp.textContent = label;
    const sm = document.createElement('small'); sm.textContent = sub;
    d.append(b, sp, sm);
    return d;
  }));
  drawSpark('spark1', x.spark);
  drawSpark('spark2', x.sparkGuests);
}

function drawSpark(id: string, values: number[]) {
  const svg = $(id) as unknown as SVGSVGElement;
  if (values.length < 2) { svg.innerHTML = ''; return; }
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * 300},${48 - (v / max) * 44}`).join(' ');
  svg.innerHTML = `<path d="${d}"/>`;
}

function applySessions(list: SessionListItem[]) {
  const box = $('sessList');
  if (!list.length) { box.innerHTML = '<span class="hint">Chưa có báo cáo nào.</span>'; return; }
  box.replaceChildren(...list.map((s) => {
    const a = document.createElement('a');
    a.href = s.report; a.target = '_blank';
    const left = document.createElement('b');
    left.textContent = `${new Date(s.startedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${s.label}`;
    const right = document.createElement('span');
    right.textContent = `${s.durationMin}' · nhập tiệc ${s.joinRate}% · giữ 3' ${s.retained3 < 0 ? '—' : s.retained3 + '%'} · đỉnh ${s.peakGuests}`;
    a.append(left, right);
    return a;
  }));
}

$('sessStart').onclick = () => sock.send({ t: 'session_start', label: $<HTMLInputElement>('sessLabel').value.trim() });
$('sessStop').onclick = () => sock.send({ t: 'session_stop' });

// ---------- NPC + Độ náo nhiệt ----------
const HEAT_NAME: Record<HeatDTO['level'], string> = { vang: 'Vắng', am: 'Ấm', dong: 'Đông', bungno: 'Bùng nổ' };
const HEAT_CSS: Record<HeatDTO['level'], string> = { vang: '#5dade2', am: '#f5c26b', dong: '#ff8c42', bungno: '#ff3b30' };
function applyHeat(h: HeatDTO) {
  const f = $('heatFill');
  f.style.width = `${h.value}%`;
  f.style.background = HEAT_CSS[h.level];
  $('heatVal').textContent = `${h.value} · ${HEAT_NAME[h.level]}`;
}
$('callQuang').onclick = () => sock.send({ t: 'npc_call', id: 'quang' });
$('callChuc').onclick = () => sock.send({ t: 'npc_call', id: 'chuc' });
const npcPatch = () => patch({ npc: {
  quangOnCall: $<HTMLInputElement>('quangOnCall').checked,
  chucEnabled: $<HTMLInputElement>('chucEnabled').checked,
  quangVoice: { rate: Number($<HTMLInputElement>('qRate').value), pitch: Number($<HTMLInputElement>('qPitch').value) },
} });
for (const id of ['quangOnCall', 'chucEnabled', 'qRate', 'qPitch']) $<HTMLInputElement>(id).onchange = npcPatch;
$<HTMLInputElement>('qRate').oninput = (e) => { $('qRateVal').textContent = pctText(Number((e.target as HTMLInputElement).value)); };
$<HTMLInputElement>('qPitch').oninput = (e) => { $('qPitchVal').textContent = pctText(Number((e.target as HTMLInputElement).value)); };
