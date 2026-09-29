# App changelog

User-visible changes to the app as it ships on Android. The Android app is a Capacitor
wrapper around the same web bundle the PWA serves, so an entry covers **both** Android-shell
changes and web/API changes that reach Android through that bundle — not just the native code.

Newest release goes at the top, under a `## vX.Y.Z` heading matching the release tag. Each
entry has two parts:

1. A **What's new** block, between `<!-- whats-new:start -->` and `<!-- whats-new:end -->`
   markers. This is what Google Play shows as the release notes, so it must be **plain text**
   (Play renders no Markdown), **under 500 characters**, and a genuinely *truncated* version of
   the release notes below — the one or two headline changes, not every bullet. It is extracted
   and validated by `scripts/android-whats-new.mjs` and published by `native-build.yml`; the
   release is refused if it's missing, oversized, or still contains Markdown.
2. The full release notes — a bullet per user-visible change with its PR number, matching the
   [GitHub Release notes](https://github.com/brianramseyau/EveryList/releases). Internal-only
   changes (CI, tests, tooling) belong in the GitHub notes, not here.

`pnpm prepare-release vX.Y.Z` refuses to bump versions until this file has an entry for
`vX.Y.Z`, so write (or update) the entry on the release branch before bumping.

Template for a new entry (replace `vX.Y.Z` and fill in; the example below is inside a fenced
code block and is ignored by the extractor, so it can stay here as a reference):

```markdown
## vX.Y.Z

<!-- whats-new:start -->
One or two sentences, plain text, under 500 characters.
<!-- whats-new:end -->

- **Headline change** (#000) — what changed and why it matters to the user.
- **Another change** (#000) — ...
```
