import { describe, it, expect } from 'vitest';
import manifest from './manifest';

describe('manifest', () => {
  it('makes NaDoch! installable, standalone, with its icons', () => {
    expect(manifest()).toMatchObject({
      name: 'NaDoch!',
      short_name: 'NaDoch!',
      start_url: '/',
      display: 'standalone',
      background_color: '#121212',
      icons: expect.arrayContaining([
        expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192' }),
        expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512' }),
        expect.objectContaining({ src: '/icons/icon-maskable-512.png', purpose: 'maskable' }),
      ]),
    });
  });
});
