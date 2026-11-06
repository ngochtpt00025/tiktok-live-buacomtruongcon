// Các nhà cung cấp TTS. Tất cả trả về Buffer MP3.
// Đây đều là GIỌNG CÓ SẴN của nhà cung cấp — dự án không clone giọng người thật.
import type { TtsProviderId, TtsSettings } from '../../../shared/protocol.js';

export interface SynthOpts { rate: number; pitch: number }
export type Secrets = Partial<Record<'googleKey' | 'fptKey' | 'elevenKey' | 'anthropicKey' | 'openaiKey', string>>;

export interface TtsProvider {
  id: TtsProviderId;
  label: string;
  defaultVoice: string;
  voices: string[];
  /** Tốc độ bit cố định nếu biết (để tính thời lượng nhanh); không bắt buộc */
  synth(text: string, voice: string, o: SynthOpts, secrets: Secrets): Promise<Buffer>;
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v)}%`;

async function fetchOk(url: string, init: RequestInit, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------------------
// Microsoft Edge "Read aloud" (miễn phí, không cần key, thư viện KHÔNG chính thức)
// ---------------------------------------------------------------------------
const edge: TtsProvider = {
  id: 'edge',
  label: 'Edge (miễn phí)',
  defaultVoice: 'vi-VN-NamMinhNeural',
  voices: ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'],
  async synth(text, voice, o) {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice || this.defaultVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(text), { rate: pct(o.rate), pitch: pct(o.pitch) });
      return await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const timer = setTimeout(() => reject(new Error('Edge TTS quá thời gian')), 15000);
        audioStream.on('data', (c: Buffer) => chunks.push(c));
        audioStream.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
        audioStream.on('end', () => {
          clearTimeout(timer);
          const b = Buffer.concat(chunks);
          b.length ? resolve(b) : reject(new Error('Edge TTS trả về rỗng'));
        });
      });
    } finally { try { tts.close(); } catch { /* bỏ qua */ } }
  },
};

// ---------------------------------------------------------------------------
// Google Cloud Text-to-Speech (cần API key, có gói miễn phí hằng tháng)
// ---------------------------------------------------------------------------
const google: TtsProvider = {
  id: 'google',
  label: 'Google Cloud',
  defaultVoice: 'vi-VN-Neural2-D',
  voices: ['vi-VN-Neural2-D', 'vi-VN-Wavenet-D', 'vi-VN-Wavenet-B', 'vi-VN-Standard-D', 'vi-VN-Standard-B'],
  async synth(text, voice, o, s) {
    if (!s.googleKey) throw new Error('Chưa có Google API key');
    const res = await fetchOk(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(s.googleKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'vi-VN', name: voice || this.defaultVoice },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: Math.max(0.25, Math.min(4, 1 + o.rate / 100)),
          pitch: Math.max(-20, Math.min(20, (o.pitch / 100) * 20)),
        },
      }),
    });
    const j = (await res.json()) as { audioContent?: string };
    if (!j.audioContent) throw new Error('Google TTS không trả audio');
    return Buffer.from(j.audioContent, 'base64');
  },
};

// ---------------------------------------------------------------------------
// FPT.AI TTS v5 (cần API key). Trả về link file, file sẵn sàng sau vài giây.
// ---------------------------------------------------------------------------
const fpt: TtsProvider = {
  id: 'fpt',
  label: 'FPT.AI',
  defaultVoice: 'leminh',
  voices: ['leminh', 'minhquang', 'giahuy', 'banmai', 'thuminh'],
  async synth(text, voice, o, s) {
    if (!s.fptKey) throw new Error('Chưa có FPT.AI API key');
    const speed = String(Math.max(-3, Math.min(3, Math.round(o.rate / 15))));
    const res = await fetchOk('https://api.fpt.ai/hmi/tts/v5', {
      method: 'POST',
      headers: { 'api-key': s.fptKey, voice: voice || this.defaultVoice, speed, format: 'mp3' },
      body: text,
    });
    const j = (await res.json()) as { async?: string; error?: number; message?: string };
    if (!j.async) throw new Error(`FPT.AI lỗi: ${j.message ?? j.error}`);
    // chờ file sẵn sàng
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, i < 4 ? 500 : 1000));
      const f = await fetch(j.async).catch(() => null);
      if (f && f.ok) {
        const b = Buffer.from(await f.arrayBuffer());
        if (b.length > 1000) return b;
      }
    }
    throw new Error('FPT.AI: file âm thanh chưa sẵn sàng');
  },
};

// ---------------------------------------------------------------------------
// ElevenLabs (cần API key). Dùng giọng CÓ SẴN trong thư viện ElevenLabs (voice_id).
// ---------------------------------------------------------------------------
const elevenlabs: TtsProvider = {
  id: 'elevenlabs',
  label: 'ElevenLabs (giọng có sẵn)',
  defaultVoice: '',
  voices: [],
  async synth(text, voice, o, s) {
    if (!s.elevenKey) throw new Error('Chưa có ElevenLabs API key');
    if (!voice) throw new Error('Cần nhập voice_id (chọn một giọng có sẵn trong Voice Library)');
    const res = await fetchOk(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': s.elevenKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        language_code: 'vi',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: Math.max(0.7, Math.min(1.2, 1 + o.rate / 100)) },
      }),
    });
    return Buffer.from(await res.arrayBuffer());
  },
};

export const PROVIDERS: Partial<Record<TtsProviderId, TtsProvider>> = { edge, google, fpt, elevenlabs };

export function defaultTts(): TtsSettings {
  return { provider: 'edge', voice: 'vi-VN-NamMinhNeural', rate: -8, pitch: -6 };
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}
