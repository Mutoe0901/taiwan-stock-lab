/* Independent service-worker scope; does not replace the PWA's existing sw.js. */
importScripts('../alerts-config.js');
const config=self.STOCKLAB_ALERTS_CONFIG;
if(config?.firebase?.projectId && config?.firebase?.messagingSenderId){
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
  firebase.initializeApp(config.firebase);
  // The notification payload is displayed by Firebase/FCM for background delivery.
  firebase.messaging();
}
self.addEventListener('notificationclick', event=>{
  event.notification.close();
  const link=new URL('../#ab',self.registration.scope).href;
  event.waitUntil(clients.openWindow(link));
});
