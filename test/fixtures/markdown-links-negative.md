# Markdown Links Negative Fixture

This fixture is used by `test/security/markdown-links.test.ts` to prove non-vacuity.
It contains an intentionally broken relative link:

[intentionally broken link](./non-existent-target-file.md)

And valid links to prove selective detection:
[valid README](../../README.md)
[in-page anchor](#markdown-links-negative-fixture)
