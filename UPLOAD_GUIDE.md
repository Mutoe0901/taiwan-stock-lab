# v0.6.4 GitHub 上傳方式

這個 ZIP 解壓縮後，**請上傳解壓縮目錄裡的內容，不要再多包一層資料夾**。

GitHub Repository 根目錄應直接看到：

- `.github/`
- `scripts/`
- `web/`
- `package.json`
- `capacitor.config.json`
- `CHANGELOG.md`
- `README.md`
- `README_BIGDATA.md`

其中 `web/` 必須直接包含 `index.html`、`main.js`、`style.css`、`mobile.css`、`sw.js`、`manifest.webmanifest`、`icon.svg`。

GitHub Actions 會在建置前自動檢查版本必須為 `0.6.4`，並確認 ChatGPT 按鈕真的位於 `web/index.html`。檢查失敗就不會產生 APK。
