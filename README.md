# v0.7.2 升級

最新功能與操作請看 [v0.7.2 操作手冊](docs/OPERATION_MANUAL_v0.7.2.md)。正式部署狀態請看 [交付狀態](docs/RELEASE_STATUS_v0.7.2.md)。

以下為舊版使用說明；受邀登入、共用 Fugle Key 與舊推播步驟已由 v0.7.2 手冊取代。

# Taiwan Stock Lab

台股研究室：PWA + Android (Capacitor) 專案。

## GitHub Actions 自動產生 APK

1. Push 到 `main`，或進入 **Actions > Build Android APK > Run workflow**。
2. 等待 workflow 完成（綠色勾勾）。
3. 打開該次 workflow，在頁面底部 **Artifacts** 下載 `taiwan-stock-lab-debug-apk`。
4. 解壓後取得 `app-debug.apk`，即可在 Android 安裝測試。

這個 APK 是由 Android/Gradle 正式建置的 debug APK，會使用 Android 標準 debug 簽章，不是重新打包既有 APK。

## 主要檔案

- `web/`：PWA/Android 共用前端
- `capacitor.config.json`：Capacitor Android 設定
- `.github/workflows/android-build.yml`：GitHub Actions APK 建置流程

## 注意

此工具提供研究與歷史統計，不保證投資結果。
