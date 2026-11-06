// Báo cáo phiên live: 1 file HTML tự chứa (không cần mạng), mở bằng trình duyệt.
import type { SessionSummary } from './metrics.js';

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

const EVENT_NAMES: Record<string, string> = {
  chao: '🥣 Bát cơm – bát cháo', payment: '💸 Anh thanh toán rồi', photo: '📸 Chụp ảnh kỷ niệm',
  toast: '🎤 Đại hội phát biểu', oldvoice: '👴 Giọng ông cụ',
};

type Level = 'good' | 'ok' | 'bad' | 'na';
const pctOr = (v: number) => (v < 0 ? '—' : `${v}%`);

/** Đánh giá sơ bộ — ngưỡng khởi điểm để so giữa các phiên, không phải chuẩn của TikTok. */
function grade(v: number, good: number, ok: number, higherBetter = true, hasData = true): Level {
  if (!hasData) return 'na';
  if (higherBetter) return v >= good ? 'good' : v >= ok ? 'ok' : 'bad';
  return v <= good ? 'good' : v <= ok ? 'ok' : 'bad';
}

function card(label: string, value: string, sub: string, level: Level) {
  return `<div class="card ${level}"><div class="cl">${label}</div><div class="cv">${value}</div><div class="cs">${sub}</div></div>`;
}

function lineChart(series: { name: string; values: number[]; cls: string }[], height = 220) {
  const n = Math.max(1, ...series.map((s) => s.values.length));
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const W = 900, H = height, pl = 40, pr = 12, pt = 12, pb = 28;
  const x = (i: number) => pl + (n <= 1 ? 0 : (i / (n - 1)) * (W - pl - pr));
  const y = (v: number) => pt + (1 - v / max) * (H - pt - pb);
  const grid = [0, 0.5, 1].map((k) => {
    const v = Math.round(max * k);
    return `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
  }).join('');
  const step = Math.max(1, Math.ceil(n / 10));
  const xt = Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0)
    .map((i) => `<text x="${x(i)}" y="${H - 8}" class="ax" text-anchor="middle">${i}'</text>`).join('');
  const paths = series.map((s) => {
    if (!s.values.length) return '';
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<path d="${d}" class="ln ${s.cls}"/>`;
  }).join('');
  const legend = series.map((s) => `<span class="lg ${s.cls}"><i></i>${s.name}</span>`).join('');
  return `<div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${grid}${xt}${paths}</svg>`;
}

function barPairs(a: number[], b: number[], height = 160) {
  const n = Math.max(1, a.length);
  const max = Math.max(1, ...a, ...b);
  const W = 900, H = height, pl = 40, pr = 12, pt = 10, pb = 26;
  const bw = (W - pl - pr) / n;
  const y = (v: number) => pt + (1 - v / max) * (H - pt - pb);
  let bars = '';
  for (let i = 0; i < n; i++) {
    const x0 = pl + i * bw;
    const w = Math.max(1, bw / 2 - 1);
    bars += `<rect x="${x0 + 1}" y="${y(a[i] ?? 0)}" width="${w}" height="${H - pb - y(a[i] ?? 0)}" class="bar s1"><title>Phút ${i}: vào ${a[i] ?? 0}</title></rect>`;
    bars += `<rect x="${x0 + 1 + w}" y="${y(b[i] ?? 0)}" width="${w}" height="${H - pb - y(b[i] ?? 0)}" class="bar s2"><title>Phút ${i}: ra ${b[i] ?? 0}</title></rect>`;
  }
  return `<div class="legend"><span class="lg s1"><i></i>Vào tiệc</span><span class="lg s2"><i></i>Ra về / tự về</span></div>
<svg viewBox="0 0 ${W} ${H}" class="chart">${bars}<line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" class="grid"/><text x="${pl - 6}" y="${y(max) + 4}" class="ax" text-anchor="end">${max}</text></svg>`;
}

/** Nhận xét tự động dựa trên số liệu. */
type ReportData = SessionSummary & { eventsList: SessionSummary['eventLog']; comments: number };

function insights(s: ReportData): string[] {
  const out: string[] = [];
  if (s.chatters >= 10 && s.joinRate < 30) out.push(`Chỉ <b>${s.joinRate}%</b> người comment nhập tiệc → nhắc lệnh "nhập tiệc" thường hơn (banner, chủ tiệc mời), hoặc thử bật "comment bất kỳ là vào sân".`);
  if (s.joinRate >= 50) out.push(`Tỉ lệ nhập tiệc tốt (<b>${s.joinRate}%</b>) — cửa vào đủ dễ.`);
  if (s.joined >= 10 && s.retained3 >= 0 && s.retained3 < 35) out.push(`Giữ chân 3 phút thấp (<b>${s.retained3}%</b>) → khách vào rồi không biết làm gì: rút ngắn giãn cách sự kiện, cho chủ tiệc ghé mâm người mới sớm hơn.`);
  if (s.retained3 >= 50) out.push(`Giữ chân 3 phút tốt (<b>${s.retained3}%</b>).`);
  if (s.tiktokDelayMs > 4000) out.push(`Comment từ TikTok tới server trễ trung vị <b>${(s.tiktokDelayMs / 1000).toFixed(1)}s</b> — do mạng / TikTok, không phải game. Kiểm tra mạng máy live.`);
  if (s.speechWaitP90 > 6000) out.push(`Chủ tiệc nói trễ (P90 <b>${(s.speechWaitP90 / 1000).toFixed(1)}s</b>) → hàng đợi thoại bị dồn: tăng "số câu nói / phút" hoặc render sẵn thoại.`);
  if (s.ttsFail > 3) out.push(`TTS lỗi <b>${s.ttsFail}</b> lần — kiểm tra mạng / key nhà cung cấp giọng.`);
  if (s.stuckGuest + s.stuckHost > 0) out.push(`Có <b>${s.stuckGuest}</b> lần khách và <b>${s.stuckHost}</b> lần chủ tiệc bị kẹt đường đi — cần xem lại lối đi / log.`);
  if (s.fpsAvg && s.fpsAvg < 45) out.push(`Màn hình live chạy <b>${s.fpsAvg} fps</b> (thấp nhất ${s.fpsMin}) — giảm số bot / đóng bớt ứng dụng, hoặc dùng máy mạnh hơn cho OBS.`);
  if (s.comments > 50 && s.understood < 40) out.push(`Chỉ <b>${s.understood}%</b> comment được hiểu → xem các câu hay gặp trong log để thêm lệnh vào <code>commands.json</code>, hoặc bật AI hiểu comment.`);
  const ev = s.eventsList;
  if (ev.length) {
    const best = [...ev].sort((a, b) => b.participants - a.participants)[0];
    out.push(`Sự kiện đông nhất: <b>${EVENT_NAMES[best.id] ?? best.id}</b> (${best.participants} người tham gia).`);
  } else if (s.minutes >= 10) out.push('Phiên không có sự kiện nào — kiểm tra "Tự động mở sự kiện" và số khách tối thiểu (3 người ngồi).');
  if (!out.length) out.push('Chưa đủ dữ liệu để nhận xét (cần nhiều người xem / phiên dài hơn).');
  return out;
}

export function renderReport(sum: SessionSummary): string {
  const s: ReportData = { ...sum, eventsList: sum.eventLog, comments: sum.timeline.reduce((a, m) => a + m.comments, 0) };
  const start = new Date(s.startedAt), end = new Date(s.endedAt);
  const dur = Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000));
  const fmtT = (d: Date) => d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  const sec = (ms: number) => (ms ? (ms / 1000).toFixed(1) + 's' : '—');

  const cards = [
    card('Nhập tiệc / người comment', `${s.joinRate}%`, `${s.joined} / ${s.chatters} người · trên người xem: ${s.joinRateOfViewers}%`, grade(s.joinRate, 50, 30, true, s.chatters > 0)),
    card('Còn tương tác sau 3 phút', pctOr(s.retained3), `sau 10 phút: ${pctOr(s.retained10)} · ở lại TB ${s.avgStayMin} phút`, grade(s.retained3, 50, 35, true, s.retained3 >= 0)),
    card('Comment / phút', String(s.commentsPerMin), `${s.comments} comment · ${s.understood}% được hiểu (AI: ${s.aiShare}%)`, grade(s.understood, 60, 40, true, s.comments > 0)),
    card('Khách cùng lúc (đỉnh)', String(s.peakGuests), `${s.viewers} người xem có ghi nhận · náo nhiệt TB ${s.heatAvg ?? 0}, đỉnh ${s.heatPeak ?? 0}`, 'na'),
    card('Trễ TikTok → server', sec(s.tiktokDelayMs), `P90 ${sec(s.tiktokDelayP90)}`, grade(s.tiktokDelayMs, 2000, 4000, false, s.tiktokDelayMs > 0)),
    card('Chủ tiệc nói trễ', sec(s.speechWaitMs), `P90 ${sec(s.speechWaitP90)} · TTS ${s.ttsMs} ms, lỗi ${s.ttsFail}`, grade(s.speechWaitP90, 4000, 7000, false, s.speechWaitMs > 0)),
    card('Kẹt đường đi', String(s.stuckGuest + s.stuckHost), `khách ${s.stuckGuest} · chủ tiệc ${s.stuckHost}`, grade(s.stuckGuest + s.stuckHost, 0, 3, false)),
    card('FPS màn hình live', s.fpsAvg ? String(s.fpsAvg) : '—', s.fpsAvg ? `thấp nhất ${s.fpsMin}` : 'chưa có màn hình live mở', grade(s.fpsAvg, 55, 40, true, s.fpsAvg > 0)),
  ].join('');

  const evRows = s.eventLog.map((e) => `<tr><td>${Math.round(e.at / 60000)}'</td><td>${EVENT_NAMES[e.id] ?? esc(e.id)}</td><td class="num">${e.participants}</td><td class="num">${Math.round(e.durationMs / 1000)}s</td></tr>`).join('')
    || '<tr><td colspan="4" class="muted">Không có sự kiện</td></tr>';
  const intentRows = Object.entries(s.intents).sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">—</td></tr>';

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Báo cáo phiên ${esc(s.label)}</title>
<style>
:root{--a3:#7b5ea7;--bg:#fbf7f2;--panel:#fff;--text:#2b1a12;--muted:#8a7464;--line:#eadfd3;--accent:#c0392b;--a2:#d4a017;--good:#1e8e4e;--ok:#b7791f;--bad:#c0392b}
@media (prefers-color-scheme:dark){:root{--bg:#140b07;--panel:#1f120c;--text:#f6e8d6;--muted:#b59a84;--line:#3a2318;--accent:#ff7a66;--a2:#ffd76a;--a3:#b99cf0;--good:#4cd37b;--ok:#f5a623;--bad:#ff6b6b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 system-ui,'Segoe UI',Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 16px 60px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;letter-spacing:.5px;margin:28px 0 10px}
.meta{color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-top:18px}
.card{background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--line);border-radius:10px;padding:12px 14px}
.card.good{border-left-color:var(--good)}.card.ok{border-left-color:var(--ok)}.card.bad{border-left-color:var(--bad)}
.cl{font-size:12px;color:var(--muted)}.cv{font-size:26px;font-weight:800;margin:2px 0}.cs{font-size:12px;color:var(--muted)}
.box{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}
.chart{width:100%;height:auto;display:block}.grid{stroke:var(--line)}.ax{fill:var(--muted);font-size:11px}
.ln{fill:none;stroke-width:2.5}.ln.s1,.bar.s1{stroke:var(--accent);fill:var(--accent)}.ln.s1{fill:none}.ln.s2{stroke:var(--a2)}.bar.s2{fill:var(--a2)}
.legend{display:flex;gap:16px;font-size:12px;color:var(--muted);margin-bottom:6px}.lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.lg.s1 i{background:var(--accent)}.lg.s2 i{background:var(--a2)}.lg.s3 i{background:var(--a3)}.ln.s3{stroke:var(--a3);stroke-dasharray:5 4}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left}th{font-size:12px;color:var(--muted);font-weight:600}
.num{text-align:right;font-variant-numeric:tabular-nums}.muted{color:var(--muted)}
.two{display:grid;grid-template-columns:2fr 1fr;gap:12px}@media(max-width:700px){.two{grid-template-columns:1fr}}
ul.ins{margin:0;padding-left:18px}ul.ins li{margin:6px 0}
.note{font-size:12px;color:var(--muted);margin-top:24px}
</style></head><body><main>
<h1>🍚 Báo cáo phiên: ${esc(s.label)}</h1>
<div class="meta">${fmtT(start)} → ${fmtT(end)} · ${dur} phút · ${s.eventLog.length} sự kiện · ${s.gifts} lần quà · ${s.likes} tim</div>
<div class="cards">${cards}</div>

<h2>NHẬN XÉT</h2>
<div class="box"><ul class="ins">${insights(s).map((x) => `<li>${x}</li>`).join('')}</ul></div>

<h2>COMMENT & KHÁCH THEO PHÚT</h2>
<div class="box">${lineChart([
    { name: 'Comment / phút', values: s.timeline.map((m) => m.comments), cls: 's1' },
    { name: 'Khách trong sân', values: s.timeline.map((m) => m.guests), cls: 's2' },
    { name: 'Náo nhiệt (0–100)', values: s.timeline.map((m) => m.heat ?? 0), cls: 's3' },
  ])}</div>

<h2>VÀO / RA THEO PHÚT</h2>
<div class="box">${barPairs(s.timeline.map((m) => m.joins), s.timeline.map((m) => m.leaves))}</div>

<div class="two">
  <div><h2>SỰ KIỆN</h2><div class="box"><table><tr><th>Phút</th><th>Sự kiện</th><th class="num">Tham gia</th><th class="num">Dài</th></tr>${evRows}</table></div></div>
  <div><h2>LỆNH HAY DÙNG</h2><div class="box"><table><tr><th>Intent</th><th class="num">Lần</th></tr>${intentRows}</table></div></div>
</div>

<p class="note">Ngưỡng tô màu (xanh / vàng / đỏ) là mốc khởi điểm để so giữa các phiên của bạn, không phải chuẩn của TikTok.
Id người xem trong log đã được băm, không lưu tên. Log chi tiết: <code>sessions/${esc(s.id)}.jsonl</code>.</p>
</main></body></html>`;
}
