import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewManager } from './reviewManager';
import { ClaudeBridge } from './claudeBridge';
import { FeedbackMode } from './types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private context: vscode.ExtensionContext,
    private reviewManager: ReviewManager
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
      ]
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'sendToClaude':
          await this.handleSendToClaude(message.mode, message.filePath);
          break;
        case 'resolveComment':
          await vscode.commands.executeCommand('redline-mark.resolveComment', message.commentId);
          this.refresh();
          break;
        case 'jumpToComment':
          await this.jumpToComment(message.filePath, message.line);
          break;
      }
    });

    // Refresh sidebar when active sessions change
    this.refresh();
  }

  refresh(): void {
    if (!this.view) return;

    const sessions = Array.from(this.reviewManager.getAllActiveSessions().entries());
    const data = sessions.map(([filePath, session]) => ({
      filePath,
      fileName: path.basename(filePath),
      status: session.review.status,
      totalComments: session.review.comments.length,
      openComments: session.review.comments.filter(c => !c.resolved).length,
      resolvedComments: session.review.comments.filter(c => c.resolved).length,
      comments: session.review.comments.map(c => ({
        id: c.id,
        line: c.line,
        severity: c.severity,
        body: c.body,
        author: c.author,
        resolved: c.resolved,
        replyCount: c.thread.length
      })),
      claudeFeedback: session.review.claudeFeedback
    }));

    this.view.webview.postMessage({
      command: 'updateReviews',
      data
    });
  }

  async handleSendToClaude(mode?: FeedbackMode, filePath?: string): Promise<void> {
    // Get active editor if no file specified
    if (!filePath) {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('No active review file');
        return;
      }
      filePath = vscode.workspace.asRelativePath(activeEditor.document.uri);
    }

    const session = this.reviewManager.getActiveSession(filePath);
    if (!session) {
      vscode.window.showErrorMessage('File is not in review mode');
      return;
    }

    // Prompt for mode if not provided
    if (!mode) {
      const selected = await vscode.window.showQuickPick([
        {
          label: 'Revise Plan',
          description: 'Claude rewrites the plan incorporating all comments',
          mode: 'revise' as FeedbackMode
        },
        {
          label: 'Converse',
          description: 'Discuss comments with Claude in chat',
          mode: 'converse' as FeedbackMode
        },
        {
          label: 'New Version',
          description: 'Create a parallel version preserving the original',
          mode: 'new_version' as FeedbackMode
        }
      ], {
        placeHolder: 'How should Claude process your feedback?'
      });

      if (!selected) return;
      mode = selected.mode;
    }

    // Update status
    session.review.claudeFeedback.mode = mode;
    session.review.claudeFeedback.sentAt = new Date().toISOString();
    session.review.claudeFeedback.status = 'pending';
    session.review.status = 'sent';

    // Send to Claude
    await ClaudeBridge.sendToClaude(session.review, mode, this.context);

    // Refresh sidebar
    this.refresh();

    vscode.window.showInformationMessage(
      `Sent review to Claude in ${mode} mode`
    );
  }

  private async jumpToComment(filePath: string, line: number): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    const absolutePath = path.join(workspaceRoot, filePath);
    const doc = await vscode.workspace.openTextDocument(absolutePath);
    const editor = await vscode.window.showTextDocument(doc);

    const position = new vscode.Position(line - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'sidebar.css'))
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'sidebar.js'))
    );

    // Use nonce for CSP
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Redline Mark</title>
</head>
<body>
  <div id="app">
    <div class="empty-state">
      <p>No active reviews</p>
      <p class="hint">Open a file with <code>Cmd+Shift+P → Redline Mark: Open in Review Mode</code></p>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
