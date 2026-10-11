const files: Record<string, string> = {
  '/': 'web.html',
  '/assets/app.js': 'web.js',
  '/assets/app.css': 'web.css',
  '/assets/logo.svg': '../../logo/logo.svg',
  '/assets/logo-white.webp': '../../logo/logo-white.webp',
};

export function webAsset(path: string): Response | null {
  if (path === '/assets/passkeys.js') {
    const file = Bun.file(new URL('../../node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js', import.meta.url));
    return new Response(file, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  }
  if (path === '/assets/chart.js') {
    const file = Bun.file(new URL('../../node_modules/chart.js/dist/chart.umd.js', import.meta.url));
    return new Response(file, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  }
  const name = files[path];
  if (!name) return null;
  const file = Bun.file(new URL(name, import.meta.url));
  const contentType = name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.webp') ? 'image/webp' : 'application/javascript';
  return new Response(file, { headers: { 'content-type': `${contentType}; charset=utf-8`, 'cache-control': 'no-store' } });
}
