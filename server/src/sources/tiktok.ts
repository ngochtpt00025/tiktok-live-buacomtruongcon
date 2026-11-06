// Adapter tiktok-live-connector (thư viện KHÔNG chính thức).
// Theo mẫu avatar-arena: chỉ kết nối khi bấm nút trên bảng điều khiển, có bộ đếm "gen" để bỏ
// sự kiện của lần kết nối cũ, tự thử lại sau 5, 10, 20 rồi mỗi 30 giây. Không dùng mật khẩu/cookie.
import type { LiveStateDTO } from '../../../shared/protocol.js';
import { mapTikTokEvent, type LiveEvent } from './tiktokMapping.js';

export interface LiveAdapter {
  start(username: string): Promise<void>;
  stop(): Promise<void>;
  state(): LiveStateDTO;
}

/** Chấp nhận "ten_kenh", "@ten_kenh" hoặc link https://www.tiktok.com/@ten_kenh/live */
export function parseUsername(input: string): string {
  return String(input || '').trim().replace(/^.*tiktok\.com\/@?/i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
}

export function isValidUsername(u: string) { return /^[A-Za-z0-9._]{2,24}$/.test(u); }

export function createTikTokAdapter(opts: {
  emit: (e: LiveEvent) => void;
  onStatus: (s: LiveStateDTO) => void;
  log: (msg: string) => void;
}): LiveAdapter {
  let conn: any = null;
  let gen = 0;
  let tries = 0;
  let timer: NodeJS.Timeout | undefined;
  let state: LiveStateDTO = { status: 'idle', uniqueId: '' };

  const setState = (s: Partial<LiveStateDTO>) => { state = { ...state, ...s }; opts.onStatus(state); };

  async function connect(input: string, retrying = false) {
    const uniqueId = parseUsername(input);
    if (!isValidUsername(uniqueId)) throw new Error('Tên TikTok không hợp lệ');
    await disconnect(retrying);
    const my = ++gen;
    setState({ status: 'connecting', uniqueId, error: '', roomId: '' });
    try {
      const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector');
      // extendedGiftInfo cần gói sign-server trả phí; payload quà đã có tên + số xu
      const raw: any = new TikTokLiveConnection(uniqueId, { enableExtendedGiftInfo: false, processInitialData: false });
      const on = (ev: string, type: Parameters<typeof mapTikTokEvent>[0]) =>
        raw.on(ev, (d: any) => {
          if (my !== gen) return;
          const e = mapTikTokEvent(type, d);
          if (e) opts.emit(e);
        });
      on(WebcastEvent.CHAT, 'chat');
      on(WebcastEvent.GIFT, 'gift');
      on(WebcastEvent.LIKE, 'like');
      on(WebcastEvent.MEMBER, 'member');
      if ((WebcastEvent as any).FOLLOW) on((WebcastEvent as any).FOLLOW, 'follow');
      if ((WebcastEvent as any).SHARE) on((WebcastEvent as any).SHARE, 'share');
      raw.on(ControlEvent.DISCONNECTED, () => {
        if (my !== gen) return;
        setState({ status: 'disconnected' });
        opts.log('TikTok: mất kết nối');
        scheduleReconnect(uniqueId, my);
      });
      raw.on(ControlEvent.ERROR, (e: any) => { if (my === gen) opts.log('TikTok lỗi: ' + (e?.info || e?.exception?.message || e?.message || e)); });
      raw.on(WebcastEvent.STREAM_END, () => { if (my === gen) opts.log('Live đã kết thúc'); });

      const st = await raw.connect();
      if (my !== gen) { raw.disconnect().catch(() => {}); return; }
      conn = raw;
      tries = 0;
      setState({ status: 'connected', roomId: String(st?.roomId || '') });
      opts.log(`Đã kết nối live @${uniqueId}`);
    } catch (e: any) {
      if (my !== gen) return;
      const msg = String(e?.message || e);
      setState({ status: 'error', error: msg });
      opts.log(`Không kết nối được @${uniqueId}: ${msg}`);
      scheduleReconnect(uniqueId, my);
    }
  }

  function scheduleReconnect(uniqueId: string, my: number) {
    clearTimeout(timer);
    const wait = Math.min(30, 5 * 2 ** Math.min(tries, 3));
    tries++;
    opts.log(`Tự kết nối lại sau ${wait} giây (lần ${tries})`);
    timer = setTimeout(() => { if (my === gen) void connect(uniqueId, true); }, wait * 1000);
  }

  async function disconnect(retrying = false) {
    gen++;
    if (!retrying) { clearTimeout(timer); tries = 0; }
    if (conn) { try { await conn.disconnect(); } catch { /* bỏ qua */ } conn = null; }
    if (!retrying) setState({ status: 'idle', uniqueId: '', error: '', roomId: '' });
  }

  return {
    start: (u) => connect(u),
    stop: () => disconnect(),
    state: () => state,
  };
}
