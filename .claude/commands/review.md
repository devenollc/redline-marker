# Review Implementation Plan

Opens a document in VS Code for inline review using Redline Mark extension.

## Usage
/review <file-path>

Example: /review plans/auth-implementation.md

## Security Notes
- File path MUST be within `.claude/` directory
- Path traversal sequences (`..`) are blocked
- All paths are validated before opening

## Steps

1. **Validate Input**
   - Check that `$ARGUMENTS` is not empty
   - Validate path is within `.claude/` directory:
     ```bash
     if [[ "$ARGUMENTS" != .claude/* ]]; then
       echo "ERROR: Review files must be in .claude/ directory"
       exit 1
     fi
     ```
   - Sanitize path to prevent injection

2. **Read Target File**
   - Read the file at `$ARGUMENTS`
   - If file doesn't exist, show error and exit

3. **AI Pre-Review (Optional)**
   - Analyze the document for:
     - Technical gaps or ambiguities
     - Missing edge cases
     - Security concerns
     - Scope risks
     - Unclear requirements
   - Generate 3-5 high-quality comments

4. **Create Review JSON**
   - Write initial review to `.claude/reviews/<filename>.review.json`
   - **IMPORTANT**: Include anchor data for each comment (context lines + hash)
   - Use this schema:
   ```json
   {
     "$schema": "https://redline-mark.devenollc.com/schemas/v1",
     "schemaVersion": 1,
     "file": ".claude/<path>",
     "fileHash": "<sha256 of file contents>",
     "createdAt": "<ISO timestamp>",
     "updatedAt": "<ISO timestamp>",
     "status": "in_review",
     "comments": [
       {
         "id": "c_<nanoid>",
         "line": <line number>,
         "endLine": <line number>,
         "author": "claude",
         "authorEmail": null,
         "severity": "<info|question|warning|blocker>",
         "body": "<comment text>",
         "createdAt": "<ISO timestamp>",
         "resolved": false,
         "resolvedAt": null,
         "resolvedBy": null,
         "thread": [],
         "anchor": {
           "line": <line number>,
           "endLine": <line number>,
           "contextBefore": "<line before>",
           "contextLine": "<the actual line(s)>",
           "contextAfter": "<line after>",
           "contentHash": "<sha256 hash of context>",
           "createdAt": "<ISO timestamp>"
         },
         "anchorValid": true,
         "anchorLastChecked": "<ISO timestamp>"
       }
     ],
     "claudeFeedback": {
       "sentAt": null,
       "mode": null,
       "responseFile": null,
       "status": null
     }
   }
   ```

5. **Open in VS Code**
   - Sanitize the file path
   - Run: `code --open-url "vscode://redline-mark/open?file=<sanitized-path>"`
   - The VS Code extension will:
     - Validate the path again (defense in depth)
     - Open the file in review mode
     - Render all comments as inline threads

6. **User Notification**
   - Tell the user:
     ```
     ✓ Opened <filename> for review in VS Code

     I've added <N> initial findings as comments.
     You can:
     - Add your own comments inline
     - Reply to existing comments
     - Mark comments as resolved
     - Send all feedback back to me using the "Send to Claude" button
     ```

## Error Handling

- File not found → Show error, don't create review file
- Invalid path → Block and show security warning
- VS Code not running → Show instructions to start VS Code
- Extension not installed → Provide installation link
