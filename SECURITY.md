# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in FLPerformance, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please report security issues by emailing the project maintainers or by using GitHub's private vulnerability reporting feature on this repository.

## Scope

FLPerformance is designed as a **local development tool** that runs on localhost. The API server binds to `localhost:3001` and is not intended for public network exposure.

### Known Design Decisions

- **No authentication**: the API is unauthenticated by design, as it is intended for local single-user use only.
- **Open CORS**: cross-origin requests are permitted to allow the local frontend (port 3000) to communicate with the backend (port 3001).
- **No rate limiting**: not required for local single-user operation.

### Security Controls in Place

- **Path validation**: cache directory paths are validated against null bytes, symlinks, and sensitive system directories.
- **Input validation**: model aliases are validated with regex patterns to prevent command injection.
- **No shell commands**: all Foundry Local operations use the SDK or filesystem reads directly. No `exec` or `execFile` calls in the server code.
- **Parameterised queries**: all SQLite operations use prepared statements to prevent SQL injection.
- **Suite name validation**: benchmark suite names are validated against an alphanumeric pattern to prevent path traversal.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.0.x   | Yes       |
| 1.0.x   | No        |

## Recommendations for Users

- Do not expose the FLPerformance API server to public networks.
- Run the application in a trusted local environment.
- Keep dependencies up to date with `npm audit`.
