import type { MetadataRoute } from 'next';

// Spec: PWA — installable, online-only (no service worker).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NaDoch!',
    short_name: 'NaDoch!',
    description: 'Learn German — von „Na?“ über „Ach so!“ zu „Doch!“',
    start_url: '/',
    display: 'standalone',
    // Manifest colours can't read CSS variables; they mirror --background in app/theme.css.
    background_color: '#121212',
    theme_color: '#121212',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
