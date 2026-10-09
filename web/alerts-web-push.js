/* Shared Web Push helpers; no credentials or browser globals used at load time. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StocklabWebPush=api;})(globalThis,()=>{
 'use strict';
 function validateVapid(key){
  if(typeof key!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(key))throw Error('VAPID 公開金鑰格式錯誤，請核對 Firebase Cloud Messaging 的 Web Push 憑證');
  const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
  if(bytes.length!==65||bytes[0]!==4)throw Error('VAPID 必須是 P-256 公開金鑰');
  return key;
 }
 function activeWorker(reg,timeout=20000){
  if(!reg.installing&&!reg.waiting&&reg.active?.state==='activated')return Promise.resolve(reg.active);
  return new Promise((resolve,reject)=>{
   let worker;
   const done=(error)=>{clearTimeout(timer);reg.removeEventListener('updatefound',watch);worker?.removeEventListener('statechange',check);error?reject(error):resolve(worker);};
   const check=()=>{if(worker?.state==='activated')done();else if(worker?.state==='redundant')done(Error('推播 Service Worker 啟動失敗，請重新載入網頁'));};
   const watch=()=>{worker?.removeEventListener('statechange',check);worker=reg.installing||reg.waiting||reg.active;worker?.addEventListener('statechange',check);check();};
   const timer=setTimeout(()=>done(Error('推播 Service Worker 等待逾時；請檢查網路或網站快取')),timeout);
   reg.addEventListener('updatefound',watch);watch();
  });
 }
 async function registrationForScope(serviceWorkers,scope){
  // getRegistration() returns the longest matching ancestor, including the root PWA.
  const registration=await serviceWorkers.getRegistration(scope);
  return registration?.scope===scope?registration:null;
 }
 async function setOwner(reg,uid){
  const worker=await activeWorker(reg);
  await new Promise((resolve,reject)=>{
   const channel=new MessageChannel();
   const timer=setTimeout(()=>{channel.port1.close();reject(Error('無法儲存本機推播帳號，請確認瀏覽器允許儲存資料'));},5000);
   channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data?.ok?resolve():reject(Error('無法儲存本機推播帳號'));};
   worker.postMessage({type:'STOCKLAB_PUSH_OWNER',uid:uid||null},[channel.port2]);
  });
 }
 return {validateVapid,activeWorker,registrationForScope,setOwner};
});
