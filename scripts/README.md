# Build and Test Infrastructure

Run from the repository root with Node 20.19+ or 22.12+ (verified with
Node 24.14.0). The root lockfile supplies Vitest 4.1.8, Rolldown 1.2.4, and
Lightning CSS 1.33.0. No global CLI, DSH process, or upstream monorepo helper
is invoked. Runtime source, presets, SQLite, and the inert loader seats are
not rewritten by the build script.

## Dependencies

Resolution prefers repository node_modules. Missing host packages may be
read from an explicit DSH node_modules directory. No global installation is
discovered implicitly, modified, or restarted.

PowerShell (use the path belonging to your own DSH installation):

```powershell
$env:DSH_HOST_NODE_MODULES = Join-Path $env:APPDATA 'npm/node_modules/@deepseek-ai/dsh/node_modules'
npm run deps:check
```

POSIX shells:

```sh
export DSH_HOST_NODE_MODULES=/path/to/dsh/node_modules
npm run deps:check
```

The repository declares DSH rc.6 peers. A different installed version is
reported by `deps:check`; passing tests on it does not certify rc.6. Runtime
host imports remain external in the build; the host fallback is principally
needed to execute the real source tests. `NODE_PATH` is not required.

If React Flow is absent from the repository and host dependency trees, the
isolated client build dependency is pinned with its own lockfile:

```sh
npm ci --prefix scripts/client-deps --ignore-scripts --legacy-peer-deps --no-audit --no-fund
```

This installs only the pinned React Flow dependency graph under scripts,
without changing the root lockfile or global DSH. React and React DOM remain
external and are supplied by the DSH browser module loader. Building does
not automatically download or install anything.

## Build

```sh
npm run build
npm run build:host
npm run build:client
```

The full build writes only `lib/pentest.js`, `lib/invariant.js`, and
`lib/ui-pentest.client.js`. It compiles TypeScript/TSX, bundles Zod and React
Flow, retains host/React imports, embeds CSS Modules and global React Flow
CSS with loader-owned `data-plugin` tags, and wraps the browser entry in
`window.__ModuleLoader__.load`. Packaging remaps the host invariant identity
without changing the source used by tests. It does not emit declarations or
perform TypeScript type checking.

To verify without touching the published runtime files:

```sh
npm run build -- --out-dir scripts/.build-check
npm run build -- --out-dir scripts/.build-check --check
```

`--check` rebuilds in memory, compares bytes, and exits nonzero on missing or
stale output; it never writes. `npm run build:check` compares against lib.
`--host-node-modules PATH` is the build CLI equivalent of the environment
variable. Paths with spaces must be quoted. No output directory is emptied.

## Tests

```sh
npm test
npm run test:host
npm run test:bundle
```

The default includes all `src/dsh-pentest/tests/**/*.spec.ts` and bundle tests.
No tests are skipped or expectations patched for a host version. `test:bundle` stays usable without
a host fallback. Existing UI source tests are not part of this host suite:
their upstream client-test-runtime and client-web-react harness packages are
not included in the installed DSH distribution.

Coverage is opt-in (`npm run test:host -- --coverage`), with the documented
100% thresholds preserved. It requires the matching Vitest coverage provider;
normal test runs do not claim coverage or install the provider automatically.
