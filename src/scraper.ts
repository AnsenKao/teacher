import { chromium, Page, Browser } from 'playwright';
import { Config, JobListing } from './types';

const BASE_URL =
  'https://personnel.k12ea.gov.tw/tsn/index/JobShow.aspx?f=FUN20100316111720R14';

/**
 * 科目路徑設定：subject 名稱 → 選取路徑（教育階段 + 領域）
 * 選取後會出現 checkbox，再依 label 文字勾選
 */
const SUBJECT_PATHS: Record<
  string,
  { lev1: string; lev2: string; lev1Label: string; lev2Label: string }
> = {
  生物: {
    lev1: 'LEV00000000000000103', // 高級中等學校
    lev2: 'LEV00000000000000133', // 自然科學領域
    lev1Label: '高級中等學校',
    lev2Label: '自然科學領域',
  },
  物理: {
    lev1: 'LEV00000000000000103',
    lev2: 'LEV00000000000000133',
    lev1Label: '高級中等學校',
    lev2Label: '自然科學領域',
  },
  化學: {
    lev1: 'LEV00000000000000103',
    lev2: 'LEV00000000000000133',
    lev1Label: '高級中等學校',
    lev2Label: '自然科學領域',
  },
  地球科學: {
    lev1: 'LEV00000000000000103',
    lev2: 'LEV00000000000000133',
    lev1Label: '高級中等學校',
    lev2Label: '自然科學領域',
  },
  數學: {
    lev1: 'LEV00000000000000103',
    lev2: 'LEV00000000000000131', // 數學領域
    lev1Label: '高級中等學校',
    lev2Label: '數學領域',
  },
  國文: {
    lev1: 'LEV00000000000000103',
    lev2: 'LEV00000000000000104', // 語文領域
    lev1Label: '高級中等學校',
    lev2Label: '語文領域',
  },
  英文: {
    lev1: 'LEV00000000000000103',
    lev2: 'LEV00000000000000104',
    lev1Label: '高級中等學校',
    lev2Label: '語文領域',
  },
};

/**
 * 選擇職缺教育階段別（txttbLev1 → txttbLev2），等待科目 checkbox 出現後勾選
 * 回傳 true 表示成功；false 表示找不到 checkbox（會 fallback 到關鍵字搜尋）
 */
async function selectSubjectViaCheckbox(page: Page, subject: string): Promise<boolean> {
  const path = SUBJECT_PATHS[subject];
  if (!path) {
    console.log(`  科目「${subject}」無預設路徑，改用關鍵字搜尋`);
    return false;
  }

  // Step 1：選職缺教育階段別（第一層）
  const lev1 = page.locator('#ContentPlaceHolder1_txttbLev1');
  if (!(await lev1.isVisible())) {
    console.log('  txttbLev1 不可見，改用關鍵字搜尋');
    return false;
  }
  console.log(`  選擇職缺教育階段別：${path.lev1Label}`);
  await lev1.selectOption(path.lev1);
  await page.waitForLoadState('networkidle');

  // Step 2：等待第二層出現並選擇領域
  const lev2 = page.locator('#ContentPlaceHolder1_txttbLev2');
  try {
    await lev2.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    console.log('  txttbLev2 未出現，改用關鍵字搜尋');
    return false;
  }
  console.log(`  選擇領域：${path.lev2Label}`);
  await lev2.selectOption(path.lev2);
  await page.waitForLoadState('networkidle');

  // Step 3：等待科目 checkbox 出現
  const checkboxSelector = 'input[id^="ContentPlaceHolder1_chktbJobLev3"]';
  try {
    await page.waitForSelector(checkboxSelector, { timeout: 8000 });
  } catch {
    console.log('  科目 checkbox 未出現，改用關鍵字搜尋');
    return false;
  }

  // Step 4：找到並勾選目標科目
  const checkboxes = page.locator(checkboxSelector);
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    const cb = checkboxes.nth(i);
    const id = await cb.getAttribute('id');
    if (!id) continue;
    const label = page.locator(`label[for="${id}"]`);
    const labelText = (await label.textContent())?.trim() ?? '';
    if (labelText === subject) {
      console.log(`  勾選：${subject}（checkbox #${i}）`);
      await cb.check();
      return true;
    }
  }

  console.log(`  找不到「${subject}」checkbox，改用關鍵字搜尋`);
  return false;
}

/**
 * 從結果表格擷取職缺列表
 * 只鎖定含有「公告單位」排序連結的結果表格，避免抓到登入/搜尋表單的 tr
 */
async function extractJobsFromPage(page: Page): Promise<JobListing[]> {
  return await page.evaluate((): JobListing[] => {
    // 鎖定結果表格：找含有 toSort('tbUntCde') 連結的表格
    const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table'));
    const resultsTable = tables.find((t) =>
      t.querySelector('a[href*="toSort(\'tbUntCde\')"]'),
    );
    if (!resultsTable) return [];

    const results: JobListing[] = [];
    const rows = Array.from(resultsTable.querySelectorAll<HTMLTableRowElement>('tr'));

    for (const row of rows) {
      // 找包含 goView 的連結
      const viewLink = row.querySelector<HTMLAnchorElement>('a[href*="goView"]');
      if (!viewLink) continue;

      const match = viewLink.getAttribute('href')?.match(/goView\('List1','(JOB[^']+)'\)/);
      if (!match) continue;
      const jobId = match[1];

      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
      if (cells.length < 5) continue;

      const getText = (idx: number): string => {
        const cell = cells[idx];
        if (!cell) return '';
        return (cell.textContent ?? '')
          .replace(/\[\d{4}\/\d+(?:\/\d+)?更新\]/g, '')
          .trim();
      };

      results.push({
        jobId,
        school: getText(0),
        title: getText(1),
        schoolLevel: getText(2),
        vacancyLevel: getText(3),
        location: getText(4),
        announceDate: getText(5),
        deadline: getText(6),
        examDate: getText(7),
        resultDate: getText(8),
        seenAt: new Date().toISOString(),
      } as JobListing);
    }

    return results;
  });
}

/**
 * 取得總頁數（頁面顯示 "N/M" 格式）
 */
async function getTotalPages(page: Page): Promise<number> {
  const text = await page.evaluate((): string => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const t = node.textContent?.trim() ?? '';
      if (/^\d+\/\d+$/.test(t)) return t;
    }
    return '';
  });

  const match = text.match(/^(\d+)\/(\d+)$/);
  if (!match) return 1;
  return parseInt(match[2], 10);
}

/**
 * 切換到指定頁碼
 */
async function goToPage(page: Page, pageNum: number): Promise<void> {
  await page.evaluate((n: number) => {
    const win = window as any;
    if (typeof win.chgVal === 'function') win.chgVal('List1_PAGE', String(n));
    if (typeof win.chgValSubmit === 'function') win.chgValSubmit('List1', 'SEARCH');
  }, pageNum);
  await page.waitForLoadState('networkidle');
}

/**
 * 主爬蟲函式
 */
export async function scrape(config: Config): Promise<JobListing[]> {
  let browser: Browser | null = null;
  const allJobs: JobListing[] = [];

  try {
    browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    for (const subject of config.subjects) {
      console.log(`\n=== 搜尋科目：${subject} ===`);
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });

      // 優先用 checkbox 精確搜尋；失敗時 fallback 到關鍵字搜尋
      const usedCheckbox = await selectSubjectViaCheckbox(page, subject);
      if (!usedCheckbox) {
        console.log(`  使用公告主旨關鍵字搜尋：${subject}`);
        await page.locator('#ContentPlaceHolder1_txttbJobSub').fill(subject);
      }

      // 選擇學校性質（公立/私立/不分）
      if (config.schoolType && config.schoolType !== '不分') {
        const radioLabel = page.locator(`label:text-is("${config.schoolType}")`).first();
        const radioFor = await radioLabel.getAttribute('for').catch(() => null);
        if (radioFor) {
          await page.locator(`#${radioFor}`).check();
          console.log(`  學校性質：${config.schoolType}`);
        } else {
          console.log(`  找不到學校性質「${config.schoolType}」radio button`);
        }
      }

      // 送出查詢
      await page.locator('#ContentPlaceHolder1_bntSearch').click();
      await page.waitForLoadState('networkidle');

      // 第一頁
      const firstBatch = await extractJobsFromPage(page);
      allJobs.push(...firstBatch);

      const totalPages = await getTotalPages(page);
      console.log(`  共 ${totalPages} 頁，第 1 頁取得 ${firstBatch.length} 筆`);

      // 後續頁面
      for (let p = 2; p <= totalPages; p++) {
        await goToPage(page, p);
        const batch = await extractJobsFromPage(page);
        allJobs.push(...batch);
        console.log(`  第 ${p} 頁取得 ${batch.length} 筆`);
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  // 依 jobId 去重
  const uniqueMap: Record<string, JobListing> = {};
  for (const job of allJobs) {
    uniqueMap[job.jobId] = job;
  }
  const uniqueJobs = Object.values(uniqueMap);
  console.log(`\n爬取完成，共 ${uniqueJobs.length} 筆不重複職缺`);
  return uniqueJobs;
}
