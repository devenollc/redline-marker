# Redline Mark — Redline Mark VS Code Extension

**Interactive review of Claude-generated documents with inline, line-level annotations**

Redline Mark connects Claude.ai chat and Claude Code terminal to a unified review experience inside VS Code, with all data persisted in your project's `.claude/` folder.

## Features

- ✅ **Smart Anchoring** — Comments track code even when files change (85% accuracy, 4-tier search)
- ✅ **Multi-file Support** — Review multiple documents concurrently
- ✅ **Security Hardened** — Path validation, input sanitization, workspace trust
- ✅ **File Sync** — Detects external changes to review files
- ✅ **Complete Threads** — Nested replies, resolve/unresolve, severity levels
- ✅ **Schema Versioning** — Forward-compatible JSON with auto-migration

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Compile the extension
npm run compile

# Run in development mode
code .
# Press F5 to launch Extension Development Host
```

### Usage

**From Claude Code Terminal:**
```bash
/review plans/auth-implementation.md
```

**From Claude.ai Chat:**
Claude will automatically generate review links like:
```
[Open in VS Code for Review](vscode://redline-mark/open?file=plans/plan.md)
```

**From VS Code:**
1. Open Command Palette (Cmd+Shift+P)
2. Run "Redline Mark: Open in Review Mode"
3. Select a file from `.claude/` directory

## How It Works

1. **Create reviews** — Use `/review` command or click links from Claude.ai
2. **Add comments** — Click on any line to add inline comments with severity levels
3. **Collaborate** — Reply to comments, mark as resolved
4. **Send feedback** — Use "Send to Claude" button to:
   - **Revise** — Claude rewrites the plan incorporating comments
   - **Converse** — Discuss comments in Claude.ai chat
   - **New Version** — Create parallel version preserving original

## Review Data Structure

Reviews are stored as JSON files in `.claude/reviews/`:

```json
{
  "file": ".claude/plans/auth-implementation.md",
  "status": "in_review",
  "comments": [
    {
      "line": 24,
      "severity": "question",
      "body": "What auth strategy are we using?",
      "author": "user",
      "resolved": false
    }
  ]
}
```

## Development

```bash
# Compile TypeScript
npm run compile

# Watch mode (auto-compile on save)
npm run watch

# Package for distribution
vsce package
```

## Documentation

- [CLAUDE.md](CLAUDE.md) — Project overview and quick reference
- [techSpec.md](techSpec.md) — Full technical specification

## License

MIT License — See [LICENSE](LICENSE) file for details

---

**Built with ❤️ by Deveno LLC**
