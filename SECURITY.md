# Security policy

## Reporting a vulnerability

Please do not publish exploitable details in a public issue. Use the repository's
**Security** tab and open a private security advisory instead:

https://github.com/Gitorix/tetris--manager/security/advisories/new

Include the affected page or file, reproduction steps, impact, and any suggested
mitigation. Do not include real credentials or personal information.

## Secrets

This is a static public site. API keys, passwords, tokens, private keys, and
service-account files must never be committed. Browser-side variables are public
even when they are bundled or obfuscated. Any future feature that requires a
secret must run on a server-side service and read the secret from that service's
encrypted environment-variable store.

## Scope and privacy

The game has no account registration, email collection, analytics, external API,
or server-side user database. Saved game settings and progress stay in the browser.
Production builds disable application network connections through CSP
(`connect-src 'none'`). Hosting infrastructure still receives normal page requests.
Vercel-specific response headers do not apply to GitHub Pages; Pages uses the
HTML CSP and referrer policy together with the host's HTTPS configuration.

The local scanner checks working files, reachable Git file history, and release
artifacts for known secret formats and personal emails. It is complemented by
GitHub secret scanning, push protection, Dependabot, and CodeQL. No scanner proves
that an arbitrary unknown credential has never leaked. If a real key is exposed,
revoke it at the issuing service first; deleting source alone is insufficient.

Use GitHub noreply addresses for new commits and install the repository hooks with
`npm run security:install-hooks`. Existing commit author/committer email metadata
requires a coordinated history rewrite; changing `user.email` does not remove it.
The 2026-10-25 approved rewrite removed the known personal email from all seven
branches. History scans now also reject private commit email metadata.
Forks, prior clones and cached commit URLs can preserve old data after a rewrite.
See the dated audit for the completed rewrite and remaining cache limitations.
