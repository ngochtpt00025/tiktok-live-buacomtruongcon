import {
  COUNTER_NODE, GATE_NODE, HOST_COUNTER_SPOT, HOST_REST_SPOT, STAGE_GUEST_SPOT, STAGE_NPC_SPOT, npcVisitPos, STAGE_NODE, HOST_STAGE_SPOT, counterSpot, hostVisitPos, seatPos,
  shortestPath, tableCornerNode, waitingNode, waitingPos, type Pt,
} from '../../shared/layout';
import type { HostTarget, NpcTarget } from '../../shared/protocol';

export interface Dest { pos: Pt; anchor: number }

export function guestDest(table: number, seat: number): Dest {
  if (table < 0) return { pos: waitingPos(seat), anchor: waitingNode() };
  const pos = seatPos(table, seat);
  return { pos, anchor: tableCornerNode(table, pos) };
}

export function hostDest(t: HostTarget): Dest {
  if (t.kind === 'stage') return { pos: HOST_STAGE_SPOT, anchor: STAGE_NODE };
  if (t.kind === 'counter') return { pos: HOST_COUNTER_SPOT, anchor: COUNTER_NODE };
  if (t.kind === 'rest') return { pos: HOST_REST_SPOT, anchor: STAGE_NODE };
  const pos = hostVisitPos(t.table);
  return { pos, anchor: tableCornerNode(t.table, pos) };
}

export function counterDest(index: number): Dest { return { pos: counterSpot(index), anchor: COUNTER_NODE }; }
export const stageGuestDest: Dest = { pos: STAGE_GUEST_SPOT, anchor: STAGE_NODE };

export function npcDest(t: NpcTarget): Dest {
  if (t.kind === 'stage') return { pos: STAGE_NPC_SPOT, anchor: STAGE_NODE };
  if (t.kind === 'gate') return gateDest;
  const pos = npcVisitPos(t.table);
  return { pos, anchor: tableCornerNode(t.table, pos) };
}

export const gateDest: Dest = { pos: { x: 540, y: 1960 }, anchor: GATE_NODE };

/** Đường đi: từ nút hiện tại theo lối đi tới nút đích, rồi vào vị trí đích. */
export function route(fromAnchor: number, to: Dest): Pt[] {
  return [...shortestPath(fromAnchor, to.anchor), to.pos];
}
