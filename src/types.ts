import * as vscode from 'vscode';

export type ReviewStatus = 'draft' | 'in_review' | 'sent' | 'resolved';
export type CommentSeverity = 'info' | 'question' | 'warning' | 'blocker';
export type CommentAuthor = 'user' | 'claude';
export type FeedbackMode = 'revise' | 'converse' | 'new_version';
export type FeedbackStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CommentReply {
  id: string;
  author: CommentAuthor;
  authorEmail: string | null;
  body: string;
  createdAt: string;
}

export interface CommentAnchor {
  line: number;
  endLine: number;
  contextBefore: string;      // Line before target (for validation)
  contextLine: string;         // The actual line(s) being commented on
  contextAfter: string;        // Line after target (for validation)
  contentHash: string;         // Hash of context for quick comparison
  createdAt: string;           // When anchor was created
}

export interface Comment {
  id: string;
  line: number;
  endLine: number;
  author: CommentAuthor;
  authorEmail: string | null;
  severity: CommentSeverity;
  body: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: CommentAuthor | null;
  thread: CommentReply[];

  // Anchor validation
  anchor: CommentAnchor;
  anchorValid: boolean;
  anchorLastChecked: string;
  anchorSuggestedLine?: number; // If anchor moved, suggested new line
}

export interface ClaudeFeedback {
  sentAt: string | null;
  mode: FeedbackMode | null;
  responseFile: string | null;
  status: FeedbackStatus | null;
}

export interface ReviewFile {
  $schema?: string;
  schemaVersion: number;
  file: string;
  fileHash: string;
  createdAt: string;
  updatedAt: string;
  status: ReviewStatus;
  comments: Comment[];
  claudeFeedback: ClaudeFeedback;
}

export interface ReviewSession {
  filePath: string;
  reviewJsonPath: string;
  review: ReviewFile;
  commentThreads: Map<string, vscode.CommentThread>;
}

export interface AnchorValidationResult {
  valid: boolean;
  originalLine: number;
  currentLine: number | null;
  confidence: 'exact' | 'high' | 'medium' | 'low' | 'lost';
  reason?: string;
}

export interface FileValidationResult {
  totalComments: number;
  validAnchors: number;
  staleAnchors: number;
  repairedAnchors: number;
  lostAnchors: number;
  results: Map<string, AnchorValidationResult>;
}
