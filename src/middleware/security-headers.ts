import { type NextFunction, type Request, type Response } from "express";

/**
 * Security headers middleware — manual implementation to avoid Helmet dependency.
 * Follows OWASP Secure Headers Project recommendations.
 *
 * Headers applied:
 * - X-Content-Type-Options: nosniff — prevents MIME-type confusion attacks
 * - X-Frame-Options: DENY — prevents clickjacking
 * - Strict-Transport-Security: max-age=31536000 — enforces HTTPS (1 year)
 * - X-XSS-Protection: 0 — disabled (modern browsers don't need it, can cause issues)
 * - Content-Security-Policy: default-src 'none' — strict CSP for API-only service
 * - Cache-Control: no-store — prevents caching of sensitive clinical data
 * - Referrer-Policy: no-referrer — prevents leaking genomic data URLs
 * - Permissions-Policy: — disables all browser features (API-only service)
 */
export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  };
}
