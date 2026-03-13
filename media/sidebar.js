// @ts-check
(function() {
  const vscode = acquireVsCodeApi();

  window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
      case 'updateReviews':
        renderReviews(message.data);
        break;
    }
  });

  function renderReviews(reviews) {
    const app = document.getElementById('app');

    if (reviews.length === 0) {
      app.innerHTML = `
        <div class="empty-state">
          <p>No active reviews</p>
          <p class="hint">Open a file with <code>Cmd+Shift+P → Redline Mark: Open in Redline Mark Mode</code></p>
        </div>
      `;
      return;
    }

    app.innerHTML = reviews.map(review => `
      <div class="review-card">
        <div class="review-header">
          <h3>${escapeHtml(review.fileName)}</h3>
        </div>

        <div class="review-stats">
          <span class="stat">● ${review.openComments} open</span>
          <span class="stat">✓ ${review.resolvedComments} resolved</span>
        </div>

        <div class="comments-list">
          ${review.comments.map(comment => `
            <div class="comment ${comment.resolved ? 'resolved' : ''}"
                 data-action="jump"
                 data-file="${escapeHtml(review.filePath)}"
                 data-line="${comment.line}">
              <div class="comment-header">
                <span class="severity severity-${comment.severity}">${comment.severity}</span>
                <span class="line-number">Line ${comment.line}</span>
                ${comment.resolved ? '<span class="resolved-badge">✓</span>' : ''}
              </div>
              <div class="comment-body">${escapeHtml(truncate(comment.body, 80))}</div>
              ${comment.replyCount > 0 ? `<div class="reply-count">${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}</div>` : ''}
              ${!comment.resolved ? `
                <button class="resolve-btn"
                        data-action="resolve"
                        data-comment-id="${escapeHtml(comment.id)}">
                  Resolve
                </button>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="actions">
          <button data-action="send"
                  data-file="${escapeHtml(review.filePath)}"
                  class="primary-button">
            Send to Claude
          </button>
        </div>

        ${review.claudeFeedback.status ? `
          <div class="feedback-status status-${review.claudeFeedback.status}">
            Status: ${review.claudeFeedback.status}
            ${review.claudeFeedback.responseFile ? `<br>Response: ${escapeHtml(review.claudeFeedback.responseFile)}` : ''}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  // Event delegation — handles all clicks inside #app without inline handlers
  document.getElementById('app').addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    if (action === 'jump') {
      vscode.postMessage({
        command: 'jumpToComment',
        filePath: target.dataset.file,
        line: parseInt(target.dataset.line, 10)
      });
    } else if (action === 'resolve') {
      e.stopPropagation(); // prevent jump from also firing
      vscode.postMessage({
        command: 'resolveComment',
        commentId: target.dataset.commentId
      });
    } else if (action === 'send') {
      vscode.postMessage({
        command: 'sendToClaude',
        filePath: target.dataset.file
      });
    }
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
})();
