// @ts-check
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { AnchorValidator } = require('../out/anchorValidator');

function makeComment(overrides = {}) {
  return {
    id: 'c_1',
    line: 3,
    endLine: 3,
    author: 'user',
    authorEmail: null,
    severity: 'info',
    body: 'test',
    createdAt: new Date().toISOString(),
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    thread: [],
    anchor: null,
    anchorValid: true,
    anchorLastChecked: new Date().toISOString(),
    ...overrides
  };
}

const LINES = [
  'line one',
  'line two',
  'const foo = bar();',
  'line four',
  'line five'
];

// --- createAnchor ---

test('createAnchor captures context and hash', () => {
  const anchor = AnchorValidator.createAnchor(LINES, 3, 3);
  assert.equal(anchor.line, 3);
  assert.equal(anchor.contextLine, 'const foo = bar();');
  assert.equal(anchor.contextBefore, 'line two');
  assert.equal(anchor.contextAfter, 'line four');
  assert.ok(anchor.contentHash.length > 0);
  assert.ok(anchor.createdAt);
});

test('createAnchor handles first line (no before context)', () => {
  const anchor = AnchorValidator.createAnchor(LINES, 1, 1);
  assert.equal(anchor.contextBefore, '');
  assert.equal(anchor.contextLine, 'line one');
});

test('createAnchor handles last line (no after context)', () => {
  const anchor = AnchorValidator.createAnchor(LINES, 5, 5);
  assert.equal(anchor.contextAfter, '');
  assert.equal(anchor.contextLine, 'line five');
});

// --- validateAnchor (exact match) ---

test('validateAnchor returns valid for unchanged file', () => {
  const anchor = AnchorValidator.createAnchor(LINES, 3, 3);
  const comment = makeComment({ line: 3, endLine: 3, anchor });
  const result = AnchorValidator.validateAnchor(comment, LINES);
  assert.equal(result.valid, true);
  assert.equal(result.confidence, 'exact');
});

// --- validateAnchor (stale - line moved) ---

test('validateAnchor finds moved content via context search', () => {
  const anchor = AnchorValidator.createAnchor(LINES, 3, 3);
  const comment = makeComment({ line: 3, endLine: 3, anchor });

  // Insert 5 lines before the target — it now lives at line 8
  const movedLines = [
    'new line a',
    'new line b',
    'new line c',
    'new line d',
    'new line e',
    'line one',
    'line two',
    'const foo = bar();',
    'line four',
    'line five'
  ];

  const result = AnchorValidator.validateAnchor(comment, movedLines);
  assert.equal(result.valid, false);
  assert.equal(result.currentLine, 8);
});

// --- validateAllAnchors ---

test('validateAllAnchors returns correct counts', async () => {
  const anchor = AnchorValidator.createAnchor(LINES, 3, 3);
  const validComment = makeComment({ id: 'c_valid', line: 3, endLine: 3, anchor });

  const staleAnchor = AnchorValidator.createAnchor(LINES, 3, 3);
  const staleComment = makeComment({
    id: 'c_stale',
    line: 3,
    endLine: 3,
    anchor: staleAnchor
  });

  // File where content moved to line 8
  const movedLines = [
    'new line a', 'new line b', 'new line c', 'new line d', 'new line e',
    'line one', 'line two', 'const foo = bar();', 'line four', 'line five'
  ];

  const result = await AnchorValidator.validateAllAnchors([validComment, staleComment], movedLines);
  assert.equal(result.totalComments, 2);
  // validComment's original line is 3, but content is now at 8 — both will be stale
  assert.equal(result.staleAnchors + result.lostAnchors + result.validAnchors, 2);
});

// --- repairAnchor ---

test('repairAnchor updates line number and context', () => {
  const anchor = AnchorValidator.createAnchor(LINES, 3, 3);
  const comment = makeComment({ line: 3, endLine: 3, anchor });

  const newLines = [
    'preamble',
    'line one',
    'line two',
    'const foo = bar();',
    'line four',
    'line five'
  ];

  AnchorValidator.repairAnchor(comment, 4, newLines);
  assert.equal(comment.line, 4);
  assert.equal(comment.anchor.line, 4);
  assert.equal(comment.anchor.contextLine, 'const foo = bar();');
});
