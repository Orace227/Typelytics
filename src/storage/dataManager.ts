import * as vscode from "vscode";

interface WordFrequencyData {
  word: string;
  count: number;
  lastUsed: number;
  contexts: string[];
}

export class DataManager {
  private readonly WORD_FREQUENCY_KEY = "wordFrequency";
  private readonly WORD_FREQUENCY_DATA_KEY = "wordFrequencyData";
  private readonly SESSION_STATS_KEY = "sessionStats";

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Update word frequency (legacy method for compatibility)
   */
  async updateWordFrequency(wordData: Array<[string, number]>): Promise<void> {
    try {
      const existing =
        (await this.getStoredData<Record<string, number>>(
          this.WORD_FREQUENCY_KEY
        )) || {};

      // Merge new data with existing
      wordData.forEach(([word, count]) => {
        existing[word] = (existing[word] || 0) + count;
      });

      await this.context.globalState.update(this.WORD_FREQUENCY_KEY, existing);
    } catch (error) {
      console.error("Failed to update word frequency:", error);
      throw error;
    }
  }

  /**
   * Save comprehensive word frequency data
   */
  async saveWordFrequencyData(
    frequencyData: Array<[string, WordFrequencyData]>
  ): Promise<void> {
    try {
      // Convert Map entries to plain object for storage
      const dataObject: Record<string, WordFrequencyData> = {};
      frequencyData.forEach(([word, data]) => {
        dataObject[word] = data;
      });

      await this.context.globalState.update(
        this.WORD_FREQUENCY_DATA_KEY,
        dataObject
      );
    } catch (error) {
      console.error("Failed to save word frequency data:", error);
      throw error;
    }
  }

  /**
   * Get comprehensive word frequency data
   */
  async getWordFrequencyData(): Promise<Array<
    [string, WordFrequencyData]
  > | null> {
    try {
      const data = await this.getStoredData<Record<string, WordFrequencyData>>(
        this.WORD_FREQUENCY_DATA_KEY
      );

      if (!data) return null;

      return Object.entries(data);
    } catch (error) {
      console.error("Failed to get word frequency data:", error);
      return null;
    }
  }

  /**
   * Get legacy word frequency (for backward compatibility)
   */
  async getWordFrequency(): Promise<Array<[string, number]> | null> {
    try {
      const data = await this.getStoredData<Record<string, number>>(
        this.WORD_FREQUENCY_KEY
      );

      if (!data) return null;

      return Object.entries(data);
    } catch (error) {
      console.error("Failed to get word frequency:", error);
      return null;
    }
  }

  /**
   * Get top words by frequency
   */
  async getTopWords(
    limit: number = 50
  ): Promise<Array<[string, WordFrequencyData]>> {
    try {
      const data = await this.getWordFrequencyData();

      if (!data) return [];

      return data.sort(([, a], [, b]) => b.count - a.count).slice(0, limit);
    } catch (error) {
      console.error("Failed to get top words:", error);
      return [];
    }
  }

  /**
   * Get words filtered by file context
   */
  async getWordsByContext(
    fileExtension: string
  ): Promise<Array<[string, WordFrequencyData]>> {
    try {
      const data = await this.getWordFrequencyData();

      if (!data) return [];

      return data
        .filter(([, wordData]) => wordData.contexts.includes(fileExtension))
        .sort(([, a], [, b]) => b.count - a.count);
    } catch (error) {
      console.error("Failed to get words by context:", error);
      return [];
    }
  }

  /**
   * Save session statistics
   */
  async saveSessionStats(stats: any): Promise<void> {
    try {
      await this.context.globalState.update(this.SESSION_STATS_KEY, stats);
    } catch (error) {
      console.error("Failed to save session stats:", error);
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<any> {
    try {
      return await this.getStoredData(this.SESSION_STATS_KEY);
    } catch (error) {
      console.error("Failed to get session stats:", error);
      return null;
    }
  }

  /**
   * Clear all analytics data
   */
  async clearAllData(): Promise<void> {
    try {
      await Promise.all([
        this.context.globalState.update(this.WORD_FREQUENCY_KEY, undefined),
        this.context.globalState.update(
          this.WORD_FREQUENCY_DATA_KEY,
          undefined
        ),
        this.context.globalState.update(this.SESSION_STATS_KEY, undefined),
      ]);

      console.log("All analytics data cleared");
    } catch (error) {
      console.error("Failed to clear data:", error);
      throw error;
    }
  }

  /**
   * Export data for backup or analysis
   */
  async exportData(): Promise<{
    wordFrequency: Record<string, WordFrequencyData>;
    sessionStats: any;
    exportDate: number;
  }> {
    try {
      const [wordFrequencyData, sessionStats] = await Promise.all([
        this.getWordFrequencyData(),
        this.getSessionStats(),
      ]);

      const wordFrequency: Record<string, WordFrequencyData> = {};
      if (wordFrequencyData) {
        wordFrequencyData.forEach(([word, data]) => {
          wordFrequency[word] = data;
        });
      }

      return {
        wordFrequency,
        sessionStats: sessionStats || {},
        exportDate: Date.now(),
      };
    } catch (error) {
      console.error("Failed to export data:", error);
      throw error;
    }
  }

  /**
   * Import data from backup
   */
  async importData(data: {
    wordFrequency: Record<string, WordFrequencyData>;
    sessionStats: any;
  }): Promise<void> {
    try {
      await Promise.all([
        this.context.globalState.update(
          this.WORD_FREQUENCY_DATA_KEY,
          data.wordFrequency
        ),
        this.context.globalState.update(
          this.SESSION_STATS_KEY,
          data.sessionStats
        ),
      ]);

      console.log("Data imported successfully");
    } catch (error) {
      console.error("Failed to import data:", error);
      throw error;
    }
  }

  /**
   * Generic method to get stored data with type safety
   */
  private async getStoredData<T>(key: string): Promise<T | undefined> {
    try {
      return this.context.globalState.get<T>(key);
    } catch (error) {
      console.error(`Failed to get stored data for key ${key}:`, error);
      return undefined;
    }
  }

  /**
   * Get analytics summary for dashboard
   */
  async getAnalyticsSummary(): Promise<{
    totalWords: number;
    uniqueWords: number;
    topWords: Array<[string, WordFrequencyData]>;
    contextBreakdown: Record<string, number>;
    recentActivity: Array<[string, WordFrequencyData]>;
  }> {
    try {
      const wordData = await this.getWordFrequencyData();

      if (!wordData || wordData.length === 0) {
        return {
          totalWords: 0,
          uniqueWords: 0,
          topWords: [],
          contextBreakdown: {},
          recentActivity: [],
        };
      }

      const totalWords = wordData.reduce(
        (sum, [, data]) => sum + data.count,
        0
      );
      const uniqueWords = wordData.length;
      const topWords = wordData
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 10);

      // Context breakdown
      const contextBreakdown: Record<string, number> = {};
      wordData.forEach(([, data]) => {
        data.contexts.forEach((context) => {
          contextBreakdown[context] =
            (contextBreakdown[context] || 0) + data.count;
        });
      });

      // Recent activity (last 24 hours)
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentActivity = wordData
        .filter(([, data]) => data.lastUsed > oneDayAgo)
        .sort(([, a], [, b]) => b.lastUsed - a.lastUsed)
        .slice(0, 20);

      return {
        totalWords,
        uniqueWords,
        topWords,
        contextBreakdown,
        recentActivity,
      };
    } catch (error) {
      console.error("Failed to get analytics summary:", error);
      throw error;
    }
  }
}
