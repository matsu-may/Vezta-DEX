# GitHub publication preparation — 2026-10-04

## Repository and scope

The standalone repository is `matsu-may/Vezta-DEX`. The owner authorized repository
preparation, connection and initial publication. It was empty and public;
visibility was set to private before publishing the development history.
The publication branch is `codex/hook-free-routing`.

This publishes code and documentation. Public web hosting remains a separate
milestone described in [Vercel readiness](2026-10-04-vercel-readiness.md).

## Secret and file checks

- Gitleaks **8.30.1**, downloaded from the official release with SHA-256 checksum
  verification, scans all Git refs/history and the staged changes.
- The default scan identified 66 `generic-api-key` findings. Every extracted
  value was a public `0x` plus 40-hex-character EVM address in deterministic tests
  or browser fixtures. Source locations were reviewed.
- History and staged scans pass with the reviewed configuration. A disposable
  staged Git fixture confirms public test addresses are exempt, while a synthetic
  key in a test and an address in production source remain detectable.
- `.gitleaks.toml` extends all default rules. Its one exception requires both that
  exact address shape and the reviewed test/fixture path patterns. It does not
  exclude entire files, API-key rules, private keys or production source.
- Real `.env*`, recovery contexts, compiler tools and browser artifacts remain
  ignored. `.env.example` remains tracked. Ignore rules also cover `.DS_Store`,
  `.pnpm-store/` and `.superpowers/`.
- The local `next-env.d.ts` change points to Next.js dev-generated route types;
  it is excluded from the publication commits.

Scan reports and downloaded tools stay under ignored `.local-evidence/`; they are
not publication artifacts. Scanning reduces exposure risk but cannot establish
that every possible credential format is detectable.

## Reproducible checks

With Gitleaks installed, from the standalone repository root:

```bash
gitleaks git --redact=100 --log-opts=--all .
gitleaks git --redact=100 --pre-commit --staged .
```

The existing GitHub Actions workflow runs frozen installation, tests, typecheck,
lint and build with Node 24 and pnpm 10.33.2. Real RPC/API credentials are not
required for those fixture-based checks. Live probes require local server-only
configuration; fresh clones do not include `.env` or private recovery storage.

Keep commits scoped and inspect `git diff --cached` before committing. If an
actual credential is exposed, rotate it and assess history cleanup before
publishing further.
