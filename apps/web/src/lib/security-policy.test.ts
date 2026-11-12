import { describe, expect, it } from 'vitest';
import { webHeaders, webPolicy } from '../../security-policy';

describe('web security policies', () => {
  it('keeps production scripts same-origin, prohibits inline code and limits external resources', () => {
    const policy = webPolicy();
    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|ws:|https?:\/\/\*/);
    expect(policy).toContain("connect-src 'self';");
    expect(policy).toContain("img-src 'self' blob: data:");
    expect(policy).toContain('https://fonts.gstatic.com');
  });
  it('restricts development exceptions to HMR and keeps unsupported directives out of meta', () => {
    expect(webPolicy(true)).toContain("script-src 'self' 'unsafe-inline'");
    expect(webPolicy(true)).toContain('ws://127.0.0.1:*');
    expect(webPolicy(true)).not.toContain('unsafe-eval');
    expect(webPolicy(false, false)).not.toContain('frame-ancestors');
    expect(webHeaders()['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(webHeaders()['X-Frame-Options']).toBe('DENY');
  });
});
