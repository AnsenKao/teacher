export interface KhConfig {
  formType: string;   // e.g. "高中代理代課[長期]"
  subjects: string[]; // e.g. ["生物"]
  schoolYear: number; // e.g. 114
  dataPath: string;   // e.g. "./data/kh-jobs.json"
}

export interface Config {
  discord: {
    botToken: string;
    channelId: string;
  };
  subjects: string[];
  educationLevels: string[];
  cron: string;
  dataPath: string;
  headless: boolean;
  schoolType?: '公立' | '私立' | '不分';
  kh?: KhConfig;
}

export interface JobListing {
  jobId: string;
  school: string;
  title: string;
  schoolLevel: string;
  vacancyLevel: string;
  location: string;
  announceDate: string;
  deadline: string;
  examDate: string;
  resultDate: string;
  seenAt: string;
}

export interface JobStore {
  [jobId: string]: JobListing;
}

export interface KhJobListing {
  jobId: string;           // announcement URL（唯一識別）
  school: string;          // 張貼學校
  postDate: string;        // 張貼日期
  formType: string;        // 簡章類別
  announcement: string;   // 公告標題（第X號第Y次公告）
  subject: string;         // 科目
  announcementUrl: string; // 簡章連結
  deadline: string;        // 報名截止日期
  examDate: string;        // 甄選日期
  note: string;            // 備註
  seenAt: string;
}

export interface KhJobStore {
  [jobId: string]: KhJobListing;
}
