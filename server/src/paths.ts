import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');
export const contentPath = (f: string) => resolve(ROOT, 'content', f);
export const CLIENT_DIST = resolve(ROOT, 'client', 'dist');
