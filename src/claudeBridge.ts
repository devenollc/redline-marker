import * as vscode from 'vscode';
import { ReviewFile } from './types';

export class ClaudeBridge {
  static async sendToClaude(
    review: ReviewFile,
    _context: vscode.ExtensionContext
  ): Promise<void> {
    const openComments = review.comments.filter(c => !c.resolved);

    if (openComments.length === 0) {
      vscode.window.showWarningMessage('No open comments to send to Claude');
      return;
    }

    const summary = openComments
      .map(c => `Line ${c.line}${c.endLine !== c.line ? `-${c.endLine}` : ''} [${c.severity}]: ${c.body}`)
      .join('\n');

    const fullPrompt = `Revise the plan at ${review.file} incorporating these comments. Save updated version to the same file.\n\nComments:\n${summary}`;

    const escapedPrompt = fullPrompt
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    const terminal = vscode.window.createTerminal({
      name: 'Redline Mark',
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    });

    terminal.show(true);
    terminal.sendText(`claude "${escapedPrompt}"`);

    vscode.window.showInformationMessage(
      `Sent ${openComments.length} comment(s) to Claude. Check terminal for response.`
    );
  }
}
