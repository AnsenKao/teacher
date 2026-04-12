# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run once    # 立即執行一次爬蟲（開發/測試用）
npm run start   # 啟動 node-cron 排程（每天 08:00 自動執行）
npx tsc --noEmit  # 型別檢查
```

## Architecture

單一流程：`scheduler.ts` → `scraper.ts` → `notifier.ts`

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

## Config

`config.json`（不進版控，參考 `config.example.json`）：

```json
{
  "discord": { "botToken": "...", "channelId": "..." },
  "subjects": ["生物"],
  "educationLevels": ["高級中等學校(高中)"],
  "cron": "0 8 * * *",
  "dataPath": "./data/jobs.json",
  "headless": true
}
```

`headless: false` 可在開發時觀察 Playwright 操作過程。

## Windows 排程

```bat
schtasks /create /tn "TeacherJobScraper" /tr "E:\Projects\teacher\run.bat" /sc daily /st 08:00 /f
```

執行 log 輸出至 `scraper.log`。
