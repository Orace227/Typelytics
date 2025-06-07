import * as vscode from "vscode";
import { DataManager } from "../storage/dataManager";

interface WordFrequencyData {
  word: string;
  count: number;
  lastUsed: number;
  contexts: string[]; // File extensions where this word was used
}

interface SessionStats {
  wordsTyped: number;
  charactersTyped: number;
  uniqueWords: number;
  startTime: number;
  keystrokes: number;
}

export class TypingTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private wordBuffer = new Map<string, number>();
  private wordFrequency = new Map<string, WordFrequencyData>();
  private sessionData: SessionStats = {
    wordsTyped: 0,
    charactersTyped: 0,
    uniqueWords: 0,
    startTime: Date.now(),
    keystrokes: 0,
  };

  // Security: Limit buffer sizes to prevent memory exhaustion
  private readonly MAX_BUFFER_SIZE = 10000;
  private readonly MAX_WORD_LENGTH = 100;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds
  private readonly MAX_CONTEXTS_PER_WORD = 10;

  // Performance: Debounce frequent operations
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private dataManager: DataManager) {
    this.loadStoredWordFrequency();
  }

  private async loadStoredWordFrequency(): Promise<void> {
    try {
      const storedData = await this.dataManager.getWordFrequency();
      if (storedData && Array.isArray(storedData)) {
        storedData.forEach(([word, data]) => {
          if (
            this.isValidWordData(word, data) &&
            typeof data === "object" &&
            data !== null
          ) {
            this.wordFrequency.set(word, data as WordFrequencyData);
          }
        });
      }
    } catch (error) {
      console.error("Failed to load stored word frequency:", error);
    }
  }

  // Security: Validate data integrity
  private isValidWordData(word: string, data: any): boolean {
    return (
      typeof word === "string" &&
      word.length <= this.MAX_WORD_LENGTH &&
      typeof data === "object" &&
      typeof data.count === "number" &&
      typeof data.lastUsed === "number" &&
      Array.isArray(data.contexts) &&
      data.count >= 0 &&
      data.contexts.length <= this.MAX_CONTEXTS_PER_WORD
    );
  }

  startTracking(): void {
    console.log("TypingTracker: Starting word frequency tracking");

    // Track document changes
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(
      this.onTextDocumentChange.bind(this)
    );

    // Periodic flush with performance optimization
    const flushInterval = setInterval(() => {
      void this.flushBuffer();
    }, this.FLUSH_INTERVAL);

    this.disposables.push(changeDisposable, {
      dispose: () => clearInterval(flushInterval),
    });

    console.log("TypingTracker: Event listeners registered successfully");
  }

  private onTextDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (!this.shouldTrackDocument(event.document)) {
      return;
    }

    const fileExtension = this.getFileExtension(event.document.fileName);

    for (const change of event.contentChanges) {
      if (change.text && change.text.trim()) {
        this.processText(change.text, fileExtension);
        this.sessionData.keystrokes++;
      }
    }

    // Performance: Debounced flush for high-frequency typing
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      void this.flushBuffer();
    }, 1000); // Debounce flush by 1 second
  }

  private shouldTrackDocument(document: vscode.TextDocument): boolean {
    const config = vscode.workspace.getConfiguration("typingAnalytics");

    if (!config.get("enabled", true)) {
      return false;
    }

    // Security: Only track file scheme documents
    if (document.uri.scheme !== "file" && document.uri.scheme !== "untitled") {
      return false;
    }

    const excludePatterns: string[] = config.get("excludePatterns", []);

    return !excludePatterns.some((pattern) => {
      try {
        return vscode.languages.match({ pattern }, document) > 0;
      } catch {
        return false; // Safe fallback for invalid patterns
      }
    });
  }

  private processText(text: string, fileExtension: string): void {
    // Security: Sanitize input
    if (text.length > 10000) {
      // Prevent processing extremely large text blocks
      text = text.substring(0, 10000);
    }

    const words = this.extractWords(text);
    console.log(`Extracted words from "${text}":`, words);

    // Update session statistics
    this.sessionData.charactersTyped += text.length;
    this.sessionData.wordsTyped += words.length;

    // Process each word
    words.forEach((word) => {
      this.updateWordFrequency(word, fileExtension);
    });

    // Update unique word count
    this.sessionData.uniqueWords = this.wordFrequency.size;

    // Security: Prevent buffer overflow
    if (this.wordBuffer.size > this.MAX_BUFFER_SIZE) {
      console.warn("Word buffer size exceeded, forcing flush");
      void this.flushBuffer();
    }
  }

  /**
   * Optimized word extraction with comprehensive case handling
   * Handles: camelCase, PascalCase, snake_case, kebab-case, UPPER_CASE
   */
  private extractWords(text: string): string[] {
    const words: string[] = [];

    // Enhanced regex to capture various identifier patterns
    const identifierPattern =
      /[a-zA-Z_$][a-zA-Z0-9_$]*|[a-zA-Z]+(?:[-][a-zA-Z]+)*/g;
    const matches = text.match(identifierPattern) || [];

    matches.forEach((match) => {
      if (match.length <= 1 || match.length > this.MAX_WORD_LENGTH) {
        return;
      }

      const extractedWords = this.splitCompoundWord(match);
      words.push(...extractedWords);
    });

    return words;
  }

  /**
   * Intelligently splits compound words based on various naming conventions
   */
  private splitCompoundWord(word: string): string[] {
    const words: string[] = [];

    // Handle different case patterns
    if (this.isCamelOrPascalCase(word)) {
      // Split camelCase/PascalCase: "thisIsWorking" -> ["this", "Is", "Working"]
      const parts = word.split(/(?=[A-Z])/);
      words.push(...parts.filter((part) => part.length > 1));
    } else if (this.isSnakeCase(word)) {
      // Split snake_case: "this_is_working" -> ["this", "is", "working"]
      words.push(...word.split("_").filter((part) => part.length > 1));
    } else if (this.isKebabCase(word)) {
      // Split kebab-case: "this-is-working" -> ["this", "is", "working"]
      words.push(...word.split("-").filter((part) => part.length > 1));
    } else if (this.isUpperCase(word)) {
      // Split UPPER_CASE: "THIS_IS_WORKING" -> ["THIS", "IS", "WORKING"]
      words.push(...word.split("_").filter((part) => part.length > 1));
    } else {
      // Single word or unrecognized pattern
      words.push(word);
    }

    // Normalize to lowercase for consistent tracking
    return words.map((w) => w.toLowerCase()).filter((w) => w.length > 1);
  }

  // Optimized case detection methods
  private isCamelOrPascalCase(word: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(word);
  }

  private isSnakeCase(word: string): boolean {
    return /^[a-z]+(?:_[a-z]+)+$/.test(word);
  }

  private isKebabCase(word: string): boolean {
    return /^[a-z]+(?:-[a-z]+)+$/.test(word);
  }

  private isUpperCase(word: string): boolean {
    return /^[A-Z]+(?:_[A-Z]+)*$/.test(word);
  }

  private updateWordFrequency(word: string, fileExtension: string): void {
    // Update buffer for batched processing
    this.wordBuffer.set(word, (this.wordBuffer.get(word) || 0) + 1);
    console.log("this.wordBuffer", this.wordBuffer);
    // Update or create word frequency data
    const existing = this.wordFrequency.get(word);
    const now = Date.now();
    console.log(
      "existing.contexts.push(fileExtension)",
      existing?.contexts.push(fileExtension)
    );

    if (existing) {
      existing.count++;
      existing.lastUsed = now;

      // Add context if not already present (security: limit contexts)
      if (
        !existing.contexts.includes(fileExtension) &&
        existing.contexts.length < this.MAX_CONTEXTS_PER_WORD
      ) {
        existing.contexts.push(fileExtension);
      }
    } else {
      this.wordFrequency.set(word, {
        word,
        count: 1,
        lastUsed: now,
        contexts: [fileExtension],
      });
    }
  }

  private getFileExtension(fileName: string): string {
    const match = fileName.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : "unknown";
  }

  private async flushBuffer(): Promise<void> {
    if (this.wordBuffer.size === 0) {
      return;
    }

    try {
      // Convert to format expected by DataManager
      const wordData = Array.from(this.wordBuffer.entries());
      await this.dataManager.updateWordFrequency(wordData);

      // Also save the full frequency data
      const frequencyData = Array.from(this.wordFrequency.entries());
      await this.dataManager.saveWordFrequencyData(frequencyData);

      this.wordBuffer.clear();
      console.log(`Flushed ${wordData.length} word entries to storage`);
    } catch (error) {
      console.error("Failed to flush word buffer:", error);
    }
  }

  // Public methods for UI integration
  public getWordFrequencyData(): Map<string, WordFrequencyData> {
    return new Map(this.wordFrequency);
  }

  public getTopWords(limit: number = 50): Array<[string, WordFrequencyData]> {
    return Array.from(this.wordFrequency.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, limit);
  }

  public getSessionStats(): SessionStats {
    return { ...this.sessionData };
  }

  public getWordsByContext(
    fileExtension: string
  ): Array<[string, WordFrequencyData]> {
    return Array.from(this.wordFrequency.entries())
      .filter(([, data]) => data.contexts.includes(fileExtension))
      .sort(([, a], [, b]) => b.count - a.count);
  }

  // Performance analytics
  public getTypingSpeed(): number {
    const elapsed = Date.now() - this.sessionData.startTime;
    const minutes = elapsed / (1000 * 60);
    return minutes > 0 ? Math.round(this.sessionData.wordsTyped / minutes) : 0;
  }

  public getCharactersPerMinute(): number {
    const elapsed = Date.now() - this.sessionData.startTime;
    const minutes = elapsed / (1000 * 60);
    return minutes > 0
      ? Math.round(this.sessionData.charactersTyped / minutes)
      : 0;
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    void this.flushBuffer(); // Final flush
    this.disposables.forEach((d) => d.dispose());

    console.log("TypingTracker disposed with final stats:", this.sessionData);
  }
}
