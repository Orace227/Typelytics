import * as vscode from "vscode";
import { DataManager } from "../storage/dataManager";

interface TodayData {
  totalWords: number;
  totalCharacters: number;
  topWords: Array<{ word: string; count: number }>;
  caseUsage: { [key: string]: number };
}

interface HistoricalData {
  date: string;
  totalWords: number;
  totalCharacters: number;
}

export class AnalyticsDashboard {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private dataManager: DataManager
  ) {}

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "typingAnalytics",
      "Typing Analytics Dashboard",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
        ],
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    await this.updateContent();
  }

  async showDailySummary(): Promise<void> {
    const todayData = await this.dataManager.getTodayData();

    if (todayData.totalWords === 0) {
      return; // No activity today
    }

    const message = `Today's Typing Summary:
- Words typed: ${todayData.totalWords}
- Characters typed: ${todayData.totalCharacters}
- Most used word: ${todayData.topWords[0]?.word || "N/A"} (${
      todayData.topWords[0]?.count || 0
    } times)`;

    const action = await vscode.window.showInformationMessage(
      message,
      "View Full Dashboard",
      "Dismiss"
    );

    if (action === "View Full Dashboard") {
      void this.show();
    }
  }

  private async updateContent(): Promise<void> {
    if (!this.panel) {
      return;
    }

    const [todayData, historicalData] = await Promise.all([
      this.dataManager.getTodayData(),
      this.dataManager.getHistoricalData(30),
    ]);

    this.panel.webview.html = this.generateHtml(todayData, historicalData);
  }

  private generateHtml(
    todayData: TodayData,
    historicalData: HistoricalData[]
  ): string {
    const avgWords = Math.round(
      historicalData.reduce((sum, day) => sum + day.totalWords, 0) /
        Math.max(historicalData.length, 1)
    );

    const avgCharacters = Math.round(
      historicalData.reduce((sum, day) => sum + day.totalCharacters, 0) /
        Math.max(historicalData.length, 1)
    );

    const topCaseStyle = this.getTopCaseStyle(todayData.caseUsage);
    const totalCasePatterns = Object.values(todayData.caseUsage).reduce(
      (a, b) => a + b,
      0
    );

    const caseInsightsHtml = Object.entries(todayData.caseUsage)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([caseType, count]) => {
        const percentage = Math.round((count / totalCasePatterns) * 100);
        return `<div class="insight-item">
          <span><strong>${caseType}:</strong> ${this.getCaseDescription(
          caseType
        )}</span>
          <span><strong>${count} times</strong> (${percentage}%)</span>
        </div>`;
      })
      .join("");

    const topWordsHtml = todayData.topWords
      .slice(0, 20)
      .map(
        (item) => `<div class="word-item">
        <strong>${item.word}</strong><br>
        <small>${item.count} times</small>
      </div>`
      )
      .join("");

    const dailyLabels = JSON.stringify(
      historicalData
        .slice(0, 14)
        .reverse()
        .map((d) => d.date)
    );

    const dailyData = JSON.stringify(
      historicalData
        .slice(0, 14)
        .reverse()
        .map((d) => d.totalWords)
    );

    const caseDataJson = JSON.stringify(todayData.caseUsage);

    const wordLabels = JSON.stringify(
      todayData.topWords.slice(0, 10).map((w) => w.word)
    );

    const wordData = JSON.stringify(
      todayData.topWords.slice(0, 10).map((w) => w.count)
    );

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Typing Analytics</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .stat-card { 
            padding: 20px; 
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px; 
            background: var(--vscode-editor-widget-background);
        }
        .chart-container { 
            margin: 20px 0; 
            height: 400px; 
        }
        .top-words { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); 
            gap: 10px; 
        }
        .word-item { 
            padding: 8px 12px; 
            background: var(--vscode-button-background);
            border-radius: 4px; 
            text-align: center; 
        }
        .case-insights {
            background: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .insight-item {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 8px;
            background: var(--vscode-editor-widget-background);
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Typing Analytics Dashboard</h1>
        
        <div class="stats-grid">
            <div class="stat-card">
                <h3>Today's Stats</h3>
                <p><strong>Words:</strong> ${todayData.totalWords}</p>
                <p><strong>Characters:</strong> ${todayData.totalCharacters}</p>
            </div>
            <div class="stat-card">
                <h3>Average per Day (30d)</h3>
                <p><strong>Words:</strong> ${avgWords}</p>
                <p><strong>Characters:</strong> ${avgCharacters}</p>
            </div>
            <div class="stat-card">
                <h3>Preferred Case Style</h3>
                <p><strong>Most Used:</strong> ${topCaseStyle}</p>
                <p><strong>Total Patterns:</strong> ${totalCasePatterns}</p>
            </div>
        </div>

        <div class="chart-container">
            <canvas id="dailyChart"></canvas>
        </div>

        <div class="chart-container">
            <canvas id="caseUsageChart"></canvas>
        </div>

        <div class="case-insights">
            <h3>🎯 Case Style Insights</h3>
            ${caseInsightsHtml}
        </div>

        <h3>Top Words Today</h3>
        <div class="top-words">
            ${topWordsHtml}
        </div>

        <div class="chart-container">
            <canvas id="wordFrequencyChart"></canvas>
        </div>
    </div>

    <script>
        // Daily activity chart
        const dailyCtx = document.getElementById('dailyChart').getContext('2d');
        new Chart(dailyCtx, {
            type: 'line',
            data: {
                labels: ${dailyLabels},
                datasets: [{
                    label: 'Words Typed',
                    data: ${dailyData},
                    borderColor: '#007ACC',
                    backgroundColor: 'rgba(0, 122, 204, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Daily Typing Activity (Last 14 Days)'
                    }
                }
            }
        });

        // Case usage chart
        const caseCtx = document.getElementById('caseUsageChart').getContext('2d');
        const caseData = ${caseDataJson};
        new Chart(caseCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(caseData),
                datasets: [{
                    data: Object.values(caseData),
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                        '#9966FF', '#FF9F40', '#FF6384'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Case Style Usage Distribution'
                    },
                    legend: {
                        position: 'right'
                    }
                }
            }
        });

        // Word frequency chart
        const wordCtx = document.getElementById('wordFrequencyChart').getContext('2d');
        new Chart(wordCtx, {
            type: 'bar',
            data: {
                labels: ${wordLabels},
                datasets: [{
                    label: 'Frequency',
                    data: ${wordData},
                    backgroundColor: 'rgba(0, 122, 204, 0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Top 10 Words Today'
                    }
                }
            }
        });
    </script>
</body>
</html>`;
  }

  private getTopCaseStyle(caseUsage: { [key: string]: number }): string {
    const entries = Object.entries(caseUsage);
    const maxEntry = entries.reduce(
      (max, current) => (current[1] > max[1] ? current : max),
      ["none", 0]
    );
    return maxEntry[1] > 0 ? maxEntry[0] : "No data";
  }

  private getCaseDescription(caseType: string): string {
    const descriptions: { [key: string]: string } = {
      camelCase: "Variables, methods (camelCase)",
      PascalCase: "Classes, interfaces (PascalCase)",
      snake_case: "Python style (snake_case)",
      "kebab-case": "CSS, URLs (kebab-case)",
      UPPER_CASE: "Constants (UPPER_CASE)",
      lowercase: "Simple lowercase words",
      mixed: "Mixed case patterns",
    };
    return descriptions[caseType] || "Unknown pattern";
  }
}
