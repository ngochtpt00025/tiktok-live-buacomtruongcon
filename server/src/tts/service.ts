import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TtsSettings, TtsStatusDTO, VoiceFx } from '../../../shared/protocol.js';
import { mp3DurationMs } from './mp3.js';
import { PROVIDERS, type Secrets } from './providers.js';

export interface SynthResult { url: string; ms: number }
export interface VoiceAdj { rate: number; pitch: number }

/** Bỏ emoji / ký hiệu khó đọc, giữ chữ tiếng Việt và dấu câu. */
export function cleanForSpeech(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[=:;]+\)+|\(+[=:;]+/g, ' ')                 // =)) :))
    .replace(/[^\p{L}\p{N}\s.,!?…'"\-–]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * Dịch vụ TTS: chọn nhà cung cấp theo cài đặt, cache file mp3 theo nội dung, đo thời lượng,
 * render sẵn thư viện câu cố định. Lỗi / quá chậm → trả null để game vẫn chạy (chỉ hiện chữ).
 */
export class TtsService {
  private dir: string;
  private durations = new Map<string, number>();
  private inflight = new Map<string, Promise<SynthResult>>();
  private running = 0;
  private waiters: (() => void)[] = [];
  private lastError = '';
  private ok = true;
  private prerenderState: TtsStatusDTO['prerender'] = null;
  /** Lỗi liên tục (mất mạng, sai key…) → tạm bỏ qua TTS một lúc để chủ tiệc không phải chờ */
  private pauseUntil = 0;
  /** Báo thời gian tổng hợp mỗi câu (cho chỉ số phiên) */
  onSynth: (ms: number, ok: boolean) => void = () => {};

  constructor(
    root: string,
    private settings: () => TtsSettings,
    private secrets: () => Secrets,
    private onStatus: (s: TtsStatusDTO) => void,
  ) {
    this.dir = join(root, 'cache', 'tts');
    mkdirSync(this.dir, { recursive: true });
  }

  get cacheDir() { return this.dir; }

  /** Nhà cung cấp tổng hợp ở server (không phải 'browser' / 'off'). */
  get active() { return !!PROVIDERS[this.settings().provider]; }

  status(): TtsStatusDTO {
    let files = 0;
    try { files = readdirSync(this.dir).filter((f) => f.endsWith('.mp3')).length; } catch { /* bỏ qua */ }
    return { provider: this.settings().provider, ok: this.ok, lastError: this.lastError, cacheFiles: files, prerender: this.prerenderState };
  }

  private key(text: string, fx: VoiceFx, adj?: VoiceAdj) {
    const s = this.settings();
    const extra = adj && (adj.rate || adj.pitch) ? `|${adj.rate}|${adj.pitch}` : '';
    return createHash('sha1').update([s.provider, s.voice, s.rate, s.pitch, fx, text].join('|') + extra).digest('hex').slice(0, 20);
  }

  /** Đã có trong cache chưa (không tổng hợp). */
  cached(text: string, fx: VoiceFx = 'normal', adj?: VoiceAdj): SynthResult | null {
    const clean = cleanForSpeech(text);
    if (!clean || !this.active) return null;
    const k = this.key(clean, fx, adj);
    const f = join(this.dir, `${k}.mp3`);
    if (!existsSync(f)) return null;
    let ms = this.durations.get(k);
    if (ms === undefined) { ms = mp3DurationMs(readFileSync(f)); this.durations.set(k, ms); }
    return { url: `/tts/${k}.mp3`, ms };
  }

  /**
   * Tổng hợp (hoặc lấy từ cache). Nếu quá `waitMs` thì trả null nhưng vẫn để chạy tiếp vào cache.
   */
  async synth(text: string, fx: VoiceFx = 'normal', waitMs = 6000, adj?: VoiceAdj): Promise<SynthResult | null> {
    const clean = cleanForSpeech(text);
    if (!clean || !this.active) return null;
    const hit = this.cached(clean, fx, adj);
    if (hit) return hit;
    if (Date.now() < this.pauseUntil && waitMs < 30000) return null;
    const k = this.key(clean, fx, adj);
    let p = this.inflight.get(k);
    if (!p) {
      p = this.make(k, clean, fx, adj).finally(() => this.inflight.delete(k));
      this.inflight.set(k, p);
    }
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), waitMs));
    return Promise.race([p, timeout]).catch(() => null);
  }

  private async make(k: string, text: string, fx: VoiceFx, adj?: VoiceAdj): Promise<SynthResult> {
    await this.acquire();
    const t0 = Date.now();
    try {
      const s = this.settings();
      const prov = PROVIDERS[s.provider]!;
      // "giọng ông cụ": chậm và trầm hơn; phần vang/lọc làm ở màn hình live
      const rate = s.rate + (fx === 'old' ? -14 : 0) + (adj?.rate ?? 0);
      const pitch = s.pitch + (fx === 'old' ? -12 : 0) + (adj?.pitch ?? 0);
      const buf = await prov.synth(text, s.voice || prov.defaultVoice, { rate, pitch }, this.secrets());
      writeFileSync(join(this.dir, `${k}.mp3`), buf);
      const ms = mp3DurationMs(buf) || estimate(text);
      this.durations.set(k, ms);
      this.onSynth(Date.now() - t0, true);
      if (!this.ok || this.lastError) { this.ok = true; this.lastError = ''; this.emit(); }
      return { url: `/tts/${k}.mp3`, ms };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 200);
      this.onSynth(Date.now() - t0, false);
      this.pauseUntil = Date.now() + 30000;
      if (this.ok || msg !== this.lastError) { this.ok = false; this.lastError = msg; this.emit(); }
      throw e;
    } finally { this.release(); }
  }

  /** Render sẵn danh sách câu cố định (chạy nền, tuần tự). */
  async prerender(items: { text: string; fx: VoiceFx; adj?: VoiceAdj }[]) {
    if (!this.active || this.prerenderState) return;
    const todo = items.filter((i) => !this.cached(i.text, i.fx, i.adj));
    this.prerenderState = { done: items.length - todo.length, total: items.length, failed: 0 };
    this.emit();
    let streak = 0;
    for (const it of todo) {
      let ok = false;
      try { await this.synth(it.text, it.fx, 60000, it.adj); ok = !!this.cached(it.text, it.fx, it.adj); } catch { /* đếm lỗi bên dưới */ }
      if (!ok) { this.prerenderState.failed++; streak++; } else streak = 0;
      this.prerenderState.done++;
      this.emit();
      if (streak >= 3) break; // lỗi liên tiếp (mất mạng / sai key) → dừng, khỏi phí lượt gọi
    }
    const st = this.prerenderState;
    this.prerenderState = null;
    this.emit();
    return st;
  }

  clearCache() {
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.durations.clear();
    this.emit();
  }

  /** Đổi nhà cung cấp/giọng → xoá trạng thái lỗi cũ. */
  resetStatus() { this.ok = true; this.lastError = ''; this.pauseUntil = 0; this.emit(); }

  private emit() { this.onStatus(this.status()); }

  private async acquire() {
    if (this.running < 2) { this.running++; return; }
    await new Promise<void>((r) => this.waiters.push(r));
    this.running++;
  }
  private release() { this.running--; this.waiters.shift()?.(); }
}

function estimate(text: string) {
  return Math.max(1500, text.split(/\s+/).length * 230 + 400);
}
