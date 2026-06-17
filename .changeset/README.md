# Changesets

This directory contains changesets for managing versioning and releases.

## What are changesets?

Changesets are a way to declare changes that should be reflected in the package version and changelog. Each changeset describes what changed and how it should affect the version number (patch, minor, or major).

## Creating a changeset

When you make changes to the codebase, run:

```bash
bun changeset
```

This will prompt you to:

1. Select the type of change (patch/minor/major)
2. Write a description of the change

The CLI will create a new file in `.changeset/` with your changes.

## The release workflow

1. **You add changesets** for your PRs
2. **CI creates a "Version Packages" PR** automatically when changesets are detected
3. **You merge the "Version Packages" PR** when ready to release
4. **CI automatically**:
   - Publishes to npm using Bun
   - Creates a git tag (e.g., `v1.15.0`)
   - Creates a GitHub release with notes

The `release/next` branch is in Changesets pre mode (`pre.json`, tag `next`) for
the Effect 4 beta line. Keep this directory clean after version commits:

- Keep `README.md`, `config.json`, and `pre.json` while pre mode is active.
- Keep only unconsumed changeset markdown files.
- Delete changeset markdown files once their contents are represented in
  `CHANGELOG.md` and their IDs are recorded in `pre.json`.

## Configuration

See `.changeset/config.json` for the Changesets configuration. Key settings:

- **changelog**: Uses the default Changesets changelog generator
- **access**: Public (package is published publicly)
- **baseBranch**: `main`

## Learn more

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Adding a changeset](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md)
