import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { ReviewManager } from './reviewManager';
import { handleError } from './utils/errorHandler';

export class FileWatcher implements vscode.Disposable {
  private watcher?: vscode.FileSystemWatcher;
  private syncInProgress = new Set<string>();

  constructor(private reviewManager: ReviewManager) {}

  start(): void {
    const config = vscode.workspace.getConfiguration('claudeReview');
    if (!config.get<boolean>('enableFileWatcher', true)) {
      return;
    }

    this.watcher = vscode.workspace.createFileSystemWatcher(
      '**/.redline/*.review.json'
    );

    this.watcher.onDidChange(async (uri) => {
      await this.handleFileChange(uri);
    });

    this.watcher.onDidDelete(async (uri) => {
      await this.handleFileDelete(uri);
    });
  }

  private async handleFileChange(uri: vscode.Uri): Promise<void> {
    const filePath = uri.fsPath;

    // Prevent sync loops
    if (this.syncInProgress.has(filePath)) {
      return;
    }

    try {
      this.syncInProgress.add(filePath);

      // Find corresponding active session
      const sessions = this.reviewManager.getAllActiveSessions();

      for (const [, session] of sessions) {
        if (session.reviewJsonPath === filePath) {
          // Reload review data
          const content = await fs.readFile(filePath, 'utf-8');
          const newData = JSON.parse(content);

          // Check if hash changed (prevent unnecessary reloads)
          if (newData.fileHash === session.review.fileHash) {
            return;
          }

          // Update session
          session.review = newData;

          vscode.window.showInformationMessage(
            `Review file updated externally: ${vscode.workspace.asRelativePath(uri)}`
          );
          break;
        }
      }
    } catch (error) {
      handleError('File watcher sync', error);
    } finally {
      this.syncInProgress.delete(filePath);
    }
  }

  private async handleFileDelete(uri: vscode.Uri): Promise<void> {
    vscode.window.showWarningMessage(
      `Review file deleted: ${vscode.workspace.asRelativePath(uri)}`
    );
  }

  dispose(): void {
    this.watcher?.dispose();
  }
}
