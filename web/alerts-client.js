/* Taiwan Stock Lab v0.7.1 multi-user H1 alerts. Firebase ID tokens are verified by Worker. */
(()=>{
'use strict';
const cfg=globalThis.STOCKLAB_ALERTS_CONFIG||{},$=id=>document.getElementById(id);
let app,auth,authSDK,currentUser=null,currentRole='',pushToken='';
function readableError(e){
 const code=String(e?.code||'');
 const labels={
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
  'auth/popup-blocked':'登入視窗被封鎖，請用電腦瀏覽器重試。'
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
 if(!cfg.firebase?.apiKey||!cfg.firebase?.appId||!cfg.firebase?.projectId)throw Error('請先設定 alerts-config.js 的 Firebase 公開資訊');
 const [a,lib]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')]);
 app=a.initializeApp(cfg.firebase,'stocklab-alerts-071');authSDK=lib;auth=lib.getAuth(app);
 lib.onAuthStateChanged(auth,async user=>{
   currentUser=user;
   if(!user){currentRole='';$('alerts-user').textContent='尚未登入';return;}
   $('alerts-user').textContent='已登入：'+(user.email||'')+(user.emailVerified?'':'（請先驗證信箱）');
   if(!user.emailVerified){write('請先驗證電子郵件後再操作雲端監控。');return;}
   try{await connect();}catch(error){write(error.message,true);}
 });
}
async function api(path,{method='GET',data}={}){
 await firebase();if(!currentUser)throw Error('請先登入 Firebase');
 const token=await currentUser.getIdToken();
 const res=await fetch(endpoint()+path,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});
 const value=await res.json().catch(()=>({error:'非 JSON 回應'}));if(!res.ok)throw Error(value.error||'服務錯誤 HTTP '+res.status);return value;
}
function chosenFlags(){return ['BUY IN','SELL IN','PROFIT OUT','FAIL OUT'].reduce((obj,k)=>(obj[k]=!!$('alerts-'+k.replace(/ /g,'-'))?.checked,obj),{});}
function choices(){return ['A','B'].filter(k=>$('alerts-strategy-'+k)?.checked);}
function display(x){$('alerts-symbols').value=(x.symbols||[]).join(',');$('alerts-ratio').value=x.volumeRatio;for(const [k,v] of Object.entries(x.flags||{})){const input=$('alerts-'+k.replace(/ /g,'-'));if(input)input.checked=v;}for(const k of ['A','B'])$('alerts-strategy-'+k).checked=(x.strategies||[]).includes(k);}
async function connect(){const v=await api('/api/settings');currentRole=v.role;display(v);$('alerts-user').textContent='已登入：'+v.email+(v.role==='admin'?'（管理員）':'（親友）');$('alerts-invite-panel').hidden=v.role!=='admin';write('已連接個人雲端監控；資料與其他使用者隔離。');}
async function signGoogle(){await firebase();if(globalThis.StocklabCapacitor?.Capacitor?.isNativePlatform?.())throw Error('Android 版請使用電子郵件與密碼登入；Google 原生登入需另行整合 SHA-1。');await authSDK.signInWithPopup(auth,new authSDK.GoogleAuthProvider());}
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
 await api('/api/unregister-all',{method:'POST'});
 await authSDK.signOut(auth);pushToken='';currentRole='';$('alerts-invite-panel').hidden=true;
 write('已登出並停用此帳號所有裝置的推播。若需恢復，請在各裝置重新訂閱。');
}

async function save(){const symbols=$('alerts-symbols').value.split(/[,，\s]+/).filter(Boolean);const v=await api('/api/settings',{method:'POST',data:{symbols,flags:chosenFlags(),strategies:choices(),volumeRatio:Number($('alerts-ratio').value)}});display(v);write('已儲存你的自選股及 A/B 通知選項。');}
async function registerAndroid(){const cap=globalThis.StocklabCapacitor;if(!cap?.Capacitor?.isNativePlatform?.())return false;
 const Push=cap.registerPlugin?.('PushNotifications');if(!Push)throw Error('請先安裝整合 Firebase 的新版 APK');
 await Push.addListener('registration',async ({value})=>{try{pushToken=value;await api('/api/register',{method:'POST',data:{token:value,platform:'android'}});write('此 Android 裝置已訂閱個人交易訊號');}catch(err){write(err.message,true);}});
 await Push.addListener('registrationError',()=>write('Android FCM 註冊失敗',true));
 await Push.createChannel({id:'stocklab_signals',name:'台股交易訊號',description:'H1 A/B 雙策略訊號',importance:4,visibility:1});
 let p=await Push.checkPermissions();if(p.receive!=='granted')p=await Push.requestPermissions();if(p.receive!=='granted')throw Error('請允許手機通知權限');await Push.register();return true;
}
async function registerWeb(){if(!('serviceWorker' in navigator)||!('Notification' in window))throw Error('瀏覽器不支援網頁推播');if(!cfg.vapidKey)throw Error('缺少 Firebase Web Push VAPID 公開金鑰');
 const p=await Notification.requestPermission();if(p!=='granted')throw Error('尚未允許通知權限');
 const reg=await navigator.serviceWorker.register('./alerts-push/firebase-messaging-sw.js',{scope:'./alerts-push/'});
 const {getMessaging,getToken,isSupported}=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');if(!await isSupported())throw Error('這個瀏覽器不支援 FCM');
 const token=await getToken(getMessaging(app),{vapidKey:cfg.vapidKey,serviceWorkerRegistration:reg});if(!token)throw Error('未取得瀏覽器推播 Token');pushToken=token;
 await api('/api/register',{method:'POST',data:{token,platform:'web'}});write('這個瀏覽器已訂閱你的四種交易訊號');
}
async function register(){await api('/api/settings');if(!await registerAndroid())await registerWeb();}
async function health(){const h=await api('/api/health');write('最後成功監控：'+(h.last_ok||'尚無')+'；上次執行：'+(h.last_run||'尚無'));}
async function candles(symbol){return api('/api/candles?symbol='+encodeURIComponent(symbol));}
async function invite(){const email=$('alerts-invite').value.trim();const v=await api('/api/admin/invites',{method:'POST',data:{email}});write('已將 '+v.email+' 加入允許名單；對方仍需先建立 Firebase 帳號並完成信箱驗證。');$('alerts-invite').value='';}
function bind(id,fn){const el=$(id);if(el)el.onclick=()=>{write('正在處理「'+el.textContent.trim()+'」…');Promise.resolve().then(fn).catch(e=>write(readableError(e),true));};}
function init(){if(!$('alerts-connect'))return;
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
 info.textContent='Android 首次使用：輸入信箱及自行設定的獨立密碼 → 建立信箱密碼帳號 → 收信驗證 → 重新確認驗證 → 啟用本機推播。Google 登入僅供網頁版使用。';
 $('alerts-email-login').parentElement.insertAdjacentElement('afterend',info);
 bind('alerts-connect',connect);bind('alerts-google',signGoogle);bind('alerts-email-login',signEmail);bind('alerts-verify',sendVerification);bind('alerts-link-password',linkPassword);bind('alerts-logout',signout);bind('alerts-save',save);bind('alerts-register',register);bind('alerts-health',health);bind('alerts-invite-add',invite);$('alerts-invite-panel').hidden=true;
 if(!cfg.workerUrl||!cfg.firebase?.projectId)write('尚未設定 Worker/Firebase，推播目前未啟用。');else firebase().catch(e=>write(readableError(e),true));}
window.StocklabAlerts={hasCloud:()=>!!currentUser?.emailVerified&&!!currentRole&&!!cfg.workerUrl,getCandles:candles};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
