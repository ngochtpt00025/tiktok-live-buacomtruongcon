import type { ServerMsg, Speaker, VoiceFx } from '../../shared/protocol.js';

export interface SpeechItem {
  text: string;
  /** 0 = thấp (câu xã giao), 1 = thường, 2 = cao (phản ứng sự kiện), 3 = bắt buộc */
  priority: number;
  lookAt?: string;
  /** Hết hạn sau ms — câu chào cũ quá thì bỏ. */
  ttl?: number;
  fx?: VoiceFx;
  /** Người nói (mặc định chủ tiệc) */
  speaker?: Speaker;
  /** Chênh giọng so với giọng chủ tiệc (%), vd. chú Quang nói nhanh & cao hơn */
  voice?: { rate: number; pitch: number };
  /** Sự kiện đã đẩy câu này vào hàng đợi (để bỏ đi nếu sự kiện bị huỷ giữa chừng) */
  tag?: string;
  enqueuedAt?: number;
  /** Âm thanh đang được tổng hợp sẵn ngay khi vào hàng đợi */
  audio?: Promise<{ url: string; ms: number } | null>;
}

export type Synthesize = (
  text: string, fx: VoiceFx, waitMs: number, voice?: { rate: number; pitch: number },
) => Promise<{ url: string; ms: number } | null>;

/**
 * Hàng đợi thoại của chủ tiệc. Mỗi lúc chỉ phát 1 câu; giới hạn số câu/phút.
 * Câu vào hàng đợi là bắt đầu tổng hợp giọng luôn, đến lượt thì thường đã có sẵn file.
 */
export class SpeechQueue {
  private q: SpeechItem[] = [];
  private busyUntil = 0;
  private dispatching = false;
  private history: number[] = [];
  /** Báo độ trễ từ lúc câu vào hàng đợi tới lúc chủ tiệc nói (cho chỉ số phiên) */
  onDispatch: (waitMs: number) => void = () => {};

  constructor(
    private send: (m: ServerMsg) => void,
    public perMinute: number,
    private synthesize: Synthesize = async () => null,
  ) {}

  get busy() { return this.dispatching || Date.now() < this.busyUntil || this.q.length > 0; }
  get length() { return this.q.length; }

  push(item: SpeechItem) {
    item.enqueuedAt = Date.now();
    item.ttl ??= 15000;
    item.fx ??= 'normal';
    item.audio = this.synthesize(item.text, item.fx, 20000, item.voice).catch(() => null);
    this.q.push(item);
    this.q.sort((a, b) => b.priority - a.priority);
    // Giữ hàng đợi ngắn: nếu đầy, bỏ câu ưu tiên thấp nhất
    if (this.q.length > 6) this.q.length = 6;
  }

  /** Bỏ các câu còn chờ của một sự kiện (sự kiện bị thay / kết thúc). */
  dropTag(tag: string) { this.q = this.q.filter((i) => i.tag !== tag); }

  async tick() {
    const now = Date.now();
    if (this.dispatching || now < this.busyUntil) return;
    this.q = this.q.filter((i) => now - i.enqueuedAt! < i.ttl!);
    if (!this.q.length) return;
    this.history = this.history.filter((t) => now - t < 60000);
    const head = this.q[0];
    if (this.history.length >= this.perMinute && head.priority < 3) return;
    this.q.shift();
    this.history.push(now);
    this.dispatching = true;
    try {
      // chờ tối đa 3,5s cho file giọng; quá thì chỉ hiện chữ
      const audio = await Promise.race([head.audio!, new Promise<null>((r) => setTimeout(() => r(null), 3500))]);
      const ms = audio?.ms ? audio.ms + 200 : estimateMs(head.text);
      this.busyUntil = Date.now() + ms + 900; // nghỉ một nhịp giữa các câu
      this.send({ t: 'say', text: head.text, ms, audioUrl: audio?.url, lookAt: head.lookAt, fx: head.fx, speaker: head.speaker });
      this.onDispatch(Date.now() - head.enqueuedAt!);
    } finally { this.dispatching = false; }
  }
}

/** Ước lượng thời lượng đọc tiếng Việt ~ 5 âm tiết/giây. */
export function estimateMs(text: string) {
  const syllables = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1800, Math.min(12000, syllables * 210 + 600));
}
