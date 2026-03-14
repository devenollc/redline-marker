# Redline Mark

**Inline review for any Markdown file in your project — powered by Claude Code.**

Redline Mark adds a PR-style comment experience to VS Code for Markdown documents. Annotate any `.md` file line by line, persist your feedback across sessions, and send it directly to Claude Code to revise the document.

---

## Features

- **Comment on any `.md` file** — open any Markdown file in review mode and click `+` in the gutter to add inline comments
- **Persistent reviews** — comments are saved to `.redline/` in your project and survive reloads
- **Send to Claude** — packages all open comments into a structured prompt and dispatches to Claude Code via terminal
- **Smart anchoring** — comments track their location even after the file is revised (4-tier search, ~85% accuracy)
- **Sidebar overview** — see all active reviews, open/resolved comment counts, and jump to any comment
- **Configurable exclusions** — block files from the picker via `redlineMark.excludePatterns` in Settings

---

## Usage

### 1. Open a file for review
```
Cmd+Shift+P → "Redline Mark: Open in Redline Mark Mode"
```
Pick any `.md` file from the workspace. Gutter `+` icons appear on every line.

### 2. Add a comment
Click `+` next to a line → type your feedback → click **Add Comment**.

### 3. Send to Claude
Click **Send to Claude** in the Redline Mark sidebar. Claude Code opens in a terminal and revises the file incorporating your comments.

### 4. From Claude.ai chat
Claude can generate a direct link to open a file in review mode:
```
[Open in VS Code for Review](vscode://redline-mark/open?file=.claude/plans/plan.md)
```

---

## Review Data

Comments are stored in `.redline/` at the workspace root (gitignored by default):

```
.redline/
  docs__architecture.review.json
  .claude__plans__auth-implementation.review.json
```

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `redlineMark.excludePatterns` | `[]` | Glob patterns to exclude from the file picker |
| `claudeReview.autoSave` | `true` | Auto-save comments on change |
| `claudeReview.debounceMs` | `1000` | File write debounce delay (ms) |
| `claudeReview.enableFileWatcher` | `true` | Watch `.redline/` for external changes |

**Example — exclude changelog and generated docs:**
```json
"redlineMark.excludePatterns": [
  "**/CHANGELOG.md",
  "docs/generated/**"
]
```

---

## Requirements

- VS Code 1.85+
- [Claude Code](https://claude.ai/claude-code) installed and on your PATH (for "Send to Claude")

---

## Documentation

- [CLAUDE.md](CLAUDE.md) — Project overview and quick reference
- [techSpec.md](techSpec.md) — Full technical specification

---

## License

MIT — Built by [Voxnotes](https://voxnotes.xyz)
