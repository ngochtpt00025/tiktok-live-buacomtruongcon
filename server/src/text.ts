import { readFileSync } from 'node:fs';
import { contentPath } from './paths.js';

/** Bỏ dấu tiếng Việt, chữ thường, gộp khoảng trắng. "Nhập Tiệc!!" -> "nhap tiec" */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Blocklist { plain: string[]; accented: string[] }
const bl: Blocklist = JSON.parse(readFileSync(contentPath('blocklist.json'), 'utf8'));
const plainRe = bl.plain.length ? new RegExp(`(^|\\s)(${bl.plain.map(esc).join('|')})(\\s|$)`) : null;
const accented = bl.accented.map((w) => w.toLowerCase().normalize('NFC'));

function esc(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function isDirty(raw: string): boolean {
  const n = normalize(raw);
  if (plainRe && plainRe.test(n)) return true;
  const lower = ' ' + raw.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  return accented.some((w) => lower.includes(' ' + w + ' '));
}

export function cleanNick(nick: string): string {
  const n = (nick || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 18);
  if (!n || isDirty(n)) return 'Khách';
  return n;
}

export function cleanChat(text: string): string | null {
  const t = (text || '').replace(/[\u0000-\u001f]/g, '').trim();
  if (!t || isDirty(t)) return null;
  return t.length > 48 ? t.slice(0, 46) + '…' : t;
}

/** Hash ổn định từ userId -> số nguyên dương (để phối ngoại hình). */
export function hashLook(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
}
