import { randomBytes } from 'node:crypto';

export function randomSuffix(length = 6): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}
