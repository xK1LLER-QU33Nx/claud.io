import fs from 'fs';
import path from 'path';

const bundlePath = path.resolve('dist/bundle.js');

if (!fs.existsSync(bundlePath)) {
  console.error(`Error: Bundle not found at ${bundlePath}`);
  process.exit(1);
}

console.log(`[patch-bundle] Patching ${bundlePath}...`);
let content = fs.readFileSync(bundlePath, 'utf8');

// The marker for Bun's __toESM helper
const oldToESM = 'var __toESM = (mod2, isNodeMode, target) => {';
const newToESM = `var __toESM = (mod2, isNodeMode, target) => {
  if (mod2 === undefined || mod2 === null) {
    return { default: mod2 };
  }
`;

if (content.includes(oldToESM)) {
  content = content.replace(oldToESM, newToESM);
  fs.writeFileSync(bundlePath, content);
  console.log('[patch-bundle] Successfully patched __toESM with null safety.');
} else {
  console.warn('[patch-bundle] Warning: Could not find __toESM helper. Bundle might already be patched or use a different format.');
}
