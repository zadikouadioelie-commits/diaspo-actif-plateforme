/**
 * Fix 8 : corriger "await db.prepare(`...`).get()?.field"
 * avec des template literals contenant des parenthèses (ex: COUNT(*))
 * La regex utilise des backticks pour capturer l'argument complet.
 */
const fs = require('fs');
const filePath = __dirname + '/index.js';
let src = fs.readFileSync(filePath, 'utf8');
let count = 0;

// Remplace: await db.prepare(`...`).get(args)?.field
// par:      (await db.prepare(`...`).get(args))?.field
// En capturant le template literal entier avec [^`]* entre backticks
src = src.replace(
  /\bawait\s+(db\.prepare\(`[^`]*`\)\.get\([^)]*\))\?\./g,
  (match, inner) => {
    count++;
    return `(await ${inner})?.`;
  }
);

// Aussi: await db.prepare("...").get()?.field  (strings simples avec parens dans SQL)
src = src.replace(
  /\bawait\s+(db\.prepare\("[^"]*"\)\.get\([^)]*\))\?\./g,
  (match, inner) => {
    count++;
    return `(await ${inner})?.`;
  }
);
src = src.replace(
  /\bawait\s+(db\.prepare\('[^']*'\)\.get\([^)]*\))\?\./g,
  (match, inner) => {
    count++;
    return `(await ${inner})?.`;
  }
);

fs.writeFileSync(filePath, src, 'utf8');
console.log(`✅ ${count} occurrences corrigées`);
