// @ts-check
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Import compiled output
const { PathValidator } = require('../out/pathValidator');

const ROOT = '/workspace';

test('valid .claude/ path is accepted', () => {
  const r = PathValidator.validateReviewPath('.claude/plans/plan.md', ROOT);
  assert.equal(r.valid, true);
  assert.equal(r.normalized, '.claude/plans/plan.md');
});

test('path with .. traversal is blocked', () => {
  const r = PathValidator.validateReviewPath('../../etc/passwd', ROOT);
  assert.equal(r.valid, false);
  assert.match(r.error, /traversal/i);
});

test('path with encoded .. traversal is blocked', () => {
  const r = PathValidator.validateReviewPath('%2e%2e%2fetc%2fpasswd', ROOT);
  assert.equal(r.valid, false);
});

test('absolute path is blocked', () => {
  const r = PathValidator.validateReviewPath('/etc/passwd', ROOT);
  assert.equal(r.valid, false);
  assert.match(r.error, /relative/i);
});

test('path outside .claude/ is blocked', () => {
  const r = PathValidator.validateReviewPath('src/extension.ts', ROOT);
  assert.equal(r.valid, false);
  assert.match(r.error, /\.claude/i);
});

test('sanitizeForShell removes metacharacters', () => {
  assert.equal(PathValidator.sanitizeForShell('file; rm -rf /'), 'file rm -rf /');
  assert.equal(PathValidator.sanitizeForShell('file|evil'), 'fileevilstring'.includes('|') ? 'fail' : 'fileevil');
});

test('sanitizeForShell removes pipe, ampersand, backtick, dollar', () => {
  const dangerous = 'a|b&c`d$e(f)g';
  const result = PathValidator.sanitizeForShell(dangerous);
  assert.ok(!result.includes('|'));
  assert.ok(!result.includes('&'));
  assert.ok(!result.includes('`'));
  assert.ok(!result.includes('$'));
  assert.ok(!result.includes('('));
  assert.ok(!result.includes(')'));
});

test('getReviewJsonPath returns correct path', () => {
  const result = PathValidator.getReviewJsonPath('/workspace', '.claude/plans/my-plan.md');
  assert.equal(result, path.join('/workspace', '.claude', 'reviews', 'my-plan.review.json'));
});
