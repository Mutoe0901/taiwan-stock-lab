import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('web/index.html'),script=read('web/main.js'),sw=read('web/sw.js'),wf=read('.github/workflows/android-build.yml');
const p=JSON.parse(read('package.json'));
const tests=[
  [p.version==='0.7.0','package version'],
  [html.includes('id="ab-run"')&&html.includes('data-page="ab"'),'A/B strategy section'],
  [html.includes('ab-strategies.js?v=0.7.0')&&html.includes('ab-ui.js?v=0.7.0'),'A/B script imports'],
  [script.includes('window.StocklabABBridge')&&script.includes('window.StocklabABUI?.render?.()'),'bundle bridge'],
  [sw.includes('stocklab-v0.7.0')&&sw.includes('ab-strategies.js'),'PWA cache invalidation'],
  [wf.includes('Configure stable APK signing')&&wf.includes('secrets.ANDROID_KEYSTORE_BASE64'),'signing workflow'],
  [fs.existsSync('scripts/configure-android-signing.mjs')&&fs.existsSync('tests/ab-strategies.test.cjs'),'new scripts and tests']
];
for(const [ok,name] of tests)console.log((ok?'PASS':'FAIL')+' '+name);
if(tests.some(([ok])=>!ok))process.exit(1);
