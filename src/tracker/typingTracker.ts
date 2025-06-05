import * as vscode from "vscode";
import { DataManager } from "../storage/dataManager";

export class TypingTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private wordBuffer = new Map<string, number>();
  private sessionData = {
    wordsTyped: 0,
    charactersTyped: 0,
    startTime: Date.now(),
  };

  constructor(private dataManager: DataManager) {}

  startTracking(): void {
    // Track document changes
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(
      this.onTextDocumentChange.bind(this)
    );

    // Flush buffer periodically for performance
    const flushInterval = setInterval(() => {
      void this.flushBuffer();
    }, 5000); // Flush every 5 seconds

    this.disposables.push(changeDisposable, {
      dispose: () => clearInterval(flushInterval),
    });
  }

  private onTextDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (!this.shouldTrackDocument(event.document)) {
      return;
    }

    for (const change of event.contentChanges) {
      if (change.text) {
        this.processText(change.text);
      }
    }
  }

  private shouldTrackDocument(document: vscode.TextDocument): boolean {
    const config = vscode.workspace.getConfiguration("typingAnalytics");

    if (!config.get("enabled")) {
      return false;
    }

    const excludePatterns: string[] = config.get("excludePatterns", []);
    const filePath = document.uri.fsPath;

    return !excludePatterns.some(
      (pattern) => vscode.languages.match({ pattern }, document) > 0
    );
  }

  private processText(text: string): void {
    // Extract words with case-aware splitting
    const { words, caseStats } = this.extractWordsWithCases(text);

    // Update session stats
    this.sessionData.charactersTyped += text.length;
    this.sessionData.wordsTyped += words.length;

    // Batch word counting for performance
    words.forEach((word) => {
      this.wordBuffer.set(word, (this.wordBuffer.get(word) || 0) + 1);
    });

    // Track case usage patterns
    Object.entries(caseStats).forEach(([caseType, count]) => {
      const caseKey = `__CASE__${caseType}`;
      this.wordBuffer.set(caseKey, (this.wordBuffer.get(caseKey) || 0) + count);
    });

    // Auto-flush if buffer gets too large
    if (this.wordBuffer.size > 1000) {
      void this.flushBuffer();
    }
  }

  private extractWordsWithCases(text: string): {
    words: string[];
    caseStats: { [key: string]: number };
  } {
    const words: string[] = [];
    const caseStats: { [key: string]: number } = {
      camelCase: 0,
      PascalCase: 0,
      snake_case: 0,
      "kebab-case": 0,
      UPPER_CASE: 0,
      lowercase: 0,
    };

    // Split text into potential words/identifiers
    const tokens =
      text.match(/[a-zA-Z_$][a-zA-Z0-9_$]*|[a-zA-Z]+(?:-[a-zA-Z]+)*/g) || [];

    tokens.forEach((token) => {
      if (token.length <= 1) {
        return;
      }
      const caseType = this.detectCaseType(token);
      caseStats[caseType]++;

      // Split compound words based on case type
      const splitWords = this.splitByCase(token, caseType);
      words.push(
        ...splitWords.map((w) => w.toLowerCase()).filter((w) => w.length > 1)
      );
    });

    return { words, caseStats };
  }

  private detectCaseType(word: string): string {
    // Check for different case patterns
    if (/^[A-Z_][A-Z0-9_]*$/.test(word)) {
      return "UPPER_CASE";
    } else if (/^[a-z]+(?:_[a-z]+)+$/.test(word)) {
      return "snake_case";
    } else if (/^[a-z]+(?:-[a-z]+)+$/.test(word)) {
      return "kebab-case";
    } else if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(word)) {
      return "PascalCase";
    } else if (/^[a-z]+(?:[A-Z][a-z]+)+$/.test(word)) {
      return "camelCase";
    } else if (/^[a-z]+$/.test(word)) {
      return "lowercase";
    }
    return "mixed"; // Fallback for mixed cases
  }

  private splitByCase(word: string, caseType: string): string[] {
    switch (caseType) {
      case "camelCase":
      case "PascalCase":
        // Split on capital letters: camelCase -> ['camel', 'Case']
        return word.split(/(?=[A-Z])/).filter((w) => w.length > 0);

      case "snake_case":
      case "UPPER_CASE":
        // Split on underscores: snake_case -> ['snake', 'case']
        return word.split("_").filter((w) => w.length > 0);

      case "kebab-case":
        // Split on hyphens: kebab-case -> ['kebab', 'case']
        return word.split("-").filter((w) => w.length > 0);

      default:
        return [word];
    }
  }

  private async flushBuffer(): Promise<void> {
    if (this.wordBuffer.size === 0) {
      return;
    }
    const wordData = Array.from(this.wordBuffer.entries());
    await this.dataManager.updateWordFrequency(wordData);

    this.wordBuffer.clear();
  }

  dispose(): void {
    void this.flushBuffer(); // Final flush
    this.disposables.forEach((d) => d.dispose());
  }
}
