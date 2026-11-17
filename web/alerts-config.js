/* 台股研究室 v0.7.2 - Firebase 公開設定
   不得放入 Fugle API Key 或 Firebase 服務帳戶私鑰
*/

globalThis.STOCKLAB_ALERTS_CONFIG = {
  workerUrl: 'https://taiwan-stock-lab-alerts.mutoe0901.workers.dev',
  // Public endpoint; every report still requires a Firebase ID token.
  researchServiceUrl: 'https://8000-agq6oq7r4l3fpt3i5acafi2nri.instabox.tech',

  firebase: {
    apiKey: 'AIzaSyBm9q1x-sd6m8WGDqnGugYNz6M-Om8lL1o',
    authDomain: 'taiwan-stock-lab-b6294.firebaseapp.com',
    projectId: 'taiwan-stock-lab-b6294',
    messagingSenderId: '764603482092',
    appId: '1:764603482092:web:1ef12680a83c81a1760ac9'
  },

  vapidKey: 'BAkbIhbsanEgnRRsfHqWUFEWq9mHLMBi_DlsnfNANEzGuV48Nroyavc9cDQolI-SZwfn8bf5GPyX6blxnnrg--0'
};
