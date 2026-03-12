import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function handleError(context: string, error: any): void {
  const message = error instanceof Error ? error.message : String(error);

  // Create output channel on first use
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Redline Mark');
  }

  // Log to output channel
  outputChannel.appendLine(`[${new Date().toISOString()}] ERROR in ${context}: ${message}`);
  if (error.stack) {
    outputChannel.appendLine(error.stack);
  }

  // Show user-friendly message
  vscode.window.showErrorMessage(
    `Redline Mark: ${context} failed - ${message}`,
    'View Logs'
  ).then(selection => {
    if (selection === 'View Logs' && outputChannel) {
      outputChannel.show();
    }
  });
}
