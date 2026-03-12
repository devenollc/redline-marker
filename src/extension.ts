import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewManager } from './reviewManager';
import { SidebarProvider } from './sidebarProvider';
import { FileWatcher } from './fileWatcher';
import { PathValidator } from './pathValidator';
import { handleError } from './utils/errorHandler';

export function activate(context: vscode.ExtensionContext) {
  // Only activate in trusted workspaces
  if (!vscode.workspace.isTrusted) {
    vscode.window.showWarningMessage(
      'Redline Mark requires workspace trust to function. Please trust this workspace to use review features.'
    );
    return;
  }

  const reviewManager = new ReviewManager(context);
  const sidebarProvider = new SidebarProvider(context, reviewManager);
  const fileWatcher = new FileWatcher(reviewManager);

  // Register sidebar webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'redline-mark.sidebar',
      sidebarProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Handle vscode://redline-mark/open?file=.claude/plans/plan.md
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        try {
          if (uri.path === '/open') {
            const params = new URLSearchParams(uri.query);
            const file = params.get('file');

            if (!file) {
              throw new Error('Missing required parameter: file');
            }

            // Security: Validate path
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
              throw new Error('No workspace folder open');
            }

            const validation = PathValidator.validateReviewPath(file, workspaceRoot);
            if (!validation.valid) {
              throw new Error(`Invalid file path: ${validation.error}`);
            }

            await reviewManager.openInReviewMode(validation.normalized!);
          }
        } catch (error) {
          handleError('URI handler', error);
        }
      }
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('redline-mark.openReview', async (fileUri?: vscode.Uri) => {
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          throw new Error('No workspace folder open');
        }

        let targetFile: string;

        if (fileUri) {
          targetFile = vscode.workspace.asRelativePath(fileUri);
        } else {
          // Show quick pick for available review files
          const claudeFolder = vscode.Uri.file(path.join(workspaceRoot, '.claude/plans'));
          const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(claudeFolder, '**/*.md')
          );

          if (files.length === 0) {
            throw new Error('No reviewable files found in .claude/plans/ directory');
          }

          const picks = files.map(f => ({
            label: path.basename(f.fsPath),
            description: vscode.workspace.asRelativePath(f),
            uri: f
          }));

          const selected = await vscode.window.showQuickPick(picks, {
            placeHolder: 'Select a file to review'
          });

          if (!selected) return;
          targetFile = vscode.workspace.asRelativePath(selected.uri);
        }

        await reviewManager.openInReviewMode(targetFile);
      } catch (error) {
        handleError('Open review', error);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('redline-mark.sendToClaude', async () => {
      try {
        await sidebarProvider.handleSendToClaude();
      } catch (error) {
        handleError('Send to Claude', error);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('redline-mark.resolveComment', async (commentId: string) => {
      try {
        await reviewManager.resolveComment(commentId);
      } catch (error) {
        handleError('Resolve comment', error);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('redline-mark.addReply', async (commentId: string, body: string) => {
      try {
        await reviewManager.addReply(commentId, body);
      } catch (error) {
        handleError('Add reply', error);
      }
    })
  );

  // Start file watcher
  fileWatcher.start();
  context.subscriptions.push(fileWatcher);

  console.log('Redline Mark extension activated');
}

export function deactivate() {
  // Cleanup handled by subscriptions
}
