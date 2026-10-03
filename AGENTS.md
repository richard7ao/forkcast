# Lane rules

Two lanes, one repo, both pushing to `master`. Ownership is by path, so merge conflicts can't
happen while everyone stays in lane.

| Lane | Owns | Spec |
| --- | --- | --- |
| Backend | `packages/contract/**` (additive only), `apps/api/**`, `fixtures/**`, `data/**` except `data/product.json`, `apps/web/public/generated/**` (AI ad visuals), the self-contained demo pages and late-image route `apps/web/src/app/{vote-lite,watch-humans,generated}/**`, `README.md`, root config | `docs/superpowers/specs/backend.md` |
| Frontend | `apps/web/src/app/**` except the proxy route, `vote-lite/`, `watch-humans/` and `generated/`, `apps/web/src/components/**`, new files in `apps/web/src/lib/`, `apps/web/public/**` except `generated/`, `data/product.json` | `docs/superpowers/specs/frontend.md` |

Nobody edits during the sprint: `apps/web/src/lib/client.ts`, `apps/web/src/lib/useEndpoint.ts`,
`apps/web/src/app/api/[...path]/route.ts`, `packages/contract/src/fixtures.ts`, and
`apps/api/src/index.ts` (all four routes are already mounted; edit your route file).

## Push protocol

1. `pnpm check` is green.
2. `git add` only your lane's paths. Never `git add -A`.
3. `git pull --rebase`, then `git push`.
4. Shared files (contract, root `package.json`, lockfile) change only in the backend lane, and
   only after telling the other person.
5. The frontend never waits for the backend: fixture mode is the default and serves
   `fixtures/*.json` through the same contract.
