# Redline Mark — Technical Specification v3
**VS Code Extension + Claude Code Integration**
Version 0.3 · March 2026

---

## 1. Overview

Redline Mark is a VS Code extension that enables inline, line-level annotation of any Markdown document in your project. It connects to Claude Code via terminal to send review feedback back, with all data persisted in the project's `.redline/` folder.

**What's working in v0.3:**
- ✅ Inline comment threads on any `.md` file in the workspace
- ✅ Gutters appear reliably (session registered before document opens)
- ✅ Comments persist to `.redline/*.review.json`
- ✅ Sidebar shows active review sessions with comment counts
- ✅ "Send to Claude" dispatches all open comments via terminal (`claude "..."`)
- ✅ File watcher syncs external changes to `.redline/` review files
- ✅ Anchor tracking (4-tier search for line staleness)
- ✅ Schema versioning and validation
- ✅ Configurable file exclusion patterns
- ✅ Security: path traversal prevention, workspace trust, input sanitization

---

## 2. User Experience Flow

### Open a file for review
```
Cmd+Shift+P → "Redline Mark: Open in Redline Mark Mode"
  → Quick-pick shows all .md files in workspace (respecting excludePatterns)
  → Session is registered in activeSessions
  → File opens in editor with gutter + icons on every line
  → Existing comments (if any) are rendered as inline threads
  → Sidebar refreshes with file status and comment counts
```

### Add a comment
```
Click + in gutter → input box appears
  → Type comment text
  → Click "Add Comment" button (inline in input area)
  → Comment saved to session.review.comments with severity=question
  → Persisted to .redline/<path>.review.json (debounced 1s)
  → Thread rendered in gutter, sidebar refreshes
```

### Send to Claude
```
Sidebar → "Send to Claude" button
  → Gathers all unresolved comments from session
  → Builds prompt: "Revise <file> incorporating these comments..."
  → Opens integrated terminal named "Redline Mark"
  → Runs: claude "<escaped prompt>"
```

### URI handler (from Claude.ai)
```
vscode://redline-mark/open?file=.claude/plans/plan.md
  → Path validated (no traversal, within workspace)
  → Opens file in review mode same as command flow
```

---

## 3. Architecture

```
redline-mark/
├── src/
│   ├── extension.ts           # Entry point, commands, URI handler
│   ├── reviewManager.ts       # Session management, comment CRUD, VS Code threads
│   ├── sidebarProvider.ts     # Webview sidebar UI
│   ├── claudeBridge.ts        # Builds prompt, dispatches to terminal
│   ├── pathValidator.ts       # Path traversal prevention, review JSON path
│   ├── schemaValidator.ts     # JSON schema validation & migration
│   ├── anchorValidator.ts     # Line-staleness detection & repair
│   ├── fileWatcher.ts         # Watches .redline/*.review.json for external changes
│   ├── types.ts               # TypeScript interfaces
│   └── utils/
│       ├── errorHandler.ts    # Centralized error handling + output channel
│       └── debounce.ts        # I/O debounce utility
├── media/                     # Sidebar webview assets (CSS, JS)
├── schemas/                   # JSON schema definitions
└── .redline/                  # Review data (gitignored)
```

---

## 4. Key Design Decisions

### Session must be registered before document opens
`provideCommentingRanges` fires when `showTextDocument` resolves. The session must already be in `activeSessions` at that moment or no gutter icons appear. `openInReviewMode` now loads the review and sets the session **before** calling `openTextDocument`.

### Comment submission via `comments/commentThread/context`
VS Code's `comments/commentThread/title` passes a `CommentThread` object (no input text). `comments/commentThread/context` passes a `CommentReply` with `text` and `thread`. The `createComment` command must be registered in `context` to receive the typed text.

### No severity picker
Severity picker blocked after comment submission because the quick pick loses focus context in the comment thread UI. All comments default to `question` severity. Severity can be changed post-hoc if needed.

### No mode selector for Send to Claude
Always uses `revise` mode (sends to terminal). The `converse` and `new_version` modes were removed to simplify the UX.

### Collision-safe review file naming
`src/README.md` → `.redline/src__README.review.json`
`docs/README.md` → `.redline/docs__README.review.json`
Full relative path with `/` replaced by `__`.

---

## 5. Data Model

### Review File — `.redline/<path>.review.json`
```json
{
  "$schema": "https://redline-mark.devenollc.com/schemas/v1",
  "schemaVersion": 1,
  "file": ".claude/plans/auth-implementation.md",
  "fileHash": "sha256:abc123...",
  "status": "in_review",
  "comments": [
    {
      "id": "c_01HX...",
      "line": 24,
      "endLine": 26,
      "author": "user",
      "severity": "question",
      "body": "What auth strategy are we using?",
      "resolved": false,
      "thread": [],
      "anchor": {
        "contextBefore": "## Authentication Flow",
        "contextLine": "The API will use token-based auth...",
        "contextAfter": "",
        "contentHash": "a3f5d9e2...",
        "createdAt": "2026-03-10T10:15:00Z"
      },
      "anchorValid": true,
      "anchorLastChecked": "2026-03-10T10:15:00Z"
    }
  ],
  "claudeFeedback": {
    "mode": "revise",
    "status": "pending",
    "sentAt": "2026-03-10T10:20:00Z",
    "responseFile": null
  }
}
```

### Comment Severity Levels
- `info` — Informational note
- `question` — Request for clarification (default)
- `warning` — Potential issue
- `blocker` — Must be addressed before approval

---

## 6. Configuration

All settings are under **Settings → search "redline"**.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claudeReview.autoSave` | boolean | `true` | Auto-save review comments |
| `claudeReview.debounceMs` | number | `1000` | Debounce delay for file writes (ms) |
| `claudeReview.enableFileWatcher` | boolean | `true` | Watch for external changes to review files |
| `redlineMark.excludePatterns` | string[] | `[]` | Glob patterns to exclude from the file picker |

Built-in exclusions (always applied): `**/node_modules/**`, `**/.redline/**`, `**/out/**`

---

## 7. Security

| Concern | Mitigation |
|---------|-----------|
| Path traversal | `PathValidator.validateReviewPath` — no `..`, must be relative, checked against workspace boundary |
| Filename collision | Full relative path encoded into review JSON name |
| Shell injection | Prompt escaped (`\\`, `"`, `` ` ``, `$`) before terminal dispatch |
| XSS in webview | CSP with nonce, `MarkdownString` sanitization |
| Untrusted workspaces | Extension exits early if `!vscode.workspace.isTrusted` |
| Sensitive file access | `redlineMark.excludePatterns` for team-level blocks |

---

## 8. VS Code API Usage

| API | Purpose |
|-----|---------|
| `vscode.comments.createCommentController` | Inline comment threads + gutter icons |
| `vscode.window.registerUriHandler` | Handle `vscode://redline-mark/open?file=...` |
| `vscode.window.registerWebviewViewProvider` | Sidebar panel |
| `vscode.workspace.createFileSystemWatcher` | Sync `.redline/*.review.json` external changes |
| `vscode.workspace.isTrusted` | Security gating |
| `comments/commentThread/context` menu | Submit button that passes `CommentReply` with input text |

---

## 9. Anchor Validation

**4-Tier Search Strategy** (implemented in `anchorValidator.ts`):

1. **Exact Match** — Check if line number + surrounding context unchanged
2. **Content Hash** — Search for exact context hash in file
3. **Contextual Match** — Find line + before/after context
4. **Fuzzy Search** — Token similarity within ±30 lines

Results: ~85% accuracy, auto-repair for high-confidence moves, manual review UI for low-confidence cases.

---

## 10. Known Issues / Next Up

- **Claude Code extension integration**: `ClaudeBridge` currently always uses terminal fallback. Goal: detect `anthropic.claude-code` commands via `vscode.commands.getCommands()` and dispatch natively if available.
- **Severity editing**: No post-hoc severity change UI yet
- **Reply threading**: `addReply` command exists but no UI trigger in place
- **Multi-root workspaces**: Uses first workspace folder only
