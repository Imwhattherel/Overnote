// Startup regression: a malformed HTML attribute in 2.1.2 caused render()
// to throw before displaying saved notes. This test requires only Node.js.
const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
assert.match(html, /<div\s+id="editingTools"\s+role="toolbar"/, 'Missing valid formatting-toolbar element');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const defined = new Set(ids);
assert.strictEqual(ids.length, defined.size, 'Duplicate DOM ids');
const refs = [...html.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
for (const id of refs) {
  if (id === 'menu') continue; // Dynamically created context menu.
  assert(defined.has(id), `Renderer references missing element #${id}`);
}
// Ensure tabs touch the editor edge; depth is inset rather than outer shadows.
assert.match(html, /\.tab \{[^}]*width:100%;[^}]*margin:0;/s);
assert.match(html, /\.tab\.on \{[^}]*background:var\(--tc\)/s);
// Inactive depth is drawn within tab bounds, not with external raised-button borders.
assert.match(html, /\.tab:not\(\.on\)::after \{[^}]*right:0; width:8px;/s);
assert.match(html, /\.tab:not\(\.on\)::after \{[^}]*pointer-events:none;/s);
assert.match(html, /\.tab \{ padding:0 6px; margin-right:0; \}/s);
console.log('DOM startup test passed: referenced controls exist; editor and edge-joined tabs are present.');
