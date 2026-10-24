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
