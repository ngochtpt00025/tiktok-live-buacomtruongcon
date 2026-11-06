// Bố cục sân tiệc 1080x1920 (9:16). Dùng chung cho server (đếm ghế) và client (vẽ + tìm đường).

export const W = 1080;
export const H = 1920;

export const TABLE_COLS = [220, 540, 860];
export const TABLE_ROWS = [660, 1020, 1380];
export const TABLE_COUNT = TABLE_COLS.length * TABLE_ROWS.length; // 9 mâm
export const SEATS_PER_TABLE = 8;
export const TABLE_RADIUS = 68;
export const SEAT_RADIUS = 106;

export const STAGE = { x: 240, y: 200, w: 600, h: 250 };
export const HOST_STAGE_SPOT = { x: 540, y: 432 };
export const GATE = { x: 540, y: 1830 };
/** Quầy thanh toán (góc phải bục) — dùng cho sự kiện "Anh thanh toán rồi". */
export const COUNTER = { x: 965, y: 300 };
export const HOST_COUNTER_SPOT = { x: 890, y: 350 };
/** Chỗ khách đứng phát biểu cạnh chủ tiệc trên bục. */
export const STAGE_GUEST_SPOT = { x: 640, y: 440 };
/** Chỗ NPC (chú Quang) đứng trên bục, bên trái chủ tiệc */
export const STAGE_NPC_SPOT = { x: 420, y: 440 };
/** Ghế nghỉ của chủ tiệc ("đau đầu") ở mép trái bục */
export const HOST_REST_SPOT = { x: 300, y: 425 };
/** Đĩa gà luộc trên bục */
export const GA_SPOT = { x: 720, y: 400 };

export interface Pt { x: number; y: number }

export function tablePos(table: number): Pt {
  const col = table % TABLE_COLS.length;
  const row = Math.floor(table / TABLE_COLS.length);
  return { x: TABLE_COLS[col], y: TABLE_ROWS[row] };
}

export function seatPos(table: number, seat: number): Pt {
  const c = tablePos(table);
  const a = (seat / SEATS_PER_TABLE) * Math.PI * 2 - Math.PI / 2 + Math.PI / SEATS_PER_TABLE;
  return { x: c.x + Math.cos(a) * SEAT_RADIUS, y: c.y + Math.sin(a) * SEAT_RADIUS };
}

/** Chỗ đứng cạnh mâm cho chủ tiệc khi ghé thăm (phía dưới mâm, ngoài vòng ghế). */
export function hostVisitPos(table: number): Pt {
  const c = tablePos(table);
  return { x: c.x, y: c.y + SEAT_RADIUS + 52 };
}

/** Số chỗ đứng chờ hiển thị ở cổng; người chờ thứ 31 trở đi đứng ngoài khung hình. */
export const WAITING_VISIBLE = 30;

/** Chỗ NPC đứng khi ghé mâm (phía trên mâm, khác phía với chủ tiệc). */
export function npcVisitPos(table: number): Pt {
  const c = tablePos(table);
  return { x: c.x + 40, y: c.y - SEAT_RADIUS - 48 };
}

/** Vị trí đứng chờ ở cổng khi hết ghế. */
export function waitingPos(index: number): Pt {
  if (index >= WAITING_VISIBLE) return { x: 300 + (index % 10) * 50, y: 2010 };
  const perRow = 10;
  const col = index % perRow;
  const row = Math.floor(index / perRow);
  // chừa khoảng giữa cho cổng
  const x = col < 5 ? 70 + col * 70 : 730 + (col - 5) * 70;
  return { x, y: 1660 + row * 52 };
}

// ---------- Đồ thị lối đi (waypoint graph) ----------
// Lưới lối đi chạy giữa các mâm. Mỗi mâm có 4 góc là nút trên lưới.
const AISLE_X = [60, 380, 700, 1020];
const AISLE_Y = [480, 840, 1200, 1560];

export interface Graph { nodes: Pt[]; edges: number[][] }

function buildGraph(): Graph {
  const nodes: Pt[] = [];
  const edges: number[][] = [];
  const id = (ix: number, iy: number) => iy * AISLE_X.length + ix;
  for (const y of AISLE_Y) for (const x of AISLE_X) { nodes.push({ x, y }); edges.push([]); }
  const link = (a: number, b: number) => { edges[a].push(b); edges[b].push(a); };
  for (let iy = 0; iy < AISLE_Y.length; iy++)
    for (let ix = 0; ix < AISLE_X.length; ix++) {
      if (ix + 1 < AISLE_X.length) link(id(ix, iy), id(ix + 1, iy));
      if (iy + 1 < AISLE_Y.length) link(id(ix, iy), id(ix, iy + 1));
    }
  // Nút giữa hàng dưới cùng + cổng
  const bottomMid = nodes.push({ x: 540, y: AISLE_Y[3] }) - 1; edges.push([]);
  link(bottomMid, id(1, 3)); link(bottomMid, id(2, 3));
  const gate = nodes.push({ ...GATE }) - 1; edges.push([]);
  link(gate, bottomMid);
  // Nút giữa hàng trên + bục
  const topMid = nodes.push({ x: 540, y: AISLE_Y[0] }) - 1; edges.push([]);
  link(topMid, id(1, 0)); link(topMid, id(2, 0));
  const stage = nodes.push({ ...HOST_STAGE_SPOT }) - 1; edges.push([]);
  link(stage, topMid);
  return { nodes, edges };
}

export const GRAPH = buildGraph();
export const GATE_NODE = GRAPH.nodes.length - 3;
export const STAGE_NODE = GRAPH.nodes.length - 1;
const BOTTOM_MID_NODE = GRAPH.nodes.length - 4;

/** Nút lối đi gần nhất (trong 4 góc mâm) với một điểm thuộc mâm đó. */
export function tableCornerNode(table: number, p: Pt): number {
  const col = table % TABLE_COLS.length;
  const row = Math.floor(table / TABLE_COLS.length);
  const xs = [col, col + 1];
  const ys = [row, row + 1];
  let best = -1, bestD = Infinity;
  for (const iy of ys) for (const ix of xs) {
    const n = iy * AISLE_X.length + ix;
    const d = dist2(GRAPH.nodes[n], p);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

export function waitingNode(): number { return BOTTOM_MID_NODE; }

/** Nút lối đi góc trên-phải (gần quầy). */
export const COUNTER_NODE = 3;

/** Chỗ xếp hàng trước quầy cho người tranh trả tiền (tối đa 12 người hiện rõ). */
export function counterSpot(i: number): Pt {
  const k = i % 12;
  const col = k % 4, row = Math.floor(k / 4);
  return { x: 860 + col * 52 + (row % 2) * 20, y: 400 + row * 34 };
}

function dist2(a: Pt, b: Pt) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

/** Dijkstra trên đồ thị nhỏ (~20 nút). Trả về danh sách điểm từ nút a tới nút b. */
export function shortestPath(a: number, b: number): Pt[] {
  const n = GRAPH.nodes.length;
  const d = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  d[a] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || d[i] < d[u])) u = i;
    if (u === -1 || d[u] === Infinity) break;
    done[u] = true;
    if (u === b) break;
    for (const v of GRAPH.edges[u]) {
      const nd = d[u] + Math.sqrt(dist2(GRAPH.nodes[u], GRAPH.nodes[v]));
      if (nd < d[v]) { d[v] = nd; prev[v] = u; }
    }
  }
  const out: Pt[] = [];
  for (let u = b; u !== -1; u = prev[u]) out.unshift(GRAPH.nodes[u]);
  return out;
}
