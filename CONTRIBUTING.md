# Contributing to FLPerformance

Thank you for your interest in contributing to FLPerformance. This project welcomes contributions and suggestions.

## How to Contribute

1. **Fork** the repository and create your branch from `main`.
2. **Install dependencies**: run `npm run setup` to install both server and client dependencies.
3. **Make your changes**: follow the coding conventions described in [AGENTS.md](AGENTS.md).
4. **Test your changes**: run `npm test` to ensure all tests pass.
5. **Submit a pull request** with a clear description of your changes.

## Coding Standards

- Use UK English in all documentation and user-facing text.
- ESM imports only (no `require()`).
- React functional components with hooks (no class components).
- All Express route handlers must include try/catch with structured logging.
- Do not use shell commands (`exec`, `execFile`). All Foundry Local operations go through the SDK or the filesystem.

## Reporting Issues

- Use the GitHub issue tracker to report bugs.
- Include steps to reproduce, expected behaviour, and actual behaviour.
- Include your Node.js version and operating system.

## Code of Conduct

This project has adopted the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Licence

By contributing, you agree that your contributions will be licensed under the [MIT Licence](LICENSE).
