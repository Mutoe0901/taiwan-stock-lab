/* FCM data-only Web Push. Separate scope preserves the existing offline PWA. */
let queue=Promise.resolve();
function enqueue(fn){const task=queue.then(fn);queue=task.catch(()=>{});return task;}
const DB_NAME='stocklab-web-push-071',STORE='state';
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function change(fn){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE);let result;
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage aborted'));
  fn(s,v=>{result=v;});
 });}finally{db.close();}
}
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
 if(e.data?.type!=='STOCKLAB_PUSH_OWNER'||!e.source?.url||new URL(e.source.url).origin!==self.location.origin)return;
 e.waitUntil(enqueue(()=>change(s=>s.put(typeof e.data.uid==='string'?e.data.uid:null,'uid'))
  .then(async()=>{for(const n of await self.registration.getNotifications())n.close();e.ports[0]?.postMessage({ok:true});})
  .catch(()=>e.ports[0]?.postMessage({ok:false}))));
});
async function receive(payload){
 const d=payload?.data;
 if(!d?.uid||!d.event_id||!d.title||!d.body)return;
 const accepted=await change((s,done)=>{
  const owner=s.get('uid');owner.onsuccess=()=>{
   if(owner.result!==d.uid){done(false);return;}
   const seen=s.get('seen');seen.onsuccess=()=>{
    const ids=Array.isArray(seen.result)?seen.result:[];
    if(ids.includes(d.event_id)){done(false);return;}
    s.put([...ids.slice(-499),d.event_id],'seen');done(true);
   };
  };
 });
 if(!accepted)return;
 await self.registration.showNotification(d.title,{body:d.body,tag:d.event_id,renotify:false,icon:new URL('../icon.svg',self.registration.scope).href,data:{url:new URL('../#ab',self.registration.scope).href}});
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of windows)client.postMessage({type:'STOCKLAB_PUSH_RECEIVED',uid:d.uid,test:d.type==='test',title:d.title,body:d.body});
}
self.addEventListener('push',e=>{let payload;try{payload=e.data?.json();}catch{return;}e.waitUntil(enqueue(()=>receive(payload)));});
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 e.waitUntil((async()=>{
  const target=new URL('../#ab',self.registration.scope).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>new URL(c.url).origin===self.location.origin);
  if(existing){await existing.navigate(target);await existing.focus();}else await self.clients.openWindow(target);
 })());
});
