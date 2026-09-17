# Changelog

## Big Data update — 2026-09-17

- 新增「大數據多頭機率分析」獨立頁面。
- 新增 7 條件歷史相似度模型。
- 新增 5/10/20/60 日後報酬統計。
- 新增平均盈虧比、MAE/MFE、最差/最佳歷史結果。
- 新增樣本數警示與 CSV 匯出。
- 手機底部導覽列由 4 項調整為 5 項。
- 新增 PWA manifest / service worker / icon。
- PWA / Web 新增 FinMind 直接請求路徑。

## Scanner update — 2026-09-17
- 新增多檔大數據選股掃描頁。
- 可選 5 / 10 / 20 / 60 日觀察期與 4 / 5 / 6 條件相似門檻。
- 可設定最少歷史樣本、最低目前多頭條件數與是否只顯示達樣本門檻標的。
- 排序依歷史上漲比例，其次中位數報酬與樣本數；排序明確標示為研究工具，不是買進建議。
- 顯示平均報酬、中位數、盈虧比、平均最大不利變動與樣本可信度。
- 支援掃描結果 CSV 匯出及一鍵跳轉個股大數據詳細頁。

## 0.5.1
- 修正 Android `App plugin is not implemented on android`。
- 加入官方 Capacitor App / Filesystem / Preferences / Share plugins。
- 移除前端對自訂 `StocklabDevice` plugin 的依賴。
- FinMind Token 改用 Capacitor Preferences 儲存。
- Android 匯出改用 Filesystem + 系統分享介面，支援文字與二進位 Blob。
- Android 畫面版本更新為 0.5.1。
