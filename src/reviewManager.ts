import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { ReviewFile, Comment, ReviewSession, CommentReply, CommentSeverity } from './types';
import { PathValidator } from './pathValidator';
import { SchemaValidator } from './schemaValidator';
import { AnchorValidator } from './anchorValidator';
import { handleError } from './utils/errorHandler';
import * as crypto from 'crypto';

export class ReviewManager {
  private commentController: vscode.CommentController;
  private activeSessions = new Map<string, ReviewSession>();
  private saveQueue = new Map<string, NodeJS.Timeout>();
  private config: vscode.WorkspaceConfiguration;

  constructor(private context: vscode.ExtensionContext) {
    this.config = vscode.workspace.getConfiguration('claudeReview');

    // Create comment controller with proper configuration
    this.commentController = vscode.comments.createCommentController(
      'redline-mark',
      'Redline Mark'
    );

    // Configure comment input UI
    this.commentController.options = {
      prompt: 'Add review comment...',
      placeHolder: 'Describe the issue, ask a question, or provide feedback'
    };

    // Only enable comments on files in review mode
    this.commentController.commentingRangeProvider = {
      provideCommentingRanges: (document: vscode.TextDocument) => {
        const relativePath = vscode.workspace.asRelativePath(document.uri);

        // Only allow comments on files currently being reviewed
        if (!this.activeSessions.has(relativePath)) {
          return [];
        }

        // Enable comments on all lines
        const lineCount = document.lineCount;
        return [new vscode.Range(0, 0, lineCount - 1, 0)];
      }
    };

    this.context.subscriptions.push(this.commentController);
  }

  async openInReviewMode(relativePath: string): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('No workspace folder open');
    }

    try {
      const absolutePath = path.join(workspaceRoot, relativePath);
      const reviewJsonPath = PathValidator.getReviewJsonPath(workspaceRoot, relativePath);

      // Check if file exists
      try {
        await fs.access(absolutePath);
      } catch {
        throw new Error(`File not found: ${relativePath}`);
      }

      // Load or create review session BEFORE opening the document so that
      // provideCommentingRanges finds the session in activeSessions on its
      // first call (which fires when showTextDocument resolves).
      const review = await this.loadOrCreateReview(relativePath, absolutePath, reviewJsonPath);

      const session: ReviewSession = {
        filePath: relativePath,
        reviewJsonPath,
        review,
        commentThreads: new Map()
      };
      this.activeSessions.set(relativePath, session);

      // Open the document — provideCommentingRanges now finds the session
      const doc = await vscode.workspace.openTextDocument(absolutePath);
      await vscode.window.showTextDocument(doc);

      // Validate comment anchors
      const fileLines = doc.getText().split('\n');
      const validationResult = await AnchorValidator.validateAllAnchors(
        session.review.comments,
        fileLines
      );

      // Show warning if anchors are stale
      if (validationResult.staleAnchors > 0 || validationResult.lostAnchors > 0) {
        vscode.window.showWarningMessage(
          `${validationResult.staleAnchors + validationResult.lostAnchors} comment(s) may be outdated. File has changed since review.`,
          'Auto-Repair', 'Review Manually', 'Dismiss'
        ).then(async choice => {
          if (choice === 'Auto-Repair') {
            // Repair high-confidence anchors automatically
            let repairedCount = 0;
            for (const [commentId, result] of validationResult.results) {
              if (result.currentLine && (result.confidence === 'high' || result.confidence === 'exact')) {
                const comment = session.review.comments.find(c => c.id === commentId);
                if (comment) {
                  AnchorValidator.repairAnchor(comment, result.currentLine, fileLines);
                  repairedCount++;
                }
              }
            }
            if (repairedCount > 0) {
              await this.persistReview(session);
              await this.renderComments(doc.uri, session);
              vscode.window.showInformationMessage(`Repaired ${repairedCount} comment anchor(s)`);
            }
          }
        });
      }

      // Render existing comments
      await this.renderComments(doc.uri, session);

      // Focus sidebar
      await vscode.commands.executeCommand('redline-mark.sidebar.focus');

      vscode.window.showInformationMessage(
        `Opened ${path.basename(relativePath)} in review mode`
      );
    } catch (error) {
      handleError('Open review mode', error);
      throw error;
    }
  }

  private async renderComments(fileUri: vscode.Uri, session: ReviewSession): Promise<void> {
    // Clear existing threads for this file only
    session.commentThreads.forEach(thread => thread.dispose());
    session.commentThreads.clear();

    for (const comment of session.review.comments) {
      await this.createCommentThread(fileUri, session, comment);
    }
  }

  private async createCommentThread(
    fileUri: vscode.Uri,
    session: ReviewSession,
    comment: Comment
  ): Promise<void> {
    const range = new vscode.Range(
      comment.line - 1, 0,
      (comment.endLine || comment.line) - 1, Number.MAX_SAFE_INTEGER
    );

    const thread = this.commentController.createCommentThread(
      fileUri,
      range,
      this.buildCommentList(comment)
    );

    thread.canReply = true;
    thread.label = this.getThreadLabel(comment);
    thread.state = comment.resolved
      ? vscode.CommentThreadState.Resolved
      : vscode.CommentThreadState.Unresolved;
    thread.collapsibleState = comment.resolved
      ? vscode.CommentThreadCollapsibleState.Collapsed
      : vscode.CommentThreadCollapsibleState.Expanded;

    // Store thread reference
    session.commentThreads.set(comment.id, thread);
  }

  private buildCommentList(comment: Comment): vscode.Comment[] {
    const comments: vscode.Comment[] = [];

    // Add stale anchor warning if needed
    if (!comment.anchorValid && comment.anchorSuggestedLine) {
      comments.push({
        author: { name: 'Redline Mark (System)' },
        body: new vscode.MarkdownString(
          `⚠️ **Comment moved**: Originally line ${comment.anchor.line}, now line ${comment.anchorSuggestedLine}\n\n` +
          `[Update anchor](#update-anchor-${comment.id})`
        ),
        mode: vscode.CommentMode.Preview
      });
    } else if (!comment.anchorValid) {
      comments.push({
        author: { name: 'Redline Mark (System)' },
        body: new vscode.MarkdownString(
          `⚠️ **Content not found**: This comment referenced line ${comment.anchor.line}, but that code no longer exists.\n\n` +
          `Original context:\n\`\`\`\n${comment.anchor.contextLine}\n\`\`\``
        ),
        mode: vscode.CommentMode.Preview
      });
    }

    // Main comment
    comments.push({
      author: {
        name: comment.author === 'claude' ? 'Claude' : comment.authorEmail || 'You',
      },
      body: new vscode.MarkdownString(this.sanitizeMarkdown(comment.body)),
      mode: vscode.CommentMode.Preview,
      label: `${comment.severity.toUpperCase()}`
    });

    // Replies
    for (const reply of comment.thread) {
      comments.push({
        author: {
          name: reply.author === 'claude' ? 'Claude' : reply.authorEmail || 'You'
        },
        body: new vscode.MarkdownString(this.sanitizeMarkdown(reply.body)),
        mode: vscode.CommentMode.Preview
      });
    }

    return comments;
  }

  private getThreadLabel(comment: Comment): string {
    const icon = comment.resolved ? '✓' : '●';
    const status = comment.resolved ? 'Resolved' : 'Open';
    return `${icon} ${comment.severity.toUpperCase()} · ${status}`;
  }

  private sanitizeMarkdown(text: string): string {
    // Prevent XSS in markdown rendering
    // VS Code's MarkdownString is already safe, but we add extra sanitization
    return text
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  async createComment(
    filePath: string,
    line: number,
    endLine: number,
    body: string,
    severity: CommentSeverity
  ): Promise<void> {
    const session = this.activeSessions.get(filePath);
    if (!session) {
      throw new Error('No active review session for this file');
    }

    const gitConfig = vscode.workspace.getConfiguration('git');
    const userEmail = gitConfig.get<string>('userEmail') || null;

    // Read file to create anchor
    const doc = await vscode.workspace.openTextDocument(
      path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, filePath)
    );
    const fileLines = doc.getText().split('\n');
    const anchor = AnchorValidator.createAnchor(fileLines, line, endLine);

    const comment: Comment = {
      id: `c_${nanoid()}`,
      line,
      endLine,
      author: 'user',
      authorEmail: userEmail,
      severity,
      body: body.trim(),
      createdAt: new Date().toISOString(),
      resolved: false,
      resolvedAt: null,
      resolvedBy: null,
      thread: [],
      anchor,
      anchorValid: true,
      anchorLastChecked: new Date().toISOString()
    };

    session.review.comments.push(comment);
    session.review.updatedAt = new Date().toISOString();

    // Create thread in UI
    await this.createCommentThread(doc.uri, session, comment);

    // Persist
    await this.debouncedSave(session);
  }

  async resolveComment(commentId: string): Promise<void> {
    for (const [filePath, session] of this.activeSessions) {
      const comment = session.review.comments.find(c => c.id === commentId);
      if (comment) {
        comment.resolved = true;
        comment.resolvedAt = new Date().toISOString();
        comment.resolvedBy = 'user';
        session.review.updatedAt = new Date().toISOString();

        // Update thread UI
        const thread = session.commentThreads.get(commentId);
        if (thread) {
          thread.state = vscode.CommentThreadState.Resolved;
          thread.label = this.getThreadLabel(comment);
          thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
        }

        await this.debouncedSave(session);
        return;
      }
    }
    throw new Error(`Comment ${commentId} not found`);
  }

  async addReply(commentId: string, body: string): Promise<void> {
    for (const [filePath, session] of this.activeSessions) {
      const comment = session.review.comments.find(c => c.id === commentId);
      if (comment) {
        const gitConfig = vscode.workspace.getConfiguration('git');
        const userEmail = gitConfig.get<string>('userEmail') || null;

        const reply: CommentReply = {
          id: `r_${nanoid()}`,
          author: 'user',
          authorEmail: userEmail,
          body: body.trim(),
          createdAt: new Date().toISOString()
        };

        comment.thread.push(reply);
        session.review.updatedAt = new Date().toISOString();

        // Update thread UI
        const thread = session.commentThreads.get(commentId);
        if (thread) {
          thread.comments = this.buildCommentList(comment);
        }

        await this.debouncedSave(session);
        return;
      }
    }
    throw new Error(`Comment ${commentId} not found`);
  }

  private async computeFileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
  }

  private async loadOrCreateReview(
    relativePath: string,
    absolutePath: string,
    jsonPath: string
  ): Promise<ReviewFile> {
    try {
      // Try to load existing review
      const content = await fs.readFile(jsonPath, 'utf-8');
      let data = JSON.parse(content);

      // Validate and migrate schema
      const validation = SchemaValidator.validate(data);
      if (!validation.valid) {
        vscode.window.showWarningMessage(
          `Review file has validation errors: ${validation.errors?.join(', ')}`
        );
        // Attempt auto-repair
        data = SchemaValidator.repair(data);
      }

      // Migrate if needed
      if (data.schemaVersion < 1) {
        data = await SchemaValidator.migrate(data, data.schemaVersion || 0);
      }

      // Update file hash
      data.fileHash = await this.computeFileHash(absolutePath);

      return data as ReviewFile;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Create new review file
        const fileHash = await this.computeFileHash(absolutePath);
        const fresh: ReviewFile = {
          $schema: 'https://redline-mark.devenollc.com/schemas/v1',
          schemaVersion: 1,
          file: relativePath,
          fileHash,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'in_review',
          comments: [],
          claudeFeedback: {
            sentAt: null,
            mode: null,
            responseFile: null,
            status: null
          }
        };

        await fs.mkdir(path.dirname(jsonPath), { recursive: true });
        await fs.writeFile(jsonPath, JSON.stringify(fresh, null, 2), 'utf-8');
        return fresh;
      }
      throw error;
    }
  }

  private async debouncedSave(session: ReviewSession): Promise<void> {
    const debounceMs = this.config.get<number>('debounceMs', 1000);

    // Clear existing timeout
    const existing = this.saveQueue.get(session.filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule new save
    const timeout = setTimeout(async () => {
      await this.persistReview(session);
      this.saveQueue.delete(session.filePath);
    }, debounceMs);

    this.saveQueue.set(session.filePath, timeout);
  }

  private async persistReview(session: ReviewSession): Promise<void> {
    try {
      const content = JSON.stringify(session.review, null, 2);
      await fs.writeFile(session.reviewJsonPath, content, 'utf-8');
    } catch (error) {
      handleError('Save review', error);
    }
  }

  getActiveSession(filePath: string): ReviewSession | undefined {
    return this.activeSessions.get(filePath);
  }

  getAllActiveSessions(): Map<string, ReviewSession> {
    return this.activeSessions;
  }

  async closeReview(filePath: string): Promise<void> {
    const session = this.activeSessions.get(filePath);
    if (!session) return;

    // Force save any pending changes
    await this.persistReview(session);

    // Dispose threads
    session.commentThreads.forEach(thread => thread.dispose());
    session.commentThreads.clear();

    // Remove session
    this.activeSessions.delete(filePath);
  }
}
