# Redline Mark — Manual Testing Guide

## Setup

```bash
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

All tests are run in the **Extension Development Host** window unless noted otherwise.

---

## 1. Extension Activation

**Test: Trusted workspace activates normally**
1. Open a trusted workspace (F5)
2. Check Output panel → select **Redline Mark** channel
3. Expected: `Redline Mark extension activated` logged

**Test: Untrusted workspace is blocked**
1. Open a folder via File → Open Folder
2. When prompted for trust, click **No, I don't trust the authors**
3. Expected: Warning message — "Redline Mark requires workspace trust..."
4. Expected: No commands available, sidebar does not load

---

## 2. Opening a File in Review Mode

### 2a. Via Command Palette
1. Place a `.md` file in `.claude/plans/` (e.g. `sample-plan.md`)
2. Open Command Palette (`Cmd+Shift+P`)
3. Run **Redline Mark: Open in Redline Mark Mode**
4. Expected: Quick pick shows available `.md` files
5. Select a file
6. Expected: File opens in editor, sidebar activates, inline comment gutters appear

### 2b. Via File URI Argument
1. Right-click a `.md` file in `.claude/plans/` in the Explorer
2. Run the command with the file pre-selected (if wired up)
3. Expected: File opens directly without quick pick

### 2c. Via VS Code URI (vscode://redline-mark/open)
1. Open a terminal
2. Run:
   ```bash
   code --open-url "vscode://redline-mark/open?file=.claude/plans/sample-plan.md"
   ```
3. Expected: VS Code focuses and opens the file in review mode

### 2d. Missing file
1. Run `code --open-url "vscode://redline-mark/open?file=.claude/plans/nonexistent.md"`
2. Expected: Error message — "File not found"

### 2e. No files in .claude/plans/
1. Remove all `.md` files from `.claude/plans/`
2. Run **Redline Mark: Open in Redline Mark Mode**
3. Expected: Error — "No reviewable files found in .claude/plans/ directory"

---

## 3. Path Security

**Test: Path traversal is blocked**
1. Run:
   ```bash
   code --open-url "vscode://redline-mark/open?file=../../etc/passwd"
   ```
2. Expected: Error — "Path contains invalid traversal sequence (..)"

**Test: Absolute path is blocked**
1. Run:
   ```bash
   code --open-url "vscode://redline-mark/open?file=/etc/passwd"
   ```
2. Expected: Error — "Path must be relative to workspace"

**Test: Path outside .claude/ is blocked**
1. Run:
   ```bash
   code --open-url "vscode://redline-mark/open?file=src/extension.ts"
   ```
2. Expected: Error — "Review files must be within .claude/ directory"

---

## 4. Adding Comments

1. Open a file in review mode (see Section 2)
2. Hover over the left gutter of any line
3. Expected: Blue `+` comment icon appears
4. Click the `+` icon on line 10
5. Type a comment in the input box
6. Expected: Inline comment thread appears on line 10
7. Check `.claude/reviews/<filename>.review.json`
8. Expected: Comment saved with `id`, `line`, `body`, `anchor` data

**Test: Multi-line comment**
1. Click and drag to select lines 5–8 in the gutter
2. Add a comment
3. Expected: Thread spans lines 5–8 (`line: 5`, `endLine: 8` in JSON)

---

## 5. Comment Severity Levels

Test that all four severity levels can be set and display correctly:

| Severity | Expected label |
|----------|---------------|
| `info` | INFO |
| `question` | QUESTION |
| `warning` | WARNING |
| `blocker` | BLOCKER |

1. Add a comment and set each severity
2. Expected: Thread label shows the severity in uppercase
3. Check the saved JSON — `"severity"` field matches

---

## 6. Resolving Comments

1. Open a file with at least one open comment
2. In the sidebar, click **Resolve** on a comment
3. Expected: Thread collapses, label shows `✓ RESOLVED`
4. Expected: `"resolved": true`, `"resolvedAt"` set in JSON

**Test: Unresolve**
1. Click a resolved thread to expand it
2. Expected: Option to re-open (if implemented)

---

## 7. Replies (Comment Threads)

1. Open a comment thread
2. Type a reply in the reply box and submit
3. Expected: Reply appears nested under the original comment
4. Check JSON — `"thread"` array has the new reply with `id`, `author`, `body`

---

## 8. Sidebar

1. Open a file in review mode
2. Click the Redline Mark icon in the Activity Bar
3. Expected: Sidebar shows:
   - File name
   - Open/resolved comment counts
   - List of comments with line numbers and severities

**Test: Empty state**
1. Close all review files or open with no active sessions
2. Expected: "No active reviews" with hint text

**Test: Jump to comment**
1. Click a comment in the sidebar
2. Expected: Editor scrolls to that line and focuses the thread

---

## 9. Send to Claude

### 9a. Converse mode
1. Open a file with open comments
2. In sidebar, click **Send to Claude** → select **Converse**
3. Expected: Claude.ai opens in browser with pre-filled prompt
4. If comments are too long: Expected: Warning + comments copied to clipboard

### 9b. Revise mode
1. Click **Send to Claude** → select **Revise Plan**
2. Expected: Redline Mark terminal opens and runs `claude "..."` with the revision prompt

### 9c. New Version mode
1. Click **Send to Claude** → select **New Version**
2. Expected: Terminal runs `claude "..."` with instruction to save to `.claude/versions/`

### 9d. No open comments
1. Resolve all comments, then click **Send to Claude**
2. Expected: Warning — "No open comments to send to Claude"

---

## 10. Anchor Validation

**Test: Comment stays accurate when file unchanged**
1. Add a comment to line 15
2. Close and reopen the file in review mode
3. Expected: Comment still shows on line 15, `anchorValid: true`

**Test: Stale anchor detection**
1. Add a comment to line 15
2. Outside VS Code, insert 10 lines before line 15 in the file
3. Reopen the file in review mode
4. Expected: Warning — "X comment(s) may be outdated"
5. Expected: Option to **Auto-Repair**, **Review Manually**, or **Dismiss**

**Test: Auto-repair**
1. Trigger the stale anchor warning (above)
2. Click **Auto-Repair**
3. Expected: High-confidence comments move to their new line
4. Expected: `"repaired X comment anchor(s)"` info message

---

## 11. File Watcher (External Sync)

1. Open a file in review mode
2. In a separate terminal, directly edit the `.claude/reviews/<filename>.review.json` file (change the `fileHash` value)
3. Expected: VS Code shows — "Review file updated externally: ..."

**Test: File deleted externally**
1. Open a file in review mode
2. Delete `.claude/reviews/<filename>.review.json` from the terminal
3. Expected: Warning — "Review file deleted: ..."

---

## 12. Multi-File Support

1. Open `file-a.md` in review mode, add 2 comments
2. Open `file-b.md` in review mode, add 1 comment
3. Expected: Both files show comment threads independently
4. Expected: Sidebar shows both files with their respective counts
5. Check `.claude/reviews/` — two separate `.review.json` files exist

---

## 13. Schema Validation & Review JSON

After adding a comment, verify the saved JSON structure:

```bash
cat .claude/reviews/sample-plan.review.json
```

Check:
- [ ] `$schema` = `https://redline-mark.devenollc.com/schemas/v1`
- [ ] `schemaVersion` = `1`
- [ ] `file` = relative path to reviewed file
- [ ] `fileHash` = `sha256:...` (64 hex chars)
- [ ] `comments[0].anchor` has `contextBefore`, `contextLine`, `contextAfter`, `contentHash`
- [ ] `comments[0].anchorValid` = `true`

---

## 14. Error Logging

1. Trigger any error (e.g. open a nonexistent file)
2. Click **View Logs** in the error notification
3. Expected: Redline Mark Output channel opens with timestamped error log

---

## Known Limitations to Note During Testing

- Multi-root workspaces: only the first workspace folder is used
- Activity bar icon may appear in color (PNG vs recommended monochrome SVG)
- Low-confidence anchor repairs require manual review
