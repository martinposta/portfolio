'use strict';
// Escapes text for HTML content and double-quoted attributes. Shared by the
// page renderer and the header/footer renderer.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
module.exports = { esc };
