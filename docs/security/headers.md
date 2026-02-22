---
title: "Security Headers (v1 UI/API)"
description: ""
audience: [developers]
category: security
---

# Security Headers (v1 UI/API)

Recommended default headers
- Content-Security-Policy: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'`
- X-Frame-Options: `DENY`
- Referrer-Policy: `no-referrer`
- Strict-Transport-Security: when using HTTPS proxy: `max-age=31536000; includeSubDomains`
- Permissions-Policy: limit sensors/camera/mic/etc as appropriate
- Cross-Origin-Opener-Policy: `same-origin`
- Cross-Origin-Resource-Policy: `same-origin`
- X-Content-Type-Options: `nosniff`

Notes
- Avoid inline scripts/styles to keep CSP strict. Use hashed assets with SRI when possible.
- UI must validate allowed origins before rendering authenticated content.
- For local development, keep CSP strict; do not broadly allow `unsafe-inline`. If a dev server is required, add explicit origins in policy pack `ui.allowed_origins`.

