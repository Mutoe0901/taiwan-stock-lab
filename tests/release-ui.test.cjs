const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{JSDOM}=require('jsdom');
const html=readFileSync('web/index.html','utf8');
test('release menu order and footer match APK v0.7.2; invitation and plaintext query input removed',()=>{
 const doc=new JSDOM(html).window.document;
 assert.deepEqual([...doc.querySelectorAll('nav[aria-label="主要功能"] button')].map(e=>[e.dataset.page,e.textContent.trim().slice(0,2)]),[['scanner','01'],['overview','02'],['bigdata','03'],['strategy','04'],['ab','05'],['flows','06'],['report','07']]);
 assert.match(doc.querySelector('footer').textContent,/v0\.7\.2/);
 assert.equal(doc.querySelector('#alerts-invite-panel'),null);assert.equal(doc.querySelector('#ab-fugle-key'),null);
 for(const id of ['alerts-key','alerts-key-save','alerts-key-check','alerts-key-delete','alerts-register'])assert.ok(doc.getElementById(id),id);
 assert.equal(doc.querySelector('#alerts-key').type,'password');
});
test('A/B UI executes real D1 backtests and clears private H1 results on account change',()=>{
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://stock.test/'}),w=dom.window;
 w.eval(readFileSync('web/ab-strategies.js','utf8'));w.eval(readFileSync('web/h1.js','utf8'));
 const bars=Array.from({length:100},(_,i)=>({date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),open:100+i/10,high:102+i/10,low:99+i/10,close:101+i/10,volume:1000}));
 w.StocklabABBridge={getSelected:()=>({id:'2330',name:'台積電',bars}),getBundle:()=>({mode:'real'})};
 w.eval(readFileSync('web/ab-ui.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.document.querySelector('#ab-run').click();
 assert.match(w.document.querySelector('#ab-status').textContent,/已完成 A／B 策略回測/);
 w.dispatchEvent(new w.Event('stocklab-account-changed'));
 assert.equal(w.document.querySelector('#ab-export').disabled,true);assert.equal(w.document.querySelector('#ab-trades').textContent,'');
 dom.window.close();
});
