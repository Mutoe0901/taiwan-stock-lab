# v0.7.2 交付狀態（2026-10-10）

程式已提交 GitHub main，Android APK 已建置成功。Worker 與原網站仍待正式部署。

| 項目 | 狀態 |
|---|---|
| GitHub 起點 | main f48d2b4cabf1f2f3b390ba573abea9d7c48d7d13 |
| GitHub 功能提交 | 已完成：fa7e19fd0168bcd44b53e44f8529a9589c901ca7 |
| 個人 Fugle Key／分鐘監控／介面 | 程式已完成；需正式 Worker 升級 |
| 自動化測試 | 功能提交的 GitHub Actions 43 項通過；原 Site 含額外回歸共 55 項通過（含重疊，不可相加）；另補部署保護測試 |
| SQLite migration／隔離 | 通過；只在記憶體測試資料庫執行 |
| Worker 打包 | esbuild 與 Wrangler dry-run 通過；dry-run 不等於部署 |
| 正式 D1 備份及 migration | 尚未執行；現有使用者／訂閱資料未變更 |
| Cloudflare 正式部署 | 未完成：使用者已完成裝置授權，但執行環境政策阻擋 dash.cloudflare.com 的授權回傳；Wrangler 仍未登入 |
| Android | Actions #19 成功；v0.7.2／versionCode 72019；沿用既有 Firebase 與固定簽章 Secrets；APK 簽章驗證通過 |
| 原網站 | 原 project_id 與網址保留；v0.7.2 源碼待 Worker 就緒後發布，避免前後端版本不相容 |
| Web Push 註冊／送達 | VAPID 格式、SW 帳號隔離、token API、FCM 模擬發送通過；正式註冊與實機送達未驗證 |
| Firebase 正式設定 | 此次未完成官方控制台核對；沿用既有公開 config／VAPID，不重設 Android 設定 |

## 尚需官方授權／操作

- GitHub：Mutoe0901 帳號的寫入權限已確認，提交與 Actions 都已完成。
- Cloudflare：因代理執行環境的連線限制，請在自己的電腦更新專案後執行 `DEPLOY_WORKER_v0.7.2.cmd`，透過官方 Wrangler 登入原帳號並安全部署。腳本先備份、核對相容性，首次缺少主金鑰且無既存密文才自動建立 Secret；不要提供 Secret 值至聊天。
- 完成後由部署腳本進行同 Worker 升級，核對版本；再發布原 Site 已保存的新版。
- APK：[Actions #19](https://github.com/Mutoe0901/taiwan-stock-lab/actions/runs/37971145727) → Artifacts → taiwan-stock-lab-debug-apk（保存至 2026-11-08）。程式已建置，實機登入、覆蓋安裝與推播仍需驗證；個人 Fugle 功能需等待新版 Worker。
- 本人／第二帳號各在網站輸入自己的 Fugle Key（不要貼對話）；Chrome／Pixel 各自啟用推播並核對通知中心。

## 重要限制

- 逐分鐘是排程目標；Cloudflare CPU／D1／共享外部請求、Fugle 限流與網路仍需正式壓測。容量不足會輪替。
- 只內建 2026 官方休市日。未知年度安全停抓；臨時休市由維護者更新設定，尚無自動即時公告辨識。
- 測試不會使用私人 Key 或真實 Firebase 私鑰，不等同真實 Fugle、Google 登入或 FCM 送達測試。
- 原資料庫尚未操作，因此不能宣稱已確認正式資料備份或資料遷移成功。
