import * as vscode from 'vscode';

const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Redline Mark');

export function getOutputChannel(): vscode.OutputChannel {
  return outputChannel;
}

export function handleError(context: string, error: any): void {
  const message = error instanceof Error ? error.message : String(error);

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
