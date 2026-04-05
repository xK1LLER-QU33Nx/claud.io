import fs from 'fs';

const filePath = 'dist/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// Patch __toESM to handle null/undefined and log WITH TRACE
const oldToESM = 'var __toESM = (mod2, isNodeMode, target) => {';
const newToESM = `var __toESM = (mod2, isNodeMode, target) => {
  if (mod2 === undefined || mod2 === null) {
    if (process.env.DEBUG_BUNDLER) {
      console.warn('__toESM called with', mod2);
      console.trace();
    }
    return { default: mod2 };
  }
`;

content = content.replace(oldToESM, newToESM);

fs.writeFileSync('dist/bundle_debug.js', content);
console.log('Debug bundle created at dist/bundle_debug.js');
