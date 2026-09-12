# House rules

This repo is normally checked out as a submodule of `all-in-one`; when it is, the root `AGENTS.md` there is the source of truth (no em dashes, never auto-add an agent as commit co-author, one full sentence per line in long Markdown, branch-per-story, never `git add -A`). Summarized here so they are visible even when this repo is cloned standalone. See `CONTRIBUTING.md` for branching and commit hygiene specific to this repo.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
