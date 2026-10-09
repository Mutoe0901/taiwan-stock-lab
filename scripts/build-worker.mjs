import fs from 'node:fs';
// Reuse exactly the browser A/B engine: no second set of trading rules.
const file=fs.readFileSync('web/ab-strategies.js','utf8');
const begin=file.indexOf("  'use strict';");
const end=file.lastIndexOf('\n});');
if(begin<0||end<begin||!file.includes('return Object.freeze({DEFAULTS'))throw Error('A/B engine format changed; stop instead of deploying divergent strategies');
const core=file.slice(begin,end);
fs.mkdirSync('cloudflare/src',{recursive:true});
fs.writeFileSync('cloudflare/src/strategy.mjs','/* Generated; do not edit. Source: web/ab-strategies.js */\nconst engine = (function(){\n'+core+'\n})();\nexport default engine;\n');
console.log('Generated Cloudflare strategy module from web/ab-strategies.js');
