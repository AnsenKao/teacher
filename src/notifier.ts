import { Client, GatewayIntentBits, TextChannel, EmbedBuilder, REST, Routes } from 'discord.js';
import { Config, JobListing, KhJobListing } from './types';

const JOB_BASE_URL =
  'https://personnel.k12ea.gov.tw/tsn/index/JobShow.aspx?f=FUN20100316111720R14';

/**
 * 建立單一職缺的 Discord Embed 訊息
 */
function buildEmbed(job: JobListing): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x00c853) // 綠色
    .setTitle(`🏫 ${job.school}`)
    .setDescription(job.title)
    .addFields(
      { name: '📍 工作地點', value: job.location || '—', inline: true },
      { name: '🏷️ 學校教育階段', value: job.schoolLevel || '—', inline: true },
      { name: '📋 職缺階段', value: job.vacancyLevel || '—', inline: true },
      { name: '📅 公告日期', value: job.announceDate || '—', inline: true },
      { name: '⏰ 報名截止', value: job.deadline || '—', inline: true },
      { name: '📝 考試日期', value: job.examDate || '—', inline: true },
      { name: '🔗 職缺列表', value: `[點此前往教師選聘網](${JOB_BASE_URL})`, inline: false },
    )
    .setFooter({ text: `Job ID: ${job.jobId}` })
    .setTimestamp();
}

/**
 * 傳送新職缺通知到 Discord 頻道
 */
export async function notify(newJobs: JobListing[], config: Config): Promise<void> {
  if (newJobs.length === 0) {
    console.log('沒有新職缺，不傳送通知');
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    await client.login(config.discord.botToken);

    // 等待 ready 事件
    await new Promise<void>((resolve, reject) => {
      client.once('clientReady', () => resolve());
      setTimeout(() => reject(new Error('Discord client 登入逾時')), 15000);
    });

    const channel = await client.channels.fetch(config.discord.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`找不到頻道 ${config.discord.channelId} 或不是文字頻道`);
    }

    // 先傳送摘要訊息
    await channel.send({
      content: `📢 **發現 ${newJobs.length} 個新教師職缺！**（科目：${config.subjects.join('、')}）`,
    });

    // 每個職缺各自發一則訊息（避免 Discord 合併相同 URL 的 embed）
    for (const job of newJobs) {
      await channel.send({ embeds: [buildEmbed(job)] });
      // 避免 rate limit（每秒約 5 則）
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`已成功傳送 ${newJobs.length} 個新職缺通知到 Discord`);
  } finally {
    client.destroy();
  }
}

/**
 * 建立單一高雄市職缺的 Discord Embed 訊息
 */
function buildKhEmbed(job: KhJobListing): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x1565c0) // 藍色（與教師選聘網綠色區分）
    .setTitle(`🏫 ${job.school}`)
    .setDescription(`${job.announcement}${job.subject ? `　${job.subject}` : ''}`)
    .addFields(
      { name: '📋 簡章類別', value: job.formType || '—', inline: true },
      { name: '📅 張貼日期', value: job.postDate || '—', inline: true },
      { name: '⏰ 報名截止', value: job.deadline || '—', inline: true },
      { name: '📝 甄選日期', value: job.examDate || '—', inline: true },
      { name: '📌 備註', value: job.note || '—', inline: true },
      {
        name: '🔗 簡章連結',
        value: job.announcementUrl ? `[點此開啟簡章](${job.announcementUrl})` : '—',
        inline: false,
      },
    )
    .setFooter({ text: `高雄市甄選公告` })
    .setTimestamp();
}

/**
 * 傳送高雄市新職缺通知到 Discord 頻道
 */
export async function notifyKh(newJobs: KhJobListing[], config: Config): Promise<void> {
  if (newJobs.length === 0) {
    console.log('[KH] 沒有新職缺，不傳送通知');
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    await client.login(config.discord.botToken);

    await new Promise<void>((resolve, reject) => {
      client.once('clientReady', () => resolve());
      setTimeout(() => reject(new Error('Discord client 登入逾時')), 15000);
    });

    const channel = await client.channels.fetch(config.discord.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`找不到頻道 ${config.discord.channelId} 或不是文字頻道`);
    }

    const subjects = config.kh?.subjects.join('、') ?? '—';
    await channel.send({
      content: `📢 **【高雄市】發現 ${newJobs.length} 個新教師職缺！**（科目：${subjects}）`,
    });

    for (const job of newJobs) {
      await channel.send({ embeds: [buildKhEmbed(job)] });
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`[KH] 已成功傳送 ${newJobs.length} 個新職缺通知到 Discord`);
  } finally {
    client.destroy();
  }
}
