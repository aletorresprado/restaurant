/** Keep the deployed HTML policy independent of Vite's development exceptions. */
export function webPolicy(development = false, header = true) {
  return [
    "default-src 'none'",
    `script-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    `style-src 'self' https://fonts.googleapis.com${development ? " 'unsafe-inline'" : ''}`,
    `style-src-attr ${development ? "'unsafe-inline'" : "'none'"}`,
    "img-src 'self' blob: data:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self'${development ? ' ws://127.0.0.1:* ws://localhost:*' : ''}`,
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    ...(header ? ["frame-ancestors 'none'"] : []),
  ].join('; ');
}

export function webHeaders(development = false) {
  return {
    'Content-Security-Policy': webPolicy(development),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}
