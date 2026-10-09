/* Taiwan Stock Lab v0.7.2 multi-user H1 alerts. Firebase ID tokens are verified by Worker. */
(()=>{
'use strict';
const cfg=globalThis.STOCKLAB_ALERTS_CONFIG||{},$=id=>document.getElementById(id);
let keyConfigured=false;
let app,auth,authSDK,currentUser=null,currentRole='',pushToken='',firebaseInitPromise=null;
let webRegistration=null,webMessaging=null,webSDK=null,pushBusy=false,androidListeners=false,androidRegistrationUid=null;
const nativePlatform=()=>!!globalThis.StocklabCapacitor?.Capacitor?.isNativePlatform?.();
const TOKEN_RECORD='stocklab.webpush.071';
const ANDROID_RECORD='stocklab.androidpush.071';
const savedAndroid=()=>{try{return JSON.parse(localStorage.getItem(ANDROID_RECORD)||'null');}catch{return null;}};
const savedPush=()=>{try{return JSON.parse(localStorage.getItem(TOKEN_RECORD)||'null');}catch{return null;}};
function resetUserUI(){
 currentRole='';pushToken='';keyConfigured=false;
 if($('alerts-key'))$('alerts-key').value='';
 if($('alerts-key-status'))$('alerts-key-status').textContent='尚未登入';
 window.dispatchEvent(new Event('stocklab-account-changed'));
 for(const id of ['alerts-test-push','alerts-test-web-push'])if($(id))$(id).hidden=true;
 if($('alerts-symbols'))$('alerts-symbols').value='';
 if($('alerts-password'))$('alerts-password').value='';
 if($('alerts-ratio'))$('alerts-ratio').value='1.2';
 for(const id of ['alerts-strategy-A','alerts-strategy-B','alerts-BUY-IN','alerts-SELL-IN','alerts-PROFIT-OUT','alerts-FAIL-OUT'])if($(id))$(id).checked=true;
}
async function existingWebRegistration(){
 if(!('serviceWorker' in navigator))return null;
 return StocklabWebPush.registrationForScope(navigator.serviceWorker,new URL('./alerts-push/',location.href).href);
}
async function clearWebOwner(){const reg=webRegistration||await existingWebRegistration();if(reg)await StocklabWebPush.setOwner(reg,null);}

function readableError(e){
 const code=String(e?.code||'');
 const labels={
  'messaging/token-subscribe-failed':'FCM Token 註冊遭拒。請確認 Firebase 專案的 FCM Registration API、Web Push VAPID 金鑰與 API Key 限制。',
  'messaging/permission-blocked':'通知已封鎖。請在 Chrome 網址列的網站設定允許通知，再重新啟用。',
  'auth/network-request-failed':'無法連接 Firebase，請檢查手機網路及 Android WebView 是否允許連線。',
  'auth/invalid-email':'電子郵件格式不正確。',
  'auth/invalid-credential':'信箱或密碼錯誤；如首次使用，請先建立帳號。',
  'auth/wrong-password':'密碼錯誤。',
  'auth/user-not-found':'找不到帳號，請先使用「建立信箱密碼帳號」。',
  'auth/email-already-in-use':'這個信箱已建立 Firebase 帳號。如先前用 Google 登入，需先透過網頁登入並連結獨立密碼；不要輸入 Google 密碼。',
  'auth/operation-not-allowed':'Firebase 尚未啟用信箱／密碼登入。',
  'auth/weak-password':'密碼強度不足，請設定至少 12 字元的獨立密碼。',
  'auth/too-many-requests':'請求過於頻繁，請稍後再試。',
  'auth/unauthorized-domain':'Firebase 尚未授權目前登入網域。',
  'auth/popup-blocked':'登入視窗被封鎖，請用電腦瀏覽器重試。',
  'auth/account-exists-with-different-credential':'此信箱曾使用其他登入方式。請先以原方式登入再連結 Google。',
  'auth/credential-already-in-use':'這個 Google 身分已連結其他 Firebase 帳號，請確認使用相同 Google 帳號。'
 };
 if(labels[code])return labels[code];
 return String(e?.message||e||'未知錯誤');
}
let toastTimer;
function write(value,bad=false){
 const message=String(value);const el=$('alerts-status');
 if(el){el.textContent=message;el.style.color=bad?'#bf404a':'';}
 let toast=$('alerts-mobile-feedback');
 if(!toast){
  toast=document.createElement('div');toast.id='alerts-mobile-feedback';toast.setAttribute('role','status');
  Object.assign(toast.style,{position:'fixed',left:'12px',right:'12px',bottom:'92px',zIndex:'999999',padding:'14px 16px',borderRadius:'12px',boxShadow:'0 4px 24px #0005',fontSize:'15px',lineHeight:'1.5',fontWeight:'600',overflowWrap:'anywhere',whiteSpace:'pre-wrap',pointerEvents:'auto',maxHeight:'40vh',overflowY:'auto'});
  toast.addEventListener('click',()=>{toast.style.display='none';});
  document.body.appendChild(toast);
 }
 toast.textContent=message;toast.style.display='block';toast.style.background=bad?'#fff0ef':'#e7faf4';toast.style.color=bad?'#84231e':'#075c4b';
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.style.display='none';},9000);
}
const endpoint=()=>{const url=(cfg.workerUrl||'').replace(/\/$/,'');if(!/^https:\/\/[^/]+$/.test(url))throw Error('請先設定 alerts-config.js 的 Worker 網址');return url;};
async function firebase(){
 if(auth)return;
 if(firebaseInitPromise)return firebaseInitPromise;
 firebaseInitPromise=(async()=>{
 if(!cfg.firebase?.apiKey||!cfg.firebase?.appId||!cfg.firebase?.projectId)throw Error('請先設定 alerts-config.js 的 Firebase 公開資訊');
 const [a,lib]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')]);
 app=a.initializeApp(cfg.firebase,'stocklab-alerts-071');authSDK=lib;
 // Android WebView requires explicit IndexedDB persistence for the JS Firebase session.
 const native=!!globalThis.StocklabCapacitor?.Capacitor?.isNativePlatform?.();
 auth=native?lib.initializeAuth(app,{persistence:lib.indexedDBLocalPersistence}):lib.getAuth(app);
 lib.onAuthStateChanged(auth,async user=>{
   const previousUid=currentUser?.uid;
   currentUser=user;
   if(previousUid!==user?.uid)resetUserUI();
   if(!nativePlatform()){
    const record=savedPush();
    if(!user||record&&record.uid!==user.uid){
     try{await clearWebOwner();localStorage.removeItem(TOKEN_RECORD);}catch(error){write(readableError(error),true);}
    }
   }
   if(currentUser!==user)return;
   if(!user){$('alerts-user').textContent='尚未登入';return;}
   $('alerts-user').textContent='已登入：'+(user.email||'')+(user.emailVerified?'':'（請先驗證信箱）');
   if(!user.emailVerified){write('請先驗證電子郵件後再操作雲端監控。');return;}
   try{await connect();if(!nativePlatform()&&savedPush()?.uid===user.uid&&'Notification' in window&&Notification.permission==='granted')await registerWeb();}catch(error){write(readableError(error),true);}
 });
 })().catch(error=>{firebaseInitPromise=null;throw error;});
 return firebaseInitPromise;
}
async function api(path,{method='GET',data}={}){
 await firebase();if(!currentUser)throw Error('請先登入 Firebase');
 const caller=currentUser;const token=await caller.getIdToken();
 if(currentUser?.uid!==caller.uid)throw Error('帳號已切換，請重新操作');
 const res=await fetch(endpoint()+path,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});
 if(currentUser?.uid!==caller.uid)throw Error('帳號已切換，請重新操作');
 const value=await res.json().catch(()=>({error:'非 JSON 回應'}));if(!res.ok)throw Error(value.error||'服務錯誤 HTTP '+res.status);return value;
}
function chosenFlags(){return ['BUY IN','SELL IN','PROFIT OUT','FAIL OUT'].reduce((obj,k)=>(obj[k]=!!$('alerts-'+k.replace(/ /g,'-'))?.checked,obj),{});}
function choices(){return ['A','B'].filter(k=>$('alerts-strategy-'+k)?.checked);}
function display(x){$('alerts-symbols').value=(x.symbols||[]).join(',');$('alerts-ratio').value=x.volumeRatio;for(const [k,v] of Object.entries(x.flags||{})){const input=$('alerts-'+k.replace(/ /g,'-'));if(input)input.checked=v;}for(const k of ['A','B'])$('alerts-strategy-'+k).checked=(x.strategies||[]).includes(k);}
function displayKey(v){keyConfigured=!!v.configured;const e=$('alerts-key-status');if(e)e.textContent=v.configured?'已安全保存個人金鑰'+(v.status==='error'?'；檢查結果：'+v.last_error:''):'尚未設定個人 Fugle Key';}
async function keyStatus(){displayKey(await api('/api/key'));}
async function saveKey(){const input=$('alerts-key'),key=input.value.trim();input.value='';try{const result=await api('/api/key',{method:'POST',data:{key}});displayKey(result);window.dispatchEvent(new Event('stocklab-account-changed'));write('金鑰已驗證並加密保存，下次登入自動使用。');}finally{input.value='';}}
async function checkKey(){await api('/api/key/check',{method:'POST'});await keyStatus();write('個人 Fugle Key 與 H1 權限檢查成功。');}
async function deleteKey(){if(!confirm('刪除你的 Fugle Key 並停止行情查詢及新訊號監控？股票設定與推播訂閱會保留。'))return;displayKey(await api('/api/key',{method:'DELETE'}));window.dispatchEvent(new Event('stocklab-account-changed'));write('個人金鑰已刪除；股票設定與推播訂閱保留。');}
async function connect(){const v=await api('/api/settings');currentRole=v.role;display(v);displayKey(v.credentials||{});$('alerts-user').textContent='已登入：'+v.email;for(const id of ['alerts-test-push','alerts-test-web-push'])if($(id))$(id).hidden=id==='alerts-test-push'?!nativePlatform():nativePlatform();write(keyConfigured?'已連接個人雲端監控，將自動使用你的 Fugle Key。':'已登入；請先設定自己的 Fugle Key。');}
async function signGoogle(){
 await firebase();
 const cap=globalThis.StocklabCapacitor;
 if(cap?.Capacitor?.isNativePlatform?.()){
   if(!cap.registerPlugin)throw Error('Android 原生登入功能未載入，請安裝含 Google 登入的新版 APK。');
   const nativeAuth=cap.registerPlugin('FirebaseAuthentication');
   if(typeof nativeAuth?.signInWithGoogle!=='function')throw Error('缺少 FirebaseAuthentication 原生套件，請安裝新版 APK。');
   // Native account chooser -> Google ID token -> same Firebase JS Auth session as the Web.
   const result=await nativeAuth.signInWithGoogle({skipNativeAuth:true});
   const idToken=result?.credential?.idToken;
   if(!idToken)throw Error('Google 未回傳 ID Token。請先確認 Firebase Android SHA-1 與最新 google-services.json。');
   await authSDK.signInWithCredential(auth,authSDK.GoogleAuthProvider.credential(idToken));
   write('Google 帳號登入成功，正在取得個人監控設定…');
   return;
 }
 await authSDK.signInWithPopup(auth,new authSDK.GoogleAuthProvider());
}
async function signEmail(){await firebase();const email=$('alerts-email').value.trim(),password=$('alerts-password').value;if(!email||!password)throw Error('請先填寫 Firebase 信箱和密碼；如首次使用請按「建立信箱密碼帳號」。');await authSDK.signInWithEmailAndPassword(auth,email,password);$('alerts-password').value='';write('Firebase 登入成功，正在取得你的雲端設定…');}
async function signUpEmail(){
 await firebase();const email=$('alerts-email').value.trim(),password=$('alerts-password').value;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('請輸入有效的信箱。');
 if(password.length<12)throw Error('請建立至少 12 字元的獨立密碼，切勿填入 Gmail 密碼。');
 const result=await authSDK.createUserWithEmailAndPassword(auth,email,password);
 await authSDK.sendEmailVerification(result.user);
 $('alerts-password').value='';
 write('帳號已建立並寄出驗證信。請到信箱點開驗證連結，再回 App 點「重新確認驗證」；這不是你的 Gmail 密碼。');
}
async function refreshVerification(){
 await firebase();if(!auth.currentUser)throw Error('請先登入 Firebase。');
 await auth.currentUser.reload();currentUser=auth.currentUser;
 if(!currentUser.emailVerified)throw Error('尚未驗證信箱，請先點擊驗證郵件裡的連結。');
 await currentUser.getIdToken(true);write('信箱已驗證，正在連線你的台股監控設定…');await connect();
}
async function linkPassword(){
 await firebase();if(!currentUser?.emailVerified)throw Error('請先以 Google 登入並完成驗證');
 const password=$('alerts-password').value;
 if(password.length<12)throw Error('請使用至少 12 字元的獨立密碼，不要使用 Google 帳號密碼');
 await authSDK.linkWithCredential(currentUser,authSDK.EmailAuthProvider.credential(currentUser.email,password));
 $('alerts-password').value='';write('已為相同 Firebase UID 新增信箱密碼登入方式，可供 Android 使用。');
}
async function sendVerification(){await firebase();if(!currentUser)throw Error('請先登入');await authSDK.sendEmailVerification(currentUser);write('驗證信已寄出，請完成驗證後重新登入。');}
async function signout(){
 if(pushBusy)throw Error('正在註冊推播，請稍後再登出');
 const record=nativePlatform()?savedAndroid():savedPush(),token=pushToken||(record?.uid===currentUser?.uid?record.token:'');
 if(!nativePlatform())await clearWebOwner();
 if(token)await api('/api/unregister',{method:'POST',data:{token}});
 // Do not unregister other devices: Android and Chrome remain independent.
 if(!nativePlatform()&&token){
  const sdk=webSDK||await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');
  await sdk.deleteToken(webMessaging||sdk.getMessaging(app));
  localStorage.removeItem(TOKEN_RECORD);
 }
 if(nativePlatform())localStorage.removeItem(ANDROID_RECORD);
 await authSDK.signOut(auth);resetUserUI();
 write('已登出本機；同帳號的其他裝置仍可接收推播。');
}

async function save(){const symbols=$('alerts-symbols').value.split(/[,，\s]+/).filter(Boolean);const v=await api('/api/settings',{method:'POST',data:{symbols,flags:chosenFlags(),strategies:choices(),volumeRatio:Number($('alerts-ratio').value)}});display(v);write('已儲存你的自選股及 A/B 通知選項。');}
async function registerAndroid(){const cap=globalThis.StocklabCapacitor;if(!cap?.Capacitor?.isNativePlatform?.())return false;
 const Push=cap.registerPlugin?.('PushNotifications');if(!Push)throw Error('請先安裝整合 Firebase 的新版 APK');
 androidRegistrationUid=currentUser?.uid;
 if(!androidListeners){
 await Push.addListener('registration',async ({value})=>{try{if(!currentUser?.emailVerified||currentUser.uid!==androidRegistrationUid)return;pushToken=value;localStorage.setItem(ANDROID_RECORD,JSON.stringify({uid:currentUser.uid,token:value}));await api('/api/register',{method:'POST',data:{token:value,platform:'android'}});write('此 Android 裝置已訂閱個人交易訊號');}catch(err){write(err.message,true);}});
 await Push.addListener('registrationError',()=>write('Android FCM 註冊失敗',true));
 await Push.addListener('pushNotificationReceived',notice=>write('Firebase push: '+(notice.title||'')+' '+(notice.body||'')));
 androidListeners=true;
 }
 await Push.createChannel({id:'stocklab_signals',name:'台股交易訊號',description:'H1 A/B 雙策略訊號',importance:4,visibility:1});
 let p=await Push.checkPermissions();if(p.receive!=='granted')p=await Push.requestPermissions();if(p.receive!=='granted')throw Error('請允許手機通知權限');await Push.register();return true;
}
async function registerWeb(){
 if(!window.isSecureContext)throw Error('網頁推播需要 HTTPS 安全連線');
 if(!('serviceWorker' in navigator)||!('Notification' in window)||!('PushManager' in window))throw Error('這個瀏覽器不支援網頁推播，請使用一般模式的 Chrome');
 StocklabWebPush.validateVapid(cfg.vapidKey);
 if(!currentUser?.emailVerified)throw Error('請先登入並驗證帳號');
 if(Notification.permission!=='granted')throw Error('請按「啟用本機推播」並允許 Chrome 通知權限');
 const user=currentUser;
 webSDK=webSDK||await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');
 if(!await webSDK.isSupported())throw Error('FCM 無法使用；請檢查 Chrome、IndexedDB 與通知設定');
 write('正在啟動網頁推播 Service Worker…');
 webRegistration=await navigator.serviceWorker.register(new URL('./alerts-push/firebase-messaging-sw.js',location.href).href,{scope:new URL('./alerts-push/',location.href).href,updateViaCache:'none'});
 await StocklabWebPush.activeWorker(webRegistration);
 await StocklabWebPush.setOwner(webRegistration,null);
 webMessaging=webSDK.getMessaging(app);
 write('正在向 Firebase 註冊 FCM Token…');
 const token=await webSDK.getToken(webMessaging,{vapidKey:cfg.vapidKey,serviceWorkerRegistration:webRegistration});
 if(!token)throw Error('Firebase 未回傳 FCM Token，請檢查 Web Push 設定');
 if(currentUser?.uid!==user.uid)throw Error('帳號已切換，請重新啟用本機推播');
 // Retain pending token for device-specific cleanup if the API is unavailable.
 localStorage.setItem(TOKEN_RECORD,JSON.stringify({uid:user.uid,token}));
 await api('/api/register',{method:'POST',data:{token,platform:'web'}});
 if(currentUser?.uid!==user.uid)throw Error('帳號已切換，請重新啟用本機推播');
 await StocklabWebPush.setOwner(webRegistration,user.uid);pushToken=token;
 write('Chrome FCM Token 已註冊，且已綁定目前帳號。可按「測試本機網頁推播」確認收件。');
}
async function register(){
 if(pushBusy)return;
 // Permission request starts in the click gesture, before network awaits.
 if(!nativePlatform()){
  if(!window.isSecureContext||!('Notification' in window))throw Error('請使用 HTTPS 網頁及支援通知的 Chrome');
  if(!currentUser?.emailVerified)throw Error('請先登入並驗證帳號');
 }
 pushBusy=true;
 try{
  if(!nativePlatform()&&Notification.permission!=='granted'){
   const p=await Notification.requestPermission();
   if(p!=='granted')throw Error('通知未獲允許；請到 Chrome 網址列的網站設定開啟通知，再重試');
  }
  await api('/api/settings');if(!await registerAndroid())await registerWeb();
 }finally{pushBusy=false;}
}
async function testWorkerPush(){
 const platform=nativePlatform()?'android':'web',record=nativePlatform()?savedAndroid():savedPush();
 const token=pushToken||(record?.uid===currentUser?.uid?record.token:'');
 if(!token)throw Error('請先在本機啟用推播');
 const result=await api('/api/test-push',{method:'POST',data:{token,platform}});
 if(result.sent)write('FCM 已接受本機測試通知；請確認裝置是否實際收到。');
}
const testWebPush=testWorkerPush;
async function health(){const h=await api('/api/health');write('最後成功監控：'+(h.last_ok||'尚無')+'；'+(h.market?.reason||'')+(h.error?'；'+h.error:'')+(h.capacityRotation?'；目前使用人數較多，監控採輪替續查':''));}
async function candles(symbol){return api('/api/candles?symbol='+encodeURIComponent(symbol));}

function bind(id,fn){const el=$(id);if(el)el.onclick=()=>{write('正在處理「'+el.textContent.trim()+'」…');try{Promise.resolve(fn()).catch(e=>write(readableError(e),true));}catch(e){write(readableError(e),true);}};}
function init(){if(!$('alerts-connect'))return;
 $('alerts-google').textContent='使用 Google 帳號登入（Android／網頁）';
 if(!$('alerts-email-signup')){
  const b=document.createElement('button');b.id='alerts-email-signup';b.type='button';b.textContent='第一次使用：建立信箱密碼帳號';
  $('alerts-email-login').insertAdjacentElement('afterend',b);
  bind('alerts-email-signup',signUpEmail);
 }
 if(!$('alerts-verify-refresh')){
  const b=document.createElement('button');b.id='alerts-verify-refresh';b.type='button';b.textContent='重新確認驗證';
  $('alerts-verify').insertAdjacentElement('afterend',b);
  bind('alerts-verify-refresh',refreshVerification);
 }
 const info=document.createElement('p');info.className='caption';
 info.textContent='建議直接點「使用 Google 帳號登入」；Android 會顯示 Google 帳號選擇畫面。信箱密碼為備用方式，請勿填入 Gmail 密碼。登入成功後再啟用本機推播。';
 $('alerts-email-login').parentElement.insertAdjacentElement('afterend',info);

 const testButton=document.createElement('button');testButton.type='button';testButton.id='alerts-test-push';testButton.hidden=true;
 testButton.textContent='測試本機 Android 推播';
 $('alerts-health').insertAdjacentElement('afterend',testButton);
 bind('alerts-test-push',testWorkerPush);
 const webTest=document.createElement('button');webTest.type='button';webTest.id='alerts-test-web-push';webTest.hidden=true;webTest.textContent='測試本機網頁推播';
 testButton.insertAdjacentElement('afterend',webTest);bind('alerts-test-web-push',testWebPush);
 if(!nativePlatform()&&'serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{
  if(e.data?.type==='STOCKLAB_PUSH_RECEIVED'&&e.data.uid===currentUser?.uid)write('本瀏覽器已收到'+(e.data.test?'測試通知':'交易訊號')+'：'+e.data.title+' '+e.data.body);
 });
 bind('alerts-connect',connect);bind('alerts-google',signGoogle);bind('alerts-email-login',signEmail);bind('alerts-verify',sendVerification);bind('alerts-link-password',linkPassword);bind('alerts-logout',signout);bind('alerts-save',save);bind('alerts-register',register);bind('alerts-health',health);bind('alerts-key-save',saveKey);bind('alerts-key-check',checkKey);bind('alerts-key-delete',deleteKey);
 if(!cfg.workerUrl||!cfg.firebase?.projectId)write('尚未設定 Worker/Firebase，推播目前未啟用。');else firebase().catch(e=>write(readableError(e),true));}
window.StocklabAlerts={hasCloud:()=>!!currentUser?.emailVerified&&!!currentRole&&!!cfg.workerUrl,hasKey:()=>keyConfigured,getUid:()=>currentUser?.uid||null,getCandles:candles};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
