import type { ClientMsg, ClientRole, ServerMsg } from '../../../shared/protocol';

/** WebSocket tự kết nối lại. Dev: Vite proxy /ws -> :8787. Live: server phục vụ cả trang lẫn /ws. */
export class Socket {
  private ws?: WebSocket;
  private handlers: ((m: ServerMsg) => void)[] = [];
  private statusHandlers: ((up: boolean) => void)[] = [];
  private delay = 1000;

  constructor(private role: ClientRole, private url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`) {
    this.open();
  }

  onMessage(h: (m: ServerMsg) => void) { this.handlers.push(h); }
  onStatus(h: (up: boolean) => void) { this.statusHandlers.push(h); }

  send(m: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  private open() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.delay = 1000;
      this.send({ t: 'hello', role: this.role });
      this.statusHandlers.forEach((h) => h(true));
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try { m = JSON.parse(e.data); } catch { return; }
      for (const h of this.handlers) h(m);
    };
    ws.onclose = () => {
      this.statusHandlers.forEach((h) => h(false));
      setTimeout(() => this.open(), this.delay);
      this.delay = Math.min(this.delay * 2, 10000);
    };
  }
}
