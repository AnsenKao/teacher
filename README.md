# Teacher Job Notifier

自動爬取[教師選聘網](https://personnel.k12ea.gov.tw/tsn/index/JobShow.aspx?f=FUN20100316111720R14)的教師職缺，並透過 Discord Bot 傳送新職缺通知。

## 功能

- 依指定科目與教育階段定時爬取職缺
- 比對上次結果，只通知**新出現**的職缺
- 自動移除已下架的職缺記錄
- 透過 Discord Embed 訊息傳送詳細職缺資訊

## 專案結構

```
teacher/
├── src/
│   ├── scheduler.ts   # 主程式：排程、比對、儲存
│   ├── scraper.ts     # Playwright 爬蟲
│   ├── notifier.ts    # Discord 通知
│   └── types.ts       # TypeScript 型別定義
├── data/
│   └── jobs.json      # 已知職缺快取（自動產生）
├── config.json        # 設定檔（請勿提交到版本控制）
├── config.example.json
└── run.bat            # Windows 排程執行腳本
```

## 安裝

```bash
npm install
npx playwright install chromium
```

## 設定

複製 `config.example.json` 為 `config.json` 並填入設定：

```json
{
  "discord": {
    "botToken": "YOUR_BOT_TOKEN",
    "channelId": "YOUR_CHANNEL_ID"
  },
  "subjects": ["生物"],
  "educationLevels": ["高級中等學校(高中)"],
  "cron": "0 8 * * *",
  "dataPath": "./data/jobs.json",
  "headless": true
}
```

| 欄位 | 說明 |
|------|------|
| `discord.botToken` | Discord Bot Token |
| `discord.channelId` | 傳送通知的頻道 ID |
| `subjects` | 要搜尋的科目，支援：`生物`、`物理`、`化學`、`地球科學`、`數學`、`國文`、`英文` |
| `educationLevels` | 教育階段（目前僅供參考，以 `subjects` 設定為主） |
| `cron` | Cron 排程表達式（預設每天早上 8 點） |
| `dataPath` | 職缺快取檔案路徑 |
| `headless` | 是否以無頭模式執行瀏覽器 |

### Discord Bot 設定

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications) 建立應用程式
2. 在 Bot 頁面建立 Bot 並取得 Token
3. 邀請 Bot 加入伺服器（需要 `Send Messages`、`Embed Links` 權限）
4. 取得目標頻道的 ID（在頻道上右鍵 → 複製頻道 ID，需開啟開發者模式）

## 執行

```bash
# 立即執行一次（測試用）
npm run once

# 啟動排程服務（依 config.json 的 cron 設定定時執行）
npm start
```

### Windows 工作排程器

使用 `run.bat` 可搭配 Windows 工作排程器執行，記錄會寫入 `scraper.log`。
