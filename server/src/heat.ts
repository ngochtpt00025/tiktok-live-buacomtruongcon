// "Độ náo nhiệt" của sân (0–100): một con số để chủ tiệc, Event Director và NPC tự điều chỉnh theo độ đông.
// Hệ số là mốc khởi điểm — chỉnh theo báo cáo phiên live thật.
import type { HeatDTO, HeatLevel } from '../../shared/protocol.js';

export interface HeatInputs {
  chatPer10s: number;
  guests: number;
  joinsPerMin: number;
  eventActionsPerMin: number;
}

export const HEAT_WEIGHTS = { chat: 0.35, guests: 0.25, joins: 0.2, events: 0.2 };
export const HEAT_NORM = { chatPer10s: 20, guests: 40, joinsPerMin: 8, eventActionsPerMin: 15 };

export function rawHeat(i: HeatInputs): number {
  const c = (v: number, n: number) => Math.min(1, Math.max(0, v / n));
  return 100 * (
    HEAT_WEIGHTS.chat * c(i.chatPer10s, HEAT_NORM.chatPer10s)
    + HEAT_WEIGHTS.guests * c(i.guests, HEAT_NORM.guests)
    + HEAT_WEIGHTS.joins * c(i.joinsPerMin, HEAT_NORM.joinsPerMin)
    + HEAT_WEIGHTS.events * c(i.eventActionsPerMin, HEAT_NORM.eventActionsPerMin)
  );
}

export function heatLevel(v: number): HeatLevel {
  return v < 20 ? 'vang' : v < 50 ? 'am' : v < 80 ? 'dong' : 'bungno';
}

export const HEAT_LABEL: Record<HeatLevel, string> = { vang: 'Vắng', am: 'Ấm', dong: 'Đông', bungno: 'Bùng nổ' };

/** Trung bình trượt để con số không nhảy lung tung; có độ trễ khi đổi mức để tránh dao động qua lại. */
export class Heat {
  value = 0;
  level: HeatLevel = 'vang';
  private joins: number[] = [];
  private eventActions: number[] = [];

  join() { this.joins.push(Date.now()); }
  eventAction() { this.eventActions.push(Date.now()); }

  update(chatPer10s: number, guests: number): HeatDTO {
    const now = Date.now();
    this.joins = this.joins.filter((t) => now - t < 60000);
    this.eventActions = this.eventActions.filter((t) => now - t < 60000);
    const raw = rawHeat({ chatPer10s, guests, joinsPerMin: this.joins.length, eventActionsPerMin: this.eventActions.length });
    this.value = this.value * 0.7 + raw * 0.3;
    // đổi mức chỉ khi vượt ngưỡng ±3 (tránh chập chờn ở đúng ngưỡng)
    const next = heatLevel(this.value);
    if (next !== this.level) {
      const order: HeatLevel[] = ['vang', 'am', 'dong', 'bungno'];
      const up = order.indexOf(next) > order.indexOf(this.level);
      const probe = heatLevel(this.value + (up ? -3 : 3));
      if (probe === next) this.level = next;
    }
    return this.dto();
  }

  dto(): HeatDTO { return { value: Math.round(this.value), level: this.level }; }
}
