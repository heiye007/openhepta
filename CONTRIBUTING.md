# Contributing to OpenHepta

Thank you for your interest in contributing to **OpenHepta**!

Before submitting a pull request, please review our architecture rules in [AGENTS.md](./AGENTS.md) and the module index in [FEATURE_MAP.md](./FEATURE_MAP.md).

## Architectural Guidelines

OpenHepta enforces strict static checks (`pnpm lint`) to keep the codebase clean and maintainable:

1. **All Features as API**: Renderer code must never run raw SQL or access `window.heptaElectronApi` directly. Use `heptaClient` from `electron-renderer/src/client/`.
2. **Process Isolation**: `electron-main/` and `electron-renderer/` must never import each other. Cross-process contracts belong in `shared/`.
3. **One Folder Per Feature**: Modules under `electron-renderer/src/features/<A>/` must not import from `features/<B>/`. Shared UI belongs in `electron-renderer/src/primitives/`.
4. **No Comments in Code**: ESLint and `lint-rules/check-architecture.mjs` disallow comments in `electron-main/`, `electron-renderer/`, and `shared/`. Prefer clear symbol names and well-structured code.
5. **No Native Browser Dialogs**: Use `useAppModal()` instead of `alert()`, `confirm()`, or `prompt()`.
6. **One CLI Handler Per Feature**: Every new user-facing feature must expose a corresponding CLI handler in `electron-main/cli/` and register it in `cli/openhepta-cli.mjs` (see [cli/README.md](./cli/README.md)).
7. **Repo-Relative Paths Only**: Never commit machine-specific absolute paths in code or Markdown.

## Verification Checklist

Run the following commands locally before opening a PR:

```bash
pnpm lint
npx tsc --noEmit
npx tsc -p tsconfig.electron.json --noEmit
pnpm test:db
pnpm build
```

If your changes affect concurrency, whiteboard hierarchy, mind maps, cross-board moves, file storage, or card/highlight lifecycles, also run:

```bash
pnpm verify:tla
```
