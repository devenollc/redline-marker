# Redline Mark

**VS Code Extension for Inline Review of Markdown Documents**

Redline Mark enables inline, line-level annotation of any Markdown file in your project. Review feedback is persisted in `.redline/` and sent back to Claude Code via terminal.

---

## Quick Start

### Installation
```bash
git clone https://github.com/devenollc/redline-mark.git
cd redline-mark
npm install
npm run compile
code .
# Press F5 to launch Extension Development Host
```

### Usage

**Open a file for review:**
```
Cmd+Shift+P → "Redline Mark: Open in Redline Mark Mode"
```
Select any `.md` file from the workspace picker.

**Add a comment:**
Click `+` in the gutter → type → click **Add Comment**.

**Send to Claude:**
Click **Send to Claude** in the sidebar — dispatches all open comments to Claude Code via terminal.

**From Claude.ai Chat:**
```
[Open in VS Code for Review](vscode://redline-mark/open?file=.claude/plans/plan.md)
```

---

## Architecture

```
redline-mark/
├── src/
│   ├── extension.ts           # Entry point, commands, URI handler
│   ├── reviewManager.ts       # Session management, comment CRUD, VS Code threads
│   ├── sidebarProvider.ts     # Webview sidebar UI
│   ├── claudeBridge.ts        # Builds prompt, dispatches to terminal
│   ├── pathValidator.ts       # Path validation, review JSON path generation
│   ├── schemaValidator.ts     # JSON schema validation & migration
│   ├── anchorValidator.ts     # Line-staleness detection & repair
│   ├── fileWatcher.ts         # Watches .redline/ for external changes
│   ├── types.ts               # TypeScript interfaces
│   └── utils/
│       ├── errorHandler.ts    # Centralized error handling + output channel
│       └── debounce.ts        # I/O debounce utility
├── media/                     # Sidebar webview assets (CSS, JS)
├── schemas/                   # JSON schema definitions
└── .redline/                  # Review data (gitignored)
```

### Key Features
- ✅ **Any `.md` file** — not limited to `.claude/plans/`
- ✅ **Smart Anchoring** — comments track content even when files change (85% accuracy, 4-tier search)
- ✅ **Persistent reviews** — saved to `.redline/` per project, survive session reloads
- ✅ **Multi-file support** — review multiple documents concurrently
- ✅ **Security hardened** — path validation, input sanitization, workspace trust
- ✅ **File sync** — detects external changes to review files
- ✅ **Configurable exclusions** — block files via `redlineMark.excludePatterns` setting

---

## Data Model

Reviews are stored as `.redline/<encoded-path>.review.json`.

Path encoding: `src/README.md` → `.redline/src__README.review.json`

```json
{
  "$schema": "https://redline-mark.devenollc.com/schemas/v1",
  "schemaVersion": 1,
  "file": "docs/architecture.md",
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
      "anchor": { ... },
      "anchorValid": true
    }
  ],
  "claudeFeedback": {
    "mode": "revise",
    "status": "pending",
    "sentAt": "2026-03-13T12:00:00Z",
    "responseFile": null
  }
}
```

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `redlineMark.excludePatterns` | `[]` | Glob patterns excluded from file picker |
| `claudeReview.autoSave` | `true` | Auto-save comments |
| `claudeReview.debounceMs` | `1000` | File write debounce (ms) |
| `claudeReview.enableFileWatcher` | `true` | Watch `.redline/` for external changes |

Built-in exclusions: `**/node_modules/**`, `**/.redline/**`, `**/out/**`

---

## Security

- **Path traversal** — blocked via `PathValidator` (no `..`, workspace boundary check)
- **Filename collisions** — full relative path encoded into review JSON name
- **Shell injection** — prompt escaped before terminal dispatch
- **XSS** — CSP nonce in webview, `MarkdownString` sanitization
- **Workspace trust** — extension exits early if workspace is untrusted

---

## Development

```bash
npm run compile      # Compile TypeScript
npm run watch        # Watch mode
npm test             # Run tests
vsce package         # Package for distribution
```

### Critical Implementation Notes

**Session before document:** `openInReviewMode` registers the session in `activeSessions` BEFORE calling `openTextDocument` / `showTextDocument`. VS Code calls `provideCommentingRanges` when the document is shown — if the session isn't registered yet, no gutter icons appear.

**Comment submission:** The `createComment` command must be in `comments/commentThread/context` (not `title`). The `context` menu passes a `CommentReply` with `text` and `thread`; the `title` menu only passes the `CommentThread` object with no input text.

**Send to Claude:** Always uses `revise` mode. Builds a prompt from all unresolved comments and runs `claude "<prompt>"` in an integrated terminal.

---

## Known Issues / Roadmap

- **Claude Code extension API**: Currently always uses terminal. Goal: detect `anthropic.claude-code` commands at runtime and dispatch natively if available.
- **Severity editing**: Comments default to `question`. No UI to change severity post-creation yet.
- **Reply threading**: `addReply` is implemented but has no UI trigger.
- **Multi-root workspaces**: Uses first workspace folder only.

---

## Links

- **Technical Spec**: [techSpec.md](techSpec.md)
- **Issues**: https://github.com/devenollc/redline-mark/issues

---

**Built with ❤️ by Steve**
