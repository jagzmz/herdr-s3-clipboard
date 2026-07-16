# Security policy

## Supported version

Security fixes target the latest version on the `main` branch. Update to the current version before reporting a problem that may already be fixed.

## Report a vulnerability privately

Do not open a public issue for a vulnerability, exposed credential, or usable presigned URL.

Use [GitHub private vulnerability reporting](https://github.com/jagzmz/herdr-s3-clipboard/security/advisories/new) when it is available. Include:

- The affected version or commit
- The operating system and storage provider
- Reproduction steps or a minimal proof of concept
- The impact you observed
- A suggested fix, if you have one

Redact access keys, secret keys, session tokens, account identifiers, bucket names, and presigned URL query strings. If private reporting is unavailable, open a minimal public issue requesting a private contact channel without including sensitive details.

## Credential handling

- Store credentials in the plugin config directory or process environment, never in the repository.
- Use a dedicated key restricted to the destination bucket and required operations.
- Rotate a key immediately if it appears in a terminal log, screenshot, issue, commit, or shared message.
- Treat the plugin `.env` file as plaintext secret material even though the wizard applies mode `0600` on Unix.
- Uninstalling preserves the config directory. Follow the optional credential cleanup in the [Uninstall guide](docs/installation.md#4-optionally-delete-credentials) when removing the plugin permanently.

## URL security

A presigned URL is a temporary bearer token. Anyone who receives it can read that object until the signature expires. Use the shortest practical `HSC_S3_PRESIGN_EXPIRES_IN` value and do not place full presigned URLs in public logs or bug reports.

Public mode does not grant access. It only constructs a URL from `HSC_S3_PUBLIC_BASE_URL` and the uploaded object key. Public access must be configured deliberately through the bucket policy, provider, custom domain, or CDN.

The plugin does not set object ACLs.
