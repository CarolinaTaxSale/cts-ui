# Contributing

## Branching

One branch per story. If a change grows an "and" in its description, it is two
stories - split it into two branches and two PRs.
If you get sidetracked mid-task onto something unrelated, stop, open a fresh
branch for the sidetrack, and come back to the original one.

## Commits

Each commit builds green on its own and reads as one idea. Prefer several small
commits over one large one when a change has independently-reviewable parts.

## Before opening a PR

```
pnpm typecheck   # tsc --noEmit
pnpm build       # next build
pnpm lint        # eslint .
```

There are no automated tests yet - check the change by running `pnpm dev` and
clicking through the affected screens.

## These must always be fixed

`typecheck`, `build`, and `lint` must be green with **zero errors and zero
warnings** before a PR opens - not just "passing." A warning left in place
today is indistinguishable from a warning nobody noticed tomorrow. If a
check is failing or warning for a reason unrelated to what you're working
on, fix it anyway (or say so explicitly and get it triaged) rather than
working around it or leaving it for later.

## Scope

Land the smallest change that is coherent on its own. A larger idea that comes
up while working goes in this repo's `TODO.md` or the root `all-in-one`
`TODO.md`, not into the PR at hand.

## Boundaries

This app is public-internet-facing, unlike `admin-ui`.
It reads the `parcels` schema and the image store and writes only `consumer_auth`; it never calls `data-orchestrator`, `data-retriever` or `admin-ui`, which don't exist in production.
Code under `lib/server/` imports `server-only`, so a client component that pulls in a query or a credential fails the build instead of shipping it to the browser.

Some code here is copied from the other services (query rules, types, the county list, the Analyze components).
When you change one side, change the other, and keep all-in-one's `docs/shared-code-inventory.md` accurate.
