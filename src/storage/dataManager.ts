import * as vscode from "vscode";

export interface DayStats {
  date: string;
  wordCount: { [word: string]: number };
  totalWords: number;
  totalCharacters: number;
  sessionTime: number;
  topWords: Array<{ word: string; count: number }>;
  caseUsage: {
    camelCase: number;
    PascalCase: number;
    snake_case: number;
    "kebab-case": number;
    UPPER_CASE: number;
    lowercase: number;
    mixed: number;
  };
  languagePatterns: { [language: string]: number };
}

export class DataManager {
  private readonly STORAGE_KEY = "typingAnalytics.data";

  constructor(private context: vscode.ExtensionContext) {}

  async updateWordFrequency(wordData: Array<[string, number]>) {
    const today = this.getTodayKey();
    const data = await this.getTodayData();

    // Efficiently merge word frequencies
    wordData.forEach(([word, count]) => {
      if (word.startsWith("__CASE__")) {
        // Handle case statistics
        const caseType = word.replace(
          "__CASE__",
          ""
        ) as keyof typeof data.caseUsage;
        if (data.caseUsage[caseType] !== undefined) {
          data.caseUsage[caseType] += count;
        }
      } else {
        // Handle regular words
        data.wordCount[word] = (data.wordCount[word] || 0) + count;
        data.totalWords += count;
      }
    });

    // Update top words (keep only top 100 for memory efficiency)
    data.topWords = Object.entries(data.wordCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 100)
      .map(([word, count]) => ({ word, count }));

    await this.saveData(today, data);
  }

  async getTodayData(): Promise<DayStats> {
    const today = this.getTodayKey();
    const allData = this.context.globalState.get<{ [key: string]: DayStats }>(
      this.STORAGE_KEY,
      {}
    );

    return (
      allData[today] || {
        date: today,
        wordCount: {},
        totalWords: 0,
        totalCharacters: 0,
        sessionTime: 0,
        topWords: [],
        caseUsage: {
          camelCase: 0,
          PascalCase: 0,
          snake_case: 0,
          "kebab-case": 0,
          UPPER_CASE: 0,
          lowercase: 0,
          mixed: 0,
        },
        languagePatterns: {},
      }
    );
  }

  async getHistoricalData(days: number = 30): Promise<DayStats[]> {
    const allData = this.context.globalState.get<{ [key: string]: DayStats }>(
      this.STORAGE_KEY,
      {}
    );

    return Object.values(allData)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, days);
  }

  private async saveData(dateKey: string, data: DayStats) {
    const allData = this.context.globalState.get<{ [key: string]: DayStats }>(
      this.STORAGE_KEY,
      {}
    );
    allData[dateKey] = data;

    // Keep only last 90 days to prevent storage bloat
    const keys = Object.keys(allData).sort().reverse();
    if (keys.length > 90) {
      keys.slice(90).forEach((key) => delete allData[key]);
    }

    await this.context.globalState.update(this.STORAGE_KEY, allData);
  }

  private getTodayKey(): string {
    return new Date().toISOString().split("T")[0];
  }

  async clearAllData() {
    await this.context.globalState.update(this.STORAGE_KEY, {});
  }
}
