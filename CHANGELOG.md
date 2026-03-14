# Redline Mark — State of the Extension

> Summary of how the extension evolved from the original techSpec.md to the current v0.3 implementation.

---

## What Was Originally Planned

The original spec defined a focused review tool for files inside `.claude/plans/` only, with:
- A mode selector when sending to Claude (Revise / Converse / New Version)
- A severity picker on every new comment (question / info / warning / blocker)
- Review data stored in `.claude/reviews/`
- The slash command `/review` as the primary entry point
- Status field displayed in the sidebar per review

---

## What Changed and Why

### Storage moved: `.claude/reviews/` → `.redline/`
Review data now lives in `.redline/` at the workspace root. Keeps review artifacts separate from Claude Code's own `.claude/` folder and makes it clearer what belongs to Redline vs Claude Code natively.

### Scope expanded: `.claude/plans/*.md` → any `**/*.md`
Originally restricted to `.claude/plans/`. Now works on any Markdown file in the workspace. `node_modules`, `.redline`, and `out` are excluded by default. Teams can add their own exclusions via the `redlineMark.excludePatterns` setting.

### Severity picker removed
The picker was launched from inside the VS Code comment thread input area. When it appeared, the comment thread stole focus back and the quick pick never surfaced. All comments now default to `question` severity. Severity change post-creation is a known gap.

### Mode selector removed
The Revise / Converse / New Version dropdown was removed from the sidebar. "Send to Claude" always uses `revise` mode — builds a structured prompt from all open comments and runs `claude "..."` in an integrated terminal. Converse (opening Claude.ai in a browser) was dropped as it broke the in-editor flow.

### Review file naming is now collision-safe
Original: `README.review.json` (basename only — would collide for `src/README.md` and `docs/README.md`).
Current: `src__README.review.json` and `docs__README.review.json` — full relative path with `/` replaced by `__`.

### Comment submission wiring fixed
The `createComment` command was in `comments/commentThread/title` in the original spec. `title` menu items pass the `CommentThread` object — there is no input text available. The command now lives in `comments/commentThread/context`, which passes a `CommentReply` with both the typed text and the thread reference.

### Session registration order fixed
`openInReviewMode` originally opened the document first, then loaded the review and registered the session. VS Code calls `provideCommentingRanges` the moment `showTextDocument` resolves — if the session isn't registered yet, it returns `[]` and no gutter icons appear. The order is now: load review → register session → open document.

### `/review` slash command not implemented
The spec included a Claude Code slash command (`/review plans/file.md`) as a primary entry point. This was not built. The entry points are: Command Palette (`Redline Mark: Open in Redline Mark Mode`) and `vscode://` URI handler.

### Status field removed from sidebar
The spec called for a per-file status badge (in_review / sent / closed) in the sidebar. Removed as visual noise — the comment counts (open / resolved) are more useful at a glance.

---

## What's Working Now

| Feature | Status |
|---------|--------|
| Gutter `+` icons on any `.md` file | ✅ |
| Inline comment threads | ✅ |
| Comments persisted to `.redline/` | ✅ |
| Sidebar: active sessions, comment counts, jump to comment | ✅ |
| Send to Claude (terminal, revise mode) | ✅ |
| Anchor tracking (4-tier, ~85% accuracy) | ✅ |
| File watcher (external `.redline/` changes) | ✅ |
| Schema versioning + auto-migration | ✅ |
| Configurable exclude patterns | ✅ |
| `vscode://` URI handler | ✅ |
| Workspace trust enforcement | ✅ |

## Known Gaps

| Feature | Notes |
|---------|-------|
| `/review` slash command | Not implemented |
| Claude Code extension API dispatch | Always uses terminal fallback |
| Severity editing post-creation | No UI yet; defaults to `question` |
| Reply threading UI | `addReply` exists in code, no trigger in the UI |
| Multi-root workspace support | Uses first workspace folder only |
