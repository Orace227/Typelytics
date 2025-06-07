// tests/extension.test.ts
import * as assert from "assert";
import * as vscode from "vscode";
import { DataManager } from "../storage/dataManager";

suite("Extension Test Suite", () => {
  test("Word frequency tracking", async () => {
    const mockContext = {
      globalState: new Map(),
      subscriptions: [],
    } as any;

    const dataManager = new DataManager(mockContext);
    await dataManager.updateWordFrequency([
      ["test", 5],
      ["word", 3],
    ]);

    // Get the word frequency data using the available method
    const wordFrequencyData = await dataManager.getWordFrequency();
    assert.notStrictEqual(wordFrequencyData, null);

    // Convert array to object for easier testing
    const wordCountMap = Object.fromEntries(wordFrequencyData!);
    assert.strictEqual(wordCountMap["test"], 5);
    assert.strictEqual(wordCountMap["word"], 3);

    // Test analytics summary which includes totalWords
    const summary = await dataManager.getAnalyticsSummary();
    assert.strictEqual(summary.totalWords, 8);
    assert.strictEqual(summary.uniqueWords, 2);
  });
});
