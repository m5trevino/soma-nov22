import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const server = http.createServer((req, res) => {
  let filePath = path.join('/home/flintx/soma-nov/turn-key/profile_builder/web', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  const ext = path.extname(filePath);
  const mime = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css' }[ext] || 'text/plain';
  try {
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(filePath));
  } catch (err) {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise(resolve => server.listen(8766, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: false, slowMo: 50 });
const page = await browser.newPage();

const logs = [];
page.on('console', msg => {
  const text = msg.text();
  logs.push(text);
  console.log('[browser]', text);
});

await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle' });

// Wait for models to load
await page.waitForTimeout(2000);

// Focus the page and hold Control, then click 3 model options
await page.keyboard.down('Control');

// Get model options inside the shadow DOM
const options = await page.evaluateHandle(() => {
  const form = document.querySelector('attempt-form').shadowRoot;
  const picker = form.querySelector('model-picker').shadowRoot;
  return picker.querySelectorAll('.option');
});

const count = await options.evaluate(els => els.length);
console.log('options found:', count);

for (let i = 0; i < Math.min(3, count); i++) {
  const opt = await options.evaluateHandle((els, idx) => els[idx], i);
  await opt.click();
  await page.waitForTimeout(100);
}

await page.keyboard.up('Control');

const selectedCount = await page.evaluate(() => {
  const form = document.querySelector('attempt-form').shadowRoot;
  const picker = form.querySelector('model-picker');
  return picker._selectedIds.size;
});

console.log('Final selected count:', selectedCount);
console.log('Logs:', logs);

await browser.close();
server.close();

if (selectedCount !== 3) {
  console.error('FAIL');
  process.exit(1);
} else {
  console.log('PASS');
}
