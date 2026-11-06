// "Paper-doll": phối ngoại hình từ 1 con số seed (hash userId) -> người xem luôn ra cùng một nhân vật.
// Có sprite AI (assets/people.png + people.json) thì ghép lớp theo các chỉ số này; không có thì vẽ hình khối.

export interface Look {
  skin: number;
  shirt: number;
  pants: number;
  hair: number;
  hairStyle: number; // 0 ngắn, 1 dài, 2 đầu đinh, 3 mũ lưỡi trai, 4 mũ phớt
  accessory: number; // 0 không, 1 kính, 2 khăn đỏ, 3 kính râm, 4 cầm bát
  beard?: boolean;
  /** Hoạ tiết áo: caro (chú Quang), ba lỗ (chú Chực) */
  pattern?: 'plaid' | 'tank';
  /** Chỉ số để ghép sprite theo lớp */
  skinIdx: number;
  shirtStyle: number; // 0..3 kiểu áo
  /** Nhân vật vẽ riêng nguyên bộ trong atlas (chủ tiệc, ông cụ, chú Quang, chú Chực) */
  special?: 'host' | 'host_old' | 'quang' | 'chuc';
}

export const SKINS = [0xf2c9a0, 0xe0ac7e, 0xc68a5e, 0xf7d7b5];
export const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0x34495e, 0xff6b9a, 0x16a085, 0xd35400];
export const PANTS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1f3a5f, 0x3e3e3e];
export const HAIRS = [0x1b1b1b, 0x3b2314, 0x5a3a22, 0x7a4b2a];

export function decodeLook(seed: number): Look {
  let s = seed >>> 0;
  const next = (n: number) => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return s % n; };
  const skinIdx = next(SKINS.length);
  return {
    skin: SKINS[skinIdx],
    skinIdx,
    shirt: SHIRTS[next(SHIRTS.length)],
    pants: PANTS[next(PANTS.length)],
    hair: HAIRS[next(HAIRS.length)],
    hairStyle: next(4),
    accessory: next(6) < 4 ? 0 : 1 + next(2),
    shirtStyle: next(4),
  };
}

export const HOST_LOOK: Look = { skin: 0xe0ac7e, skinIdx: 1, shirt: 0xffffff, pants: 0x222222, hair: 0x111111, hairStyle: 2, accessory: 0, shirtStyle: 0, special: 'host' };
/** Chủ tiệc hoá "ông cụ": tóc bạc, kính, râu, áo nâu */
export const HOST_OLD_LOOK: Look = { skin: 0xe0ac7e, skinIdx: 1, shirt: 0x8d6e63, pants: 0x3e2723, hair: 0xe8e8e8, hairStyle: 0, accessory: 1, beard: true, shirtStyle: 0, special: 'host_old' };
/** Chú Quang (hư cấu): mũ phớt, kính râm, áo caro */
export const QUANG_LOOK: Look = { skin: 0xe0ac7e, skinIdx: 1, shirt: 0x2f6fb5, pants: 0x3e3e3e, hair: 0x5d4037, hairStyle: 4, accessory: 3, pattern: 'plaid', shirtStyle: 1, special: 'quang' };
/** Chú Chực (hư cấu): áo ba lỗ, cầm bát đũa */
export const CHUC_LOOK: Look = { skin: 0xc68a5e, skinIdx: 2, shirt: 0xf4f4f4, pants: 0x5d4037, hair: 0x1b1b1b, hairStyle: 0, accessory: 4, pattern: 'tank', shirtStyle: 2, special: 'chuc' };
