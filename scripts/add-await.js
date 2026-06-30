/* Migration script : ajoute await avant tous les appels db.prepare().get/all/run()
   dans server/index.js. À exécuter UNE SEULE FOIS.
   Usage : node scripts/add-await.js */
const fs = require('fs');
const filePath = __dirname + '/../server/index.js';
let src = fs.readFileSync(filePath, 'utf8');
let count = 0;

// Pattern : captures db.prepare(...).(get|all|run)( non déjà précédé de await
// Gère aussi les cas multiligne simples avec const/let/var/return/throw
src = src.replace(
  /(?<!\bawait\s{0,4})(db\.prepare\s*\([^)]*\)\s*\.\s*(get|all|run)\s*\()/g,
  (match) => { count++; return 'await ' + match; }
);

// Cas spécial : variable intermédiaire stmt.get/all/run()
// (très rare dans ce code, géré par la règle précédente si sur même ligne)

fs.writeFileSync(filePath, src, 'utf8');
console.log(`✅ ${count} appels db migrés vers await dans server/index.js`);
