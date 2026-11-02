# 英文文法校稿台

免費、免登入、不需要 API Key 的英文文法檢查網站。

- 貼上英文後自動檢查拼字、文法、標點和常見用法錯誤
- 每個問題都有台灣中文的分類與說明，點建議就能直接修正
- 提供「套用所有建議後的版本」，可一鍵複製
- 文字只在使用者自己的瀏覽器裡處理，**不會上傳到任何伺服器**
- 檢查引擎是開源的 [Harper](https://writewithharper.com)（Apache-2.0 授權）

> 限制：Harper 是規則式檢查器，能抓到大部分常見錯誤，但不會整段改寫或調整語氣。頁面下方有「複製 AI 改寫提示詞」按鈕，需要時可以貼到 ChatGPT 或 Claude。

---

## 上線步驟（GitHub Pages，約 10 分鐘）

### 1. 建立 GitHub 帳號與儲存庫
1. 到 <https://github.com> 註冊或登入。
2. 右上角「+」→ **New repository**。
3. Repository name 輸入例如 `grammar-checker`，選 **Public**，按 **Create repository**。

> 免費帳號的 GitHub Pages 需要 Public 儲存庫。程式碼公開沒有關係，裡面沒有任何個人或公司資料。

### 2. 上傳檔案
1. 在新建立的儲存庫頁面，點 **uploading an existing file**。
2. 把解壓縮後資料夾裡的**所有內容**拖進去（包含 `.github` 資料夾、`site` 資料夾、`README.md`）。
   - 如果 `.github` 是隱藏資料夾拖不進去：Windows 檔案總管 → 檢視 → 勾選「隱藏的項目」；Mac 在 Finder 按 `Cmd + Shift + .`。
3. 按 **Commit changes**。

上傳後的結構應該是：
```
.github/workflows/deploy.yml
site/index.html
site/app.js
site/style.css
README.md
```

### 3. 開啟 GitHub Pages
1. 儲存庫上方點 **Settings** → 左側 **Pages**。
2. **Source** 選 **GitHub Actions**。

### 4. 等待部署
1. 點上方 **Actions** 分頁，會看到「Deploy to GitHub Pages」正在執行。
   - 如果沒有自動開始：點左側「Deploy to GitHub Pages」→ 右邊 **Run workflow**。
2. 約 1–2 分鐘後出現綠色勾勾，就完成了。
3. 網址是：`https://你的帳號.github.io/grammar-checker/`

把這個網址分享給同事即可，他們不需要任何帳號。

---

## 常見問題

**畫面顯示「檢查引擎載入失敗」**
請到 Actions 分頁確認部署是綠色勾勾。部署流程會把檢查引擎複製到網站裡（`site/vendor/harper/`），同事只要能連到 `github.io` 就能使用。

**直接在電腦上雙擊 `index.html` 打不開？**
瀏覽器不允許本機檔案載入模組，請用上線後的網址。若要在本機測試，可在 `site` 資料夾執行 `npx serve` 或 `python -m http.server`，此時會改從 unpkg 載入引擎。

**更新檢查引擎版本**
修改 `site/app.js` 最上方的 `HARPER_VERSION`，存檔後重新上傳，GitHub 會自動重新部署。

**公司的資料安全？**
所有檢查都在瀏覽器內完成，文字不會送出。唯一的外部連線是 Google Fonts（字型），不影響功能。
