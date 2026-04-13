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
