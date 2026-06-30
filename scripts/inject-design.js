/* Injecte design-upgrade.css dans tous les fichiers HTML */
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TAG  = '<link rel="stylesheet" href="/assets/design-upgrade.css">';

const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
let count = 0;

for (const file of files) {
  const fp = path.join(ROOT, file);
  let src = fs.readFileSync(fp, 'utf8');
  if (src.includes('design-upgrade.css')) continue; // déjà injecté
  // Insère juste avant </head>
  if (src.includes('</head>')) {
    src = src.replace('</head>', `  ${TAG}\n</head>`);
    fs.writeFileSync(fp, src, 'utf8');
    count++;
  }
}
console.log(`✅ design-upgrade.css injecté dans ${count} pages HTML`);
