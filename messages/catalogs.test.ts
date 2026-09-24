import { describe, it, expect } from 'vitest';
import en from './en.json';
import de from './de.json';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)
  );
}

function placeholders(message: string): string[] {
  const names = [...message.matchAll(/\{(\w+)/g)].map((m) => m[1]);
  const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...names, ...tags])].sort();
}

describe('message catalogs', () => {
  const enLeaves = new Map(leaves(en as Tree));
  const deLeaves = new Map(leaves(de as Tree));

  it('have exactly the same keys in English and German', () => {
    expect([...deLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort());
  });

  it('use the same placeholders and tags in both languages', () => {
    for (const [key, enMessage] of enLeaves) {
      expect({ key, placeholders: placeholders(deLeaves.get(key) ?? '') }).toEqual({
        key,
        placeholders: placeholders(enMessage),
      });
    }
  });

  it('have no empty messages', () => {
    for (const [key, message] of [...enLeaves, ...deLeaves]) {
      expect({ key, empty: message.trim() === '' }).toEqual({ key, empty: false });
    }
  });
});
