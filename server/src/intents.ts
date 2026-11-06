import { readFileSync } from 'node:fs';
import { contentPath } from './paths.js';
import { normalize } from './text.js';

export type Intent =
  | 'JOIN' | 'MOVE_TABLE' | 'LEAVE' | 'CHAO' | 'EAT' | 'BEER' | 'PAYMENT'
  | 'QUANG' | 'REQUEST_FOOD' | 'GREET_HOST' | 'OLD_VOICE' | 'PHOTO'
  | 'TOAST' | 'VOTE' | 'VOTE_AB' | 'TEAR' | 'STORY' | 'INVITE' | 'SHOO'
  // chỉ đến từ tầng 2 (LLM)
  | 'PRAISE_FOOD' | 'CHEER' | 'ASK_HOST';

export interface IntentMatch { intent: Intent; table?: number; value?: number }

interface Rule { intent: Intent; res: RegExp[] }

const file = JSON.parse(readFileSync(contentPath('commands.json'), 'utf8')) as {
  intents: { intent: Intent; patterns: string[] }[];
};
const rules: Rule[] = file.intents.map((r) => ({ intent: r.intent, res: r.patterns.map((p) => new RegExp(p)) }));

/** Chủ đề bình chọn trong sự kiện "Giọng ông cụ": 1, 2, 3 */
export const VOTE_WORDS = ['tinh ban', 'bua com', 'ngay xua'];

/**
 * Tầng 1 — Rule engine. Trả về intent đầu tiên khớp (theo thứ tự ưu tiên trong commands.json).
 * Tầng 2 (LLM phân loại) sẽ cắm vào đây ở MVP 3 cho comment không khớp rule.
 */
export function classify(raw: string): IntentMatch | null {
  const n = normalize(raw);
  if (!n) return null;
  for (const r of rules) {
    for (const re of r.res) {
      const m = n.match(re);
      if (!m) continue;
      if (r.intent === 'MOVE_TABLE') {
        const num = parseInt(m[1], 10);
        if (Number.isFinite(num)) return { intent: 'MOVE_TABLE', table: num - 1 };
        continue;
      }
      if (r.intent === 'VOTE_AB') {
        const ab = n.match(/\b(a|b)$/)?.[1] ?? n.match(/^(?:phe |chon )?(a|b)\b/)?.[1];
        return { intent: 'VOTE_AB', value: ab === 'b' ? 2 : 1 };
      }
      if (r.intent === 'VOTE') {
        const v = VOTE_WORDS.findIndex((w) => n === w || n === String(VOTE_WORDS.indexOf(w) + 1));
        return { intent: 'VOTE', value: v >= 0 ? v + 1 : parseInt(n, 10) };
      }
      return { intent: r.intent };
    }
  }
  return null;
}
