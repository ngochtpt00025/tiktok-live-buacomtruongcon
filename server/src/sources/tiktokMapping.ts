// Chuẩn hoá payload tiktok-live-connector 2.5.0 -> sự kiện nội bộ.
// Học từ avatar-arena (server/tiktokMapping.js + events.js): đọc nhiều tên trường dự phòng,
// bỏ gói trùng theo msgId, và cộng quà combo NGAY ở từng nhịp (chỉ phần tăng thêm).

export interface LiveUser { id: string; name: string; avatar: string }

export type LiveEvent = (
  | { type: 'chat'; user: LiveUser; text: string; msgId?: string }
  | { type: 'like'; user: LiveUser; count: number; msgId?: string }
  | { type: 'member'; user: LiveUser; msgId?: string }
  | { type: 'social'; user: LiveUser; kind: 'follow' | 'share'; msgId?: string }
  | { type: 'gift'; user: LiveUser; msgId?: string; gift: RawGift }
) & { createTime?: number };

export interface RawGift {
  id?: number;
  name: string;
  unitCoins: number;
  repeatCount: number;
  repeatEnd: boolean;
  combo: boolean;
  groupId?: string;
}

/** Quà sau khi lọc: `count` là số lượng TĂNG THÊM ở nhịp này. */
export interface GiftEvent { type: 'gift'; user: LiveUser; name: string; count: number; coins: number; createTime?: number }

const firstStr = (...vals: unknown[]) => {
  for (const v of vals) if (v !== undefined && v !== null && String(v) !== '' && String(v) !== '0') return String(v);
  return '';
};

/** Id ổn định: ưu tiên userId số (không đổi khi đổi username). */
export function mapUser(u: any): LiveUser | null {
  const raw = firstStr(u?.userId, u?.idStr, u?.id, u?.uniqueId, u?.displayId);
  if (!raw) return null;
  return {
    id: `tt:${raw}`,
    name: u?.nickname || u?.uniqueId || u?.displayId || 'Khách',
    avatar: u?.profilePicture?.url?.[0] || u?.profilePicture?.urlList?.[0] || u?.avatarThumb?.urlList?.[0] || u?.profilePictureUrl || '',
  };
}

const msgIdOf = (d: any) => firstStr(d?.common?.msgId, d?.msgId) || undefined;

export function mapTikTokEvent(type: 'chat' | 'like' | 'member' | 'follow' | 'share' | 'gift', d: any): LiveEvent | null {
  const user = mapUser(d?.user ?? d);
  if (!user) return null;
  const msgId = msgIdOf(d);
  const ct = Number(d?.common?.createTime ?? d?.createTime ?? 0);
  const e = mapInner(type, d, user, msgId);
  if (e && ct > 1e12) e.createTime = ct; // ms epoch
  return e;
}

function mapInner(type: Parameters<typeof mapTikTokEvent>[0], d: any, user: LiveUser, msgId: string | undefined): LiveEvent | null {
  switch (type) {
    case 'chat': return { type: 'chat', user, msgId, text: String(d.comment ?? d.content ?? '') };
    case 'like': return { type: 'like', user, msgId, count: Number(d.likeCount ?? d.count ?? 1) || 1 };
    case 'member': return { type: 'member', user, msgId };
    case 'follow': return { type: 'social', user, msgId, kind: 'follow' };
    case 'share': return { type: 'social', user, msgId, kind: 'share' };
    case 'gift': {
      const g = d.gift || {}, gd = d.giftDetails || {}, ext = d.extendedGiftInfo || {};
      const giftType = g.type ?? gd.giftType ?? ext.type ?? d.giftType;
      const id = d.giftId ?? g.id ?? gd.id ?? ext.id;
      return {
        type: 'gift', user, msgId,
        gift: {
          id: id === undefined ? undefined : Number(id),
          name: g.name || gd.giftName || ext.name || d.giftName || 'quà',
          unitCoins: Number(g.diamondCount || gd.diamondCount || ext.diamond_count || d.diamondCount || 1),
          repeatCount: Number(d.repeatCount || 1),
          repeatEnd: !!Number(d.repeatEnd ?? 0) || d.repeatEnd === true,
          combo: !!(g.combo ?? gd.combo ?? giftType === 1),
          groupId: firstStr(d.groupId) || undefined,
        },
      };
    }
  }
}

/**
 * Bộ lọc: bỏ gói trùng (msgId) và tính phần tăng thêm của quà combo.
 * Trả về null nếu sự kiện bị bỏ.
 */
export function createEventFilter(now: () => number = Date.now) {
  const seen = new Map<string, number>();
  const combos = new Map<string, { count: number; time: number }>();
  return (e: LiveEvent): Exclude<LiveEvent, { type: 'gift' }> | GiftEvent | null => {
    const t = now();
    for (const m of [seen, combos] as Map<string, any>[]) {
      for (const [k, v] of m) { if (t - (typeof v === 'number' ? v : v.time) > 120000) m.delete(k); else break; }
      while (m.size > 4000) m.delete(m.keys().next().value!);
    }
    if (e.msgId) {
      const key = e.type + ':' + e.msgId;
      if (seen.has(key)) return null;
      seen.set(key, t);
    }
    if (e.type !== 'gift') return e;
    const g = e.gift;
    const key = `${e.user.id}:${g.id ?? g.name}:${g.groupId || '-'}`;
    let count = Math.max(1, Math.min(10000, g.repeatCount || 1));
    if (g.combo) {
      const prev = combos.get(key);
      // combo mới nếu số đếm tụt xuống hoặc đã im > 8 giây (khi không có groupId)
      const base = prev && count >= prev.count && (g.groupId || t - prev.time < 8000) ? prev.count : 0;
      if (g.repeatEnd) combos.delete(key); else combos.set(key, { count: Math.max(count, base), time: t });
      count -= base;
    }
    if (count <= 0) return null;
    return { type: 'gift', user: e.user, name: g.name, count, coins: count * Math.max(1, g.unitCoins || 1), createTime: e.createTime };
  };
}
