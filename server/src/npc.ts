// Khung NPC (nhân vật phụ hư cấu): chú Quang, chú Chực.
// NPC bình thường đứng ngoài cổng (không có trong sân). Server ra lệnh đi tới đâu, màn hình live
// đi theo lối đi rồi báo "đã tới"; quá hạn mà không ai báo (chưa mở màn hình live) thì tự coi như đã tới.
import type { NpcDTO, NpcId, NpcTarget, ServerMsg } from '../../shared/protocol.js';

interface NpcState {
  id: NpcId;
  name: string;
  present: boolean;
  target: NpcTarget;
  token: number;
  walking: boolean;
  deadline: number;
  onArrive?: () => void;
}

export const NPC_NAMES: Record<NpcId, string> = { quang: 'Chú Quang', chuc: 'Chú Chực' };

export class NpcManager {
  private npcs = new Map<NpcId, NpcState>();
  private token = 0;

  constructor(private broadcast: (m: ServerMsg) => void) {
    setInterval(() => this.tick(), 500).unref();
  }

  isPresent(id: NpcId) { return !!this.npcs.get(id)?.present; }
  target(id: NpcId) { return this.npcs.get(id)?.target; }

  /** Gọi NPC vào sân (từ cổng) và đi tới target. */
  spawn(id: NpcId, target: NpcTarget, onArrive?: () => void) {
    const st: NpcState = { id, name: NPC_NAMES[id], present: true, target, token: ++this.token, walking: true, deadline: 0, onArrive };
    st.deadline = Date.now() + 16000;
    this.npcs.set(id, st);
    this.broadcast({ t: 'npc', id, action: 'spawn', target, token: st.token, name: st.name });
  }

  goto(id: NpcId, target: NpcTarget, onArrive?: () => void) {
    const st = this.npcs.get(id);
    if (!st?.present) return this.spawn(id, target, onArrive);
    Object.assign(st, { target, token: ++this.token, walking: true, deadline: Date.now() + 14000, onArrive });
    this.broadcast({ t: 'npc', id, action: 'goto', target, token: st.token, name: st.name });
  }

  /** NPC đi ra cổng rồi biến mất. */
  leave(id: NpcId) {
    const st = this.npcs.get(id);
    if (!st?.present) return;
    st.present = false;
    st.walking = false;
    st.onArrive = undefined;
    this.broadcast({ t: 'npc', id, action: 'leave', target: { kind: 'gate' }, token: ++this.token, name: st.name });
  }

  arrived(id: NpcId, token: number) {
    const st = this.npcs.get(id);
    if (st && st.walking && st.token === token) this.arrive(st);
  }

  dto(): NpcDTO[] {
    return [...this.npcs.values()].filter((n) => n.present).map((n) => ({ id: n.id, name: n.name, target: n.target }));
  }

  private arrive(st: NpcState) {
    st.walking = false;
    const cb = st.onArrive;
    st.onArrive = undefined;
    cb?.();
  }

  private tick() {
    const now = Date.now();
    for (const st of this.npcs.values()) if (st.present && st.walking && now > st.deadline) this.arrive(st);
  }
}
