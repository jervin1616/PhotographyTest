// Fails the build if anything private is inside the public asset directory (dist/).
import fs from 'node:fs';
import path from 'node:path';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const leaked = walk('dist').filter((f) => /(^|\/)clients\//.test(f.replace(/\\/g, '/')) || /proof|processed|meta\.json|page\.html/.test(f));
if (leaked.length) { console.error('LEAK: private files in dist/:', leaked); process.exit(1); }
console.log(`dist check OK (${walk('dist').length} public files, nothing private)`);
