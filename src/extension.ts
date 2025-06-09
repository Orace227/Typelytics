import * as vscode from "vscode";
import { TypingTracker } from "./tracker/typingTracker";
import { DataManager } from "./storage/dataManager";
import { AnalyticsDashboard } from "./ui/webview";

export function activate(context: vscode.ExtensionContext) {
  const dataManager = new DataManager(context);
  const typingTracker = new TypingTracker(dataManager);
  const dashboard = new AnalyticsDashboard(context, dataManager);

  console.log("working");

  // Start tracking when extension activates
  typingTracker.startTracking();

  // Register commands
  const showDashboardCommand = vscode.commands.registerCommand(
    "typingAnalytics.showDashboard",
    () => dashboard.show()
  );

  // Daily popup timer
  setupDailyPopup(dashboard);

  context.subscriptions.push(showDashboardCommand, typingTracker);
}

function setupDailyPopup(dashboard: AnalyticsDashboard) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(17, 0, 0, 0); // 5 PM daily

  const msUntilTomorrow = tomorrow.getTime() - now.getTime();

  setTimeout(() => {
    if (
      vscode.workspace.getConfiguration("typingAnalytics").get("showDailyPopup")
    ) {
      dashboard.showDailySummary();
    }
    // Set up recurring daily popup
    setInterval(() => {
      dashboard.showDailySummary();
    }, 24 * 60 * 60 * 1000);
  }, msUntilTomorrow);
}
