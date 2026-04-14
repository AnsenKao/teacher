import * as fs from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';
import { scrape } from './scraper';
import { scrapeKh } from './scraper-kh';
import { notify, notifyKh } from './notifier';
import { Config, JobListing, JobStore, KhJobListing, KhJobStore } from './types';

const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');

function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`找不到設定檔：${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Config;
}

function loadStore(dataPath: string): JobStore {
  const absPath = path.resolve(__dirname, '..', dataPath);
  if (!fs.existsSync(absPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf-8')) as JobStore;
  } catch {
    return {};
  }
}

function loadKhStore(dataPath: string): KhJobStore {
  const absPath = path.resolve(__dirname, '..', dataPath);
  if (!fs.existsSync(absPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf-8')) as KhJobStore;
  } catch {
    return {};
  }
}

function saveKhStore(dataPath: string, store: KhJobStore): void {
  const absPath = path.resolve(__dirname, '..', dataPath);
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(store, null, 2), 'utf-8');
}

function saveStore(dataPath: string, store: JobStore): void {
  const absPath = path.resolve(__dirname, '..', dataPath);
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * 主要執行邏輯：爬取、比對、通知、儲存
 */
async function run(): Promise<void> {
  console.log(`\n[${new Date().toLocaleString('zh-TW')}] 開始執行爬蟲...`);

  const config = loadConfig();

  if (config.discord.botToken === 'YOUR_BOT_TOKEN') {
    console.warn('⚠️  警告：請先在 config.json 填入 Discord Bot Token！');
  }

  // 載入已知職缺
  const store = loadStore(config.dataPath);
  const knownIds = new Set(Object.keys(store));
  console.log(`已知職缺：${knownIds.size} 筆`);

  // 爬取目前所有職缺
  const currentJobs = await scrape(config);

  // 找出新職缺
  const newJobs = currentJobs.filter((j) => !knownIds.has(j.jobId));
  console.log(`新職缺：${newJobs.length} 筆`);

  // 傳送 Discord 通知
  if (newJobs.length > 0) {
    if (config.discord.botToken !== 'YOUR_BOT_TOKEN') {
      await notify(newJobs, config);
    } else {
      console.log('（略過 Discord 通知，因未設定 Token）');
      console.log('新職缺清單：');
      for (const j of newJobs) {
        console.log(`  - ${j.school}: ${j.title} [${j.location}]`);
      }
    }
  }

  // 找出已下架的職缺（在 store 但不在本次結果）
  const currentIds = new Set(currentJobs.map((j) => j.jobId));
  const removedIds = [...knownIds].filter((id) => !currentIds.has(id));
  if (removedIds.length > 0) {
    for (const id of removedIds) {
      console.log(`  移除下架職缺：${store[id]?.school} - ${store[id]?.title}`);
      delete store[id];
    }
    console.log(`已移除 ${removedIds.length} 筆下架職缺`);
  }

  // 新增或更新現有職缺
  for (const job of currentJobs) {
    store[job.jobId] = job;
  }
  saveStore(config.dataPath, store);
  console.log(`已儲存 ${Object.keys(store).length} 筆職缺到 ${config.dataPath}`);

  // ── 高雄市甄選公告 ──────────────────────────────────────────
  if (config.kh) {
    const khStore = loadKhStore(config.kh.dataPath);
    const khKnownIds = new Set(Object.keys(khStore));
    console.log(`\n[KH] 已知職缺：${khKnownIds.size} 筆`);

    const khCurrentJobs = await scrapeKh(config);

    // null = 學年度尚未開放，保留 store 原狀不動
    if (khCurrentJobs === null) {
      console.log('[KH] 學年度尚未開放，store 維持不變');
    } else {

    const khNewJobs = khCurrentJobs.filter((j) => !khKnownIds.has(j.jobId));
    console.log(`[KH] 新職缺：${khNewJobs.length} 筆`);

    if (khNewJobs.length > 0) {
      if (config.discord.botToken !== 'YOUR_BOT_TOKEN') {
        await notifyKh(khNewJobs, config);
      } else {
        console.log('[KH] （略過 Discord 通知，因未設定 Token）');
        for (const j of khNewJobs) {
          console.log(`  - ${j.school}: ${j.announcement} ${j.subject} [截止：${j.deadline}]`);
        }
      }
    }

    // 移除已下架的 KH 職缺
    const khCurrentIds = new Set(khCurrentJobs.map((j) => j.jobId));
    const khRemovedIds = [...khKnownIds].filter((id) => !khCurrentIds.has(id));
    if (khRemovedIds.length > 0) {
      for (const id of khRemovedIds) {
        delete khStore[id];
      }
      console.log(`[KH] 已移除 ${khRemovedIds.length} 筆下架職缺`);
    }

    for (const job of khCurrentJobs) {
      khStore[job.jobId] = job;
    }
    saveKhStore(config.kh.dataPath, khStore);
    console.log(`[KH] 已儲存 ${Object.keys(khStore).length} 筆職缺到 ${config.kh.dataPath}`);
    } // end else
  }

  console.log(`[${new Date().toLocaleString('zh-TW')}] 執行完成\n`);
}

// 判斷執行模式
const args = process.argv.slice(2);
const isOnce = args.includes('--once');

if (isOnce) {
  // 立即執行一次（用於測試或手動觸發）
  run().catch((err) => {
    console.error('執行錯誤：', err);
    process.exit(1);
  });
} else {
  const config = loadConfig();
  console.log(`排程設定：${config.cron}（每天早上 8 點）`);
  console.log('服務已啟動，等待排程執行...');
  console.log('（輸入 npx ts-node src/scheduler.ts --once 可立即執行一次）\n');

  // 啟動時先執行一次
  run().catch(console.error);

  // 設定定時排程
  cron.schedule(config.cron, () => {
    run().catch(console.error);
  });
}
