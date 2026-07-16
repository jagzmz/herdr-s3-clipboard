# Contributing

Contributions should be focused, tested, and safe for users on every supported platform.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Use a public issue for reproducible bugs and scoped feature proposals.
- Use the private process in [SECURITY.md](SECURITY.md) for vulnerabilities or exposed credentials.
- Read the [Development guide](docs/development.md) before changing the code.

## Prepare a change

1. Create a branch with a short descriptive name.
2. Install exact dependencies with `npm ci`.
3. Make one coherent change.
4. Add or update tests for behavior changes.
5. Update the appropriate focused guide when the user experience changes.
6. Run the validation commands in the [Development guide](docs/development.md#before-submitting-a-change).

## Coding conventions

- Use Node.js ESM and syntax supported by Node.js 20.
- Match the existing two-space indentation and double-quoted strings.
- Prefer small functions with explicit inputs over hidden process state.
- Keep platform-specific clipboard commands behind `src/clipboard.mjs` and the helper scripts.
- Keep provider-specific onboarding in `src/provider-guides.mjs`; the upload path must remain S3-compatible rather than provider-specific.
- Make error messages actionable without exposing secrets.
- Avoid adding a dependency when a small standard-library implementation is clear and maintainable.

Repository invariants and agent-specific rules are documented in [AGENTS.md](AGENTS.md).

## Documentation placement

Keep the README as a short overview and first-run path.

| Content | Location |
| --- | --- |
| Install, update, uninstall | `docs/installation.md` |
| Providers, settings, URL modes | `docs/configuration.md` |
| Operating-system behavior | `docs/platforms.md` |
| Symptoms and diagnostics | `docs/troubleshooting.md` |
| Development workflow and architecture | `docs/development.md` |
| Credential safety and vulnerability reporting | `SECURITY.md` |

Use descriptive link text and concrete commands. Never put real credentials, bucket secrets, session tokens, or complete presigned URLs in examples.

## Pull request checklist

- [ ] The change has one clear purpose.
- [ ] `npm test` passes.
- [ ] `npm audit --omit=dev` reports no unresolved production vulnerability.
- [ ] Cross-platform behavior is preserved or the support change is documented.
- [ ] New settings follow the atomic namespace rule and have tests.
- [ ] Documentation links and examples are current.
- [ ] The diff contains no secrets, generated config, or unrelated edits.
- [ ] Runtime versions are synchronized when a version bump is required.
- [ ] All GitHub Actions jobs pass on the supported Node.js and operating-system matrix.

Maintainers may ask for a smaller change when a pull request mixes unrelated behavior, refactoring, and documentation.
