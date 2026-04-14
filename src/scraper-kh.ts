import { chromium, Page, Browser } from 'playwright';
import { Config, KhJobListing } from './types';

const BASE_URL = 'https://employ.kh.edu.tw/public/QueryMain.aspx';

/** 簡章類別文字 → select value 對照 */
const FORM_TYPE_VALUES: Record<string, string> = {
  '全部': '0',
  '國小代理代課[長期]': '1',
  '國小代理代課[短期]': '2',
  '國中代理代課[長期]': '4',
  '國中代理代課[短期]': '5',
  '高中代理代課[長期]': '7',
  '高中代理代課[短期]': '8',
  '兼任教師': '9',
};

/**
 * 選擇下拉選單並等待 ASP.NET postback 完成。
 *
 * 該頁面的 onchange 是 setTimeout('__doPostBack(...)', 0)，
 * selectOption 本身返回後 setTimeout(0) 尚未執行，
 * 需先等一小段時間讓 form.submit() 觸發，再等 networkidle。
 */
async function selectAndPostback(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).selectOption(value);
  // 等待 setTimeout(0) → __doPostBack → form.submit() 觸發並完成
  await page.waitForTimeout(600);
  await page.waitForLoadState('networkidle');
}

/**
 * 從當前頁面擷取職缺列表
 * 表格結構：編序 | 張貼人 | 張貼學校 | 張貼日期 | 簡章類別 | 公告/科目 | 放榜 | 截止 | 甄選日期 | 備註
 */
async function extractJobsFromPage(page: Page): Promise<KhJobListing[]> {
  return await page.evaluate((): KhJobListing[] => {
    const table = document.querySelector('table');
    if (!table) return [];

    const rows = Array.from(table.querySelectorAll('tr'));
    // 資料列：恰好 10 個 td 且沒有 colspan
    const dataRows = rows.filter((r) => {
      const cells = r.querySelectorAll('td');
      return cells.length === 10 && !r.querySelector('td[colspan]');
    });

    const results: KhJobListing[] = [];

    for (const row of dataRows) {
      const cells = Array.from(row.querySelectorAll('td'));
      const getText = (idx: number) =>
        (cells[idx]?.textContent ?? '').replace(/\s+/g, ' ').trim();

      // 公告連結在第 5 欄（index 5）
      const annLink = cells[5]?.querySelector<HTMLAnchorElement>('a');
      const announcementUrl = annLink?.href ?? '';
      if (!announcementUrl) continue; // 無連結的列略過

      // 拆解公告文字：第一行為公告標題，第二行（若有）為科目
      const rawAnnText = cells[5]?.textContent ?? '';
      const annLines = rawAnnText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const announcement = annLines[0] ?? '';
      const subject = annLines[1] ?? '';

      results.push({
        jobId: announcementUrl,
        school: getText(2),
        postDate: getText(3),
        formType: getText(4),
        announcement,
        subject,
        announcementUrl,
        deadline: getText(7),
        examDate: getText(8),
        note: getText(9),
        seenAt: new Date().toISOString(),
      } as KhJobListing);
    }

    return results;
  });
}

/**
 * 切換到指定頁碼。
 * 找 href 精確含 Page$N' 的連結並點擊，等待 postback 完成。
 * 找不到連結代表已是最後一頁，回傳 false。
 */
async function goToPage(page: Page, pageNum: number): Promise<boolean> {
  // 精確比對：href 含 Page$N'（ASP.NET 分頁格式）
  const link = page.locator(`a[href*="Page$${pageNum}'"]`).first();
  if ((await link.count()) === 0) return false;

  await link.click();
  await page.waitForTimeout(600);
  await page.waitForLoadState('networkidle');
  return true;
}

/**
 * 高雄市甄選公告爬蟲主函式
 * 回傳 null 代表「學年度尚未開放，跳過」，scheduler 應保留原有 store 不動。
 * 回傳陣列（包含空陣列）代表正常執行完畢。
 */
export async function scrapeKh(config: Config): Promise<KhJobListing[] | null> {
  const khConfig = config.kh;
  if (!khConfig) {
    console.log('[KH] 未設定 kh 設定，跳過');
    return [];
  }

  let browser: Browser | null = null;
  const allJobs: KhJobListing[] = [];
  let anySubjectScraped = false;

  try {
    browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    for (const subject of khConfig.subjects) {
      console.log(
        `\n[KH] 搜尋科目：${subject}（學年度：${khConfig.schoolYear}，簡章類別：${khConfig.formType}）`,
      );

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });

      // Step 1：選學年度（若非預設值才切換；若選項尚未開放則跳過）
      const yySelect = page.locator('#ContentPlaceHolder1_ddlYY');
      const yyOptions = await yySelect.locator('option').allInnerTexts();
      if (!yyOptions.includes(String(khConfig.schoolYear))) {
        console.log(`[KH] 學年度 ${khConfig.schoolYear} 尚未開放，跳過本次執行`);
        continue; // 所有 subjects 都會跳過，anySubjectScraped 保持 false
      }
      anySubjectScraped = true;
      const currentYY = await yySelect.inputValue();
      if (currentYY !== String(khConfig.schoolYear)) {
        console.log(`  設定學年度：${khConfig.schoolYear}`);
        await selectAndPostback(page, '#ContentPlaceHolder1_ddlYY', String(khConfig.schoolYear));
      }

      // Step 2：選簡章類別
      const formTypeValue = FORM_TYPE_VALUES[khConfig.formType];
      if (formTypeValue && formTypeValue !== '0') {
        console.log(`  設定簡章類別：${khConfig.formType}`);
        await selectAndPostback(page, '#ContentPlaceHolder1_ddlFormType', formTypeValue);
      }

      // Step 3：選科目別
      console.log(`  設定科目別：${subject}`);
      await selectAndPostback(page, '#ContentPlaceHolder1_ddlSubj', subject);

      // Step 4：擷取第一頁
      const firstBatch = await extractJobsFromPage(page);
      allJobs.push(...firstBatch);
      console.log(`  第 1 頁取得 ${firstBatch.length} 筆`);

      // Step 5：後續分頁
      let pageNum = 2;
      while (true) {
        const moved = await goToPage(page, pageNum);
        if (!moved) {
          console.log(`  共 ${pageNum - 1} 頁`);
          break;
        }
        const batch = await extractJobsFromPage(page);
        allJobs.push(...batch);
        console.log(`  第 ${pageNum} 頁取得 ${batch.length} 筆`);
        pageNum++;
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  // 學年度尚未開放 → 回傳 null，通知 scheduler 不要動 store
  if (!anySubjectScraped) {
    return null;
  }

  // 依 jobId（公告 URL）去重
  const uniqueMap: Record<string, KhJobListing> = {};
  for (const job of allJobs) {
    uniqueMap[job.jobId] = job;
  }
  const uniqueJobs = Object.values(uniqueMap);
  console.log(`[KH] 爬取完成，共 ${uniqueJobs.length} 筆不重複職缺`);
  return uniqueJobs;
}
