#!/usr/bin/env node

const React = require("react");
const { render } = require("ink");
const BacklogRunnerTUI = require("./ui/InkTUI.js");
const TaskRunner = require("./runners/TaskRunner.js");

// Create task runner instance
const taskRunner = new TaskRunner();

// Check environment before starting
async function checkEnvironment() {
  const envErrors = await taskRunner.checkEnvironment();
  if (envErrors.length > 0) {
    console.error("❌ Environment check failed:");
    envErrors.forEach((error) => {
      console.error(`  • ${error}`);
    });
    console.error("\nPlease fix these issues before running the task runner.");
    process.exit(1);
  }
}

// Main entry point
async function main() {
  try {
    await checkEnvironment();

    // Render the Ink TUI
    const { rerender, unmount } = render(
      React.createElement(BacklogRunnerTUI, { taskRunner }),
    );

    // Handle graceful shutdown
    const shutdown = () => {
      unmount();
      // Restore terminal state
      process.stdout.write("\x1b[?1049l"); // Exit alternate screen
      process.stdout.write("\x1b[0m"); // Reset colors
      console.log("👋 Shutting down gracefully...");
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to start runner:", error.message);
    process.exit(1);
  }
}

// Start the application
main();
