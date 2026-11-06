import type { VoiceFx } from '../../shared/protocol';

/**
 * Âm thanh màn hình live (Web Audio):
 *  - phát file giọng chủ tiệc, áp hiệu ứng "ông cụ" (lọc + vang), đo âm lượng để mấp máy miệng
 *  - tiếng nền bữa tiệc tự tạo (xì xào + tiếng cụng ly), không cần file
 *  - dự phòng: đọc bằng speechSynthesis của trình duyệt khi chọn nhà cung cấp "Trình duyệt"
 */
export class PartyAudio {
  private ctx?: AudioContext;
  private voiceGain?: GainNode;
  private ambGain?: GainNode;
  private analyser?: AnalyserNode;
  private data?: Float32Array<ArrayBuffer>;
  private current?: AudioBufferSourceNode;
  private buffers = new Map<string, AudioBuffer>();
  private reverb?: ConvolverNode;
  private ambNodes: AudioNode[] = [];
  private clinkTimer = 0;
  private speakingUntil = 0;
  private fakeTalk = false;

  voiceVolume = 0.9;
  ambienceOn = false;
  ambienceVolume = 0.3;

  /** Trình duyệt chặn tự phát tiếng → cần 1 cú bấm. (OBS / cửa sổ live đã bật cờ cho phép.) */
  get needsUnlock() { return !this.ctx || this.ctx.state !== 'running'; }

  init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = this.voiceVolume;
    this.voiceGain.connect(ctx.destination);
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0;
    this.ambGain.connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.voiceGain);
    this.data = new Float32Array(this.analyser.fftSize);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 1.6, 2.5);
    this.applyAmbience();
  }

  async unlock() { this.init(); await this.ctx!.resume().catch(() => {}); this.applyAmbience(); }

  setVolumes(voice: number, ambienceOn: boolean, ambience: number) {
    this.voiceVolume = voice; this.ambienceOn = ambienceOn; this.ambienceVolume = ambience;
    if (this.voiceGain) this.voiceGain.gain.value = voice;
    this.applyAmbience();
  }

  /** Mức âm lượng giọng hiện tại 0..1 (để vẽ miệng). */
  level(): number {
    if (this.fakeTalk) return Date.now() < this.speakingUntil ? 0.35 + 0.35 * Math.abs(Math.sin(Date.now() / 90)) : 0;
    if (!this.analyser || !this.data || Date.now() > this.speakingUntil) return 0;
    this.analyser.getFloatTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) sum += this.data[i] * this.data[i];
    return Math.min(1, Math.sqrt(sum / this.data.length) * 6);
  }

  /** Phát file giọng; trả về thời lượng (ms) hoặc 0 nếu lỗi. */
  async playVoice(url: string, fx: VoiceFx): Promise<number> {
    this.init();
    const ctx = this.ctx!;
    try {
      let buf = this.buffers.get(url);
      if (!buf) {
        const res = await fetch(url);
        buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(url, buf);
        if (this.buffers.size > 60) this.buffers.delete(this.buffers.keys().next().value!);
      }
      try { this.current?.stop(); } catch { /* đã dừng */ }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      if (fx === 'old') {
        // ông cụ: chậm & trầm thêm chút, cắt bớt tần thấp/cao, thêm vang phòng
        src.playbackRate.value = 0.94;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
        const wet = ctx.createGain(); wet.gain.value = 0.32;
        src.connect(hp).connect(lp);
        lp.connect(this.analyser!);
        lp.connect(this.reverb!); this.reverb!.connect(wet).connect(this.analyser!);
        src.onended = () => { try { this.reverb!.disconnect(); } catch { /* bỏ qua */ } };
      } else {
        src.connect(this.analyser!);
      }
      src.start();
      this.current = src;
      this.fakeTalk = false;
      const ms = (buf.duration / src.playbackRate.value) * 1000;
      this.speakingUntil = Date.now() + ms;
      return ms;
    } catch {
      return 0;
    }
  }

  /** Dự phòng: giọng có sẵn của Windows/trình duyệt. */
  speakBrowser(text: string, fx: VoiceFx) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = fx === 'old' ? 0.85 : 1.0;
    u.pitch = fx === 'old' ? 0.6 : 0.85;
    u.volume = this.voiceVolume;
    const vi = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('vi'));
    if (vi) u.voice = vi;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    this.talkFor(Math.max(1500, text.split(/\s+/).length * 260));
  }

  /** Mấp máy miệng giả khi không có âm thanh phân tích được. */
  talkFor(ms: number) { this.fakeTalk = true; this.speakingUntil = Date.now() + ms; }

  // ---------- tiếng nền ----------
  private applyAmbience() {
    if (!this.ctx || !this.ambGain) return;
    const on = this.ambienceOn && this.ctx.state === 'running';
    this.ambGain.gain.setTargetAtTime(on ? this.ambienceVolume * 0.5 : 0, this.ctx.currentTime, 0.4);
    if (on && !this.ambNodes.length) this.startAmbience();
    if (!on) clearTimeout(this.clinkTimer);
    else if (!this.clinkTimer) this.scheduleClink();
  }

  private startAmbience() {
    const ctx = this.ctx!;
    // xì xào: nhiễu nâu lọc dải giọng nói, âm lượng lên xuống chậm
    const noise = ctx.createBufferSource();
    noise.buffer = brownNoise(ctx, 6);
    noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 450; bp.Q.value = 0.6;
    const wobble = ctx.createGain(); wobble.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.15;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.25;
    lfo.connect(lfoAmt).connect(wobble.gain);
    noise.connect(bp).connect(wobble).connect(this.ambGain!);
    noise.start(); lfo.start();
    this.ambNodes = [noise, bp, wobble, lfo, lfoAmt];
  }

  private scheduleClink() {
    this.clinkTimer = window.setTimeout(() => {
      this.clinkTimer = 0;
      if (!this.ambienceOn || !this.ctx || this.ctx.state !== 'running') return;
      this.clink();
      this.scheduleClink();
    }, 2500 + Math.random() * 6000);
  }

  /** Tiếng cụng ly / chạm bát: vài sóng sin cao tắt nhanh. */
  private clink() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = Math.random() < 0.4 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const start = t + k * 0.09;
      for (const f of [2300 + Math.random() * 900, 4100 + Math.random() * 700]) {
        const o = ctx.createOscillator(); o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.18, start + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
        o.connect(g).connect(this.ambGain!);
        o.start(start); o.stop(start + 0.4);
      }
    }
  }
}

function brownNoise(ctx: AudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
