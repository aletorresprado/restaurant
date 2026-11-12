import { describe, expect, it, jest } from '@jest/globals';
import { apiPolicy, securityHeaders, swaggerPolicy } from './security-headers';

describe('API and Swagger security headers', () => {
  it('uses a closed policy for JSON and permits only local scripts for Swagger documents/assets', () => {
    for (const path of ['/api/v1/health', '/api/docs-json', '/api/docs', '/api/docs/', '/api/docs/index.html', '/api/docs/swagger-ui-init.js']) {
      const setHeader = jest.fn(), next = jest.fn();
      securityHeaders({ originalUrl: path } as any, { setHeader } as any, next);
      expect(setHeader).toHaveBeenCalledWith('Content-Security-Policy',
        path.startsWith('/api/docs') && path !== '/api/docs-json' ? swaggerPolicy : apiPolicy);
      expect(setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(next).toHaveBeenCalledTimes(1);
    }
    expect(swaggerPolicy).toContain("script-src 'self';");
    expect(swaggerPolicy).not.toContain('unsafe-eval');
  });
});
