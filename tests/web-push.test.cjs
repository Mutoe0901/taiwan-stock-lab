const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');
const {validateVapid,activeWorker,registrationForScope}=require('../web/alerts-web-push.js');
require('../web/alerts-config.js');
test('configured public VAPID key is a valid P-256 key',async()=>{
 const key=global.STOCKLAB_ALERTS_CONFIG.vapidKey;validateVapid(key);
 await crypto.subtle.importKey('raw',Buffer.from(key,'base64url'),{name:'ECDH',namedCurve:'P-256'},false,[]);
 assert.throws(()=>validateVapid('placeholder'));
});
test('FCM registration waits for its own worker, not the root PWA worker',async()=>{
 const reg=new EventTarget(),worker=new EventTarget();worker.state='installing';reg.installing=worker;reg.active=Object.assign(new EventTarget(),{state:'activated'});
 const ready=activeWorker(reg,200);worker.state='activated';reg.active=worker;worker.dispatchEvent(new Event('statechange'));
 assert.equal(await ready,worker);
 const broken=new EventTarget();broken.active=new EventTarget();broken.active.state='installing';
 await assert.rejects(activeWorker(broken,5),/逾時/);
});
function sw(){
 const handlers={},notifications=[],messages=[],state={};
 const self={location:{origin:'https://site.example'},registration:{scope:'https://site.example/alerts-push/',getNotifications:async()=>[],showNotification:async(title,options)=>notifications.push({title,...options})},clients:{matchAll:async()=>[{postMessage:m=>messages.push(m)}]},addEventListener:(n,fn)=>handlers[n]=fn};
 vm.runInNewContext(readFileSync('web/alerts-push/firebase-messaging-sw.js','utf8'),{self,indexedDB:new IDBFactory(),URL,console});
 const dispatch=async(n,event)=>{let p;handlers[n]({...event,waitUntil:x=>p=x});await p;};
 return {notifications,messages,owner:uid=>dispatch('message',{data:{type:'STOCKLAB_PUSH_OWNER',uid},source:{url:'https://site.example/'},ports:[{postMessage:x=>state.ack=x}]}),push:data=>dispatch('push',{data:{json:()=>({data})}})};
}
test('background and foreground web push display once, enforce UID, and stop after logout',async()=>{
 const app=sw();await app.owner('alice');
 const data={uid:'alice',event_id:'alice|2330|A|BUY IN|bar1',title:'A BUY IN',body:'2330 H1'};
 await app.push({...data,uid:'bob'});assert.equal(app.notifications.length,0);
 await Promise.all([app.push(data),app.push(data)]);assert.equal(app.notifications.length,1);
 assert.equal(app.messages.length,1);assert.equal(app.notifications[0].tag,data.event_id);
 await app.push({...data,event_id:'alice|2330|B|BUY IN|bar1',title:'B BUY IN'});assert.equal(app.notifications.length,2);
 await app.owner(null);await app.push({...data,event_id:'after-logout'});assert.equal(app.notifications.length,2);
 await app.owner('bob');await app.push({...data,event_id:'late-alice'});assert.equal(app.notifications.length,2);
 await app.push({...data,uid:'bob',event_id:'bob-test',type:'test'});assert.equal(app.notifications.length,3);
});

test('push ownership never sends messages to an ancestor PWA registration',async()=>{
 const scope='https://site.example/alerts-push/';
 const lookup=reg=>({getRegistration:async url=>{assert.equal(url,scope);return reg;}});
 assert.equal(await registrationForScope(lookup(undefined),scope),null);
 assert.equal(await registrationForScope(lookup({scope:'https://site.example/'}),scope),null);
 const own={scope};assert.equal(await registrationForScope(lookup(own),scope),own);
});
