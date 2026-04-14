# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run once    # 立即執行一次爬蟲（開發/測試用）
npm run start   # 啟動 node-cron 排程（每天 08:00 自動執行）
npx tsc --noEmit  # 型別檢查
```

## Architecture

雙來源流程：`scheduler.ts` → `scraper.ts` + `scraper-kh.ts` → `notifier.ts`

**執行流程（scheduler.ts）**
1. 載入 `config.json`，讀取 `data/jobs.json`（已知 Job ID store）
2. 呼叫 `scrape()` 取得本次所有職缺
3. 比對差異：新增 → Discord 通知；已不在結果中 → 從 store 刪除
4. 寫回 `data/jobs.json`

**爬蟲（scraper.ts）**

目標網站：`https://personnel.k12ea.gov.tw/tsn/index/JobShow.aspx?f=FUN20100316111720R14`（ASP.NET WebForms，需 Playwright）

選科目的正確流程（三層下拉 + checkbox）：
1. `#ContentPlaceHolder1_txttbLev1` 選教育階段（e.g. `LEV00000000000000103` = 高級中等學校）
2. `#ContentPlaceHolder1_txttbLev2` 選領域（e.g. `LEV00000000000000133` = 自然科學領域）
3. `input[id^="ContentPlaceHolder1_chktbJobLev3"]` 勾選科目 checkbox（依 label 文字比對）
4. `#ContentPlaceHolder1_bntSearch` 送出查詢

找不到 checkbox 時 fallback：在 `#ContentPlaceHolder1_txttbJobSub`（公告主旨）輸入關鍵字搜尋。

結果表格鎖定方式（避免抓到登入/搜尋表單的 `<tr>`）：
```typescript
tables.find(t => t.querySelector("a[href*=\"toSort('tbUntCde')\"]"))
```

分頁：呼叫頁面的 `window.chgVal('List1_PAGE', n)` + `window.chgValSubmit('List1', 'SEARCH')`。

**注意事項**
- `__doPostBack` 在 Playwright 的 `page.evaluate` strict mode 下**無法呼叫**，不要嘗試用它
- `#ContentPlaceHolder1_txttbJobTchTyp`（任教類科別舊下拉）不可見，不要使用
- Job ID 格式：`JOB` + 時間戳 + 亂數（e.g. `JOB20250602205838Q9K`），無法直接構成詳情頁 URL（網站僅支援 POST）

**科目路徑對照（SUBJECT_PATHS in scraper.ts）**

| 科目 | lev1 | lev2 |
|------|------|------|
| 生物／物理／化學／地球科學 | `LEV00000000000000103` | `LEV00000000000000133` |
| 數學 | `LEV00000000000000103` | `LEV00000000000000131` |
| 國文／英文 | `LEV00000000000000103` | `LEV00000000000000104` |

新增科目時在 `SUBJECT_PATHS` 補對應路徑即可；未知科目自動 fallback 到關鍵字搜尋。

**爬蟲（scraper-kh.ts）**

目標網站：`https://employ.kh.edu.tw/public/QueryMain.aspx`（ASP.NET WebForms，需 Playwright）

直接導航到 `QueryMain.aspx`（不透過外層 frameset）。

下拉選單設定流程：
1. `#ContentPlaceHolder1_ddlYY` 選學年度（e.g. `114`）
2. `#ContentPlaceHolder1_ddlFormType` 選簡章類別（e.g. `7` = 高中代理代課[長期]）
3. `#ContentPlaceHolder1_ddlSubj` 選科目別（e.g. `生物`）

**注意：** 每個 `selectOption` 之後必須先 `waitForTimeout(600)` 再 `waitForLoadState('networkidle')`。
原因：onchange 是 `setTimeout('__doPostBack(...)', 0)`，直接 `waitForLoadState` 會在 setTimeout 觸發前就 resolve。

分頁：點擊 `a[href*="Page$N'"]` 連結（精確比對加引號，避免 `Page$2` 匹配 `Page$20`）。

結果表格：找 10 個 td 且無 colspan 的列；公告連結在 td[5]，科目在連結文字的第二行。

唯一 ID：公告 HTML 檔案的完整 URL（e.g. `https://employ.kh.edu.tw/Html/2025/8/鳳山區...第X號.html`）。

**切換學年度：** 在 `config.json` 的 `kh.schoolYear` 由 `114` 改為 `115` 即可。115 學年度開放後自動切換。

## Config

`config.json`（不進版控，參考 `config.example.json`）：

```json
{
  "discord": { "botToken": "...", "channelId": "..." },
  "subjects": ["生物"],
  "educationLevels": ["高級中等學校(高中)"],
  "cron": "0 8 * * *",
  "dataPath": "./data/jobs.json",
  "headless": true,
  "kh": {
    "formType": "高中代理代課[長期]",
    "subjects": ["生物"],
    "schoolYear": 114,
    "dataPath": "./data/kh-jobs.json"
  }
}
```

`headless: false` 可在開發時觀察 Playwright 操作過程。

## Windows 排程

```bat
schtasks /create /tn "TeacherJobScraper" /tr "E:\Projects\teacher\run.bat" /sc daily /st 08:00 /f
```

執行 log 輸出至 `scraper.log`。
