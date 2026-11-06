import { TABLE_COUNT } from '../../shared/layout.js';
import type { BondDTO } from '../../shared/protocol.js';

/**
 * Điểm "Tình nghĩa" theo mâm (0..100). Đầy 100 → mâm được 1 sao, điểm quay về 0.
 * Không phụ thuộc chi tiền: comment miễn phí là nguồn điểm chính, quà chỉ cộng thêm có giới hạn.
 */
export class Bond {
  score = new Array<number>(TABLE_COUNT).fill(0);
  stars = new Array<number>(TABLE_COUNT).fill(0);
  dirty = true;

  constructor(private onFull: (table: number, stars: number) => void) {}

  add(table: number, pts: number) {
    if (table < 0 || table >= TABLE_COUNT || pts <= 0) return;
    this.score[table] += pts;
    this.dirty = true;
    while (this.score[table] >= 100) {
      this.score[table] -= 100;
      this.stars[table]++;
      this.onFull(table, this.stars[table]);
    }
  }

  reset() { this.score.fill(0); this.stars.fill(0); this.dirty = true; }

  dto(): BondDTO { return { score: this.score.map((s) => Math.round(s)), stars: [...this.stars] }; }
}
