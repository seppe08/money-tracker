# Security policy

## Supported versions

| Version | Supported |
|---|---|
| `1.x` | Yes |

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Report it privately
through GitHub's **Security → Report a vulnerability** flow (private security
advisories) or by emailing the maintainer listed in the repository profile.

Include:

- A description of the issue and the affected component (backend or mobile app).
- Reproduction steps or a proof of concept.
- The impact you believe it has.
- Any suggested remediation.

You can expect an acknowledgement within 72 hours and a remediation plan within
seven days for confirmed issues. Please give the maintainers a reasonable window
to release a fix before public disclosure.

## Scope

In scope:

- Authentication and session handling (JWT issuance, refresh rotation, revocation).
- Authorization and cross-user data access (IDOR).
- Injection, request smuggling, and denial-of-service vectors.
- Secret leakage, insecure defaults, and dependency vulnerabilities.
- Mobile token storage and transport security.

Out of scope:

- Findings that require a compromised device or a rooted/jailbroken OS.
- Missing security headers on a local development server with no TLS.
- Volumetric attacks that must be handled by an upstream proxy or CDN.
- Social engineering of maintainers or contributors.

## Security design

The authentication model, token lifecycle, threat model, and production
checklist are documented in [docs/SECURITY.md](docs/SECURITY.md) and
[backend/docs/authentication.md](backend/docs/authentication.md).

## Automated checks

Every pull request runs Ruff with security rules, pytest, ESLint, TypeScript,
dependency audits (`pip-audit` and `npm audit`), and CodeQL. Dependabot opens
weekly dependency update pull requests.
