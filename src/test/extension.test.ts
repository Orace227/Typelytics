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

    const todayData = await dataManager.getTodayData();
    assert.strictEqual(todayData.wordCount["test"], 5);
    assert.strictEqual(todayData.totalWords, 8);
  });
});
