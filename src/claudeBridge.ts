import * as vscode from 'vscode';
import { ReviewFile, FeedbackMode } from './types';

export class ClaudeBridge {
  static async sendToClaude(
    review: ReviewFile,
    mode: FeedbackMode,
    context: vscode.ExtensionContext
  ): Promise<void> {
    const openComments = review.comments.filter(c => !c.resolved);

    if (openComments.length === 0) {
      vscode.window.showWarningMessage('No open comments to send to Claude');
      return;
    }

    const summary = openComments
      .map(c => `Line ${c.line}${c.endLine !== c.line ? `-${c.endLine}` : ''} [${c.severity}]: ${c.body}`)
      .join('\n');

    if (mode === 'converse') {
      // Open Claude.ai with pre-filled context (safe URL encoding)
      const prompt = `I've reviewed ${review.file} and have these comments:\n\n${summary}\n\nLet's discuss.`;
      const encoded = encodeURIComponent(prompt);

      // Limit URL length (browsers have max URL length ~2000 chars)
      if (encoded.length > 1500) {
        vscode.window.showWarningMessage(
          'Comments are too long for URL. Opening Claude.ai - please paste manually.'
        );
        await vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/new'));
        // Copy to clipboard
        await vscode.env.clipboard.writeText(prompt);
        vscode.window.showInformationMessage('Comments copied to clipboard');
      } else {
        await vscode.env.openExternal(vscode.Uri.parse(`https://claude.ai/new?q=${encoded}`));
      }
      return;
    }

    // For revise / new_version: call Claude Code via terminal
    const modeInstruction = mode === 'revise'
      ? `Revise the plan at ${review.file} incorporating these comments. Save updated version to the same file.`
      : `Create a new version of ${review.file} at .claude/versions/ incorporating these comments. Keep the original intact.`;

    const fullPrompt = `${modeInstruction}\n\nComments:\n${summary}`;

    // Security: Escape quotes and special characters for shell safety
    const escapedPrompt = fullPrompt
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    // Use integrated terminal
    const terminal = vscode.window.createTerminal({
      name: 'Redline Mark',
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    });

    terminal.show(true);

    // Send command with proper escaping
    terminal.sendText(`claude "${escapedPrompt}"`);

    // Show status message
    vscode.window.showInformationMessage(
      `Sent ${openComments.length} comment(s) to Claude Code. Check terminal for response.`
    );
  }
}
