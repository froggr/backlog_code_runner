#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ANSI colors
const colors = {
  reset: "\033[0m",
  bright: "\033[1m",
  red: "\033[31m",
  green: "\033[32m",
  yellow: "\033[33m",
  blue: "\033[34m",
  magenta: "\033[35m",
  cyan: "\033[36m",
  white: "\033[37m",
};

function log(message, color = "white") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function createDemoTask(title, description) {
  try {
    const acceptanceCriteria =
      "Task is processed by the agent,Code changes are committed,Task status is updated to Review";

    execSync(
      `backlog task create "${title}" -d "${description}" --ac "${acceptanceCriteria}" -s "For Agent" -l "demo,test"`,
      { stdio: "pipe" },
    );
    log(`✅ Created demo task: ${title}`, "green");
  } catch (error) {
    log(`❌ Failed to create task: ${title}`, "red");
    log(`   Error: ${error.message}`, "red");
  }
}

function createDemoConfig() {
  const config = {
    todoColumn: "For Agent",
    progressColumn: "In Progress",
    reviewColumn: "Review",
    completedColumn: "Done",
    backlogPath: "./backlog/tasks",
    mainBranch: "main",
    branchPrefix: "task",
    timeout: 300000,
    autoStart: false,
    pollInterval: 10000,
  };

  fs.writeFileSync(".backlog-runner.json", JSON.stringify(config, null, 2));
  log("✅ Created demo configuration file", "green");
}

function initGitRepo() {
  try {
    execSync("git rev-parse --git-dir", { stdio: "ignore" });
    log("✅ Git repository already exists", "green");
  } catch (error) {
    log("📦 Initializing Git repository...", "yellow");
    execSync("git init");
    execSync("git add .");
    execSync('git commit -m "Initial commit"');
    log("✅ Git repository initialized", "green");
  }
}

function showDemo() {
  log("", "white");
  log("🎬 BACKLOG CODE RUNNER DEMO", "cyan");
  log("=".repeat(50), "cyan");
  log("", "white");

  log(
    "This demo will set up a sample environment for testing the Backlog Code Runner.",
    "white",
  );
  log("", "white");

  // 1. Initialize Git if needed
  log("1. Setting up Git repository...", "yellow");
  initGitRepo();

  // 2. Create demo configuration
  log("", "white");
  log("2. Creating demo configuration...", "yellow");
  createDemoConfig();

  // 3. Create demo tasks
  log("", "white");
  log("3. Creating demo tasks...", "yellow");

  const demoTasks = [
    {
      title: "Create hello world file",
      description:
        "Create a simple hello.txt file with Hello World content in the root directory.",
    },
    {
      title: "Add package info",
      description:
        "Create a simple info.json file with basic project information including name, version, and description.",
    },
    {
      title: "Create README section",
      description:
        "Add a new section to README.md explaining the demo functionality and how to use it.",
    },
  ];

  demoTasks.forEach((task) => {
    createDemoTask(task.title, task.description);
  });

  // 4. Show next steps
  log("", "white");
  log("🎉 Demo environment created successfully!", "green");
  log("", "white");
  log("📋 Next steps:", "cyan");
  log("", "white");
  log("1. Start the Backlog Runner TUI:", "white");
  log("   npm start", "yellow");
  log("   or", "white");
  log("   backlog-runner", "yellow");
  log("", "white");
  log("2. In the TUI, press:", "white");
  log("   [S] - Start processing the first task", "yellow");
  log("   [A] - Enable auto-start mode", "yellow");
  log("   [R] - Refresh task list", "yellow");
  log("   [Q] - Quit the application", "yellow");
  log("", "white");
  log("3. Watch the OpenCode output in real-time", "white");
  log("4. See task progress and logs in the split-screen interface", "white");
  log("", "white");
  log("📁 Demo files created:", "cyan");
  log("   .backlog-runner.json - Configuration file", "white");
  log("   backlog/tasks/ - Demo task files", "white");
  log("", "white");
  log("🔧 The agent will:", "cyan");
  log("   • Create a snapshot before processing each task", "white");
  log("   • Process tasks using OpenCode in your current directory", "white");
  log("   • Commit changes with descriptive messages", "white");
  log('   • Update task status to "Review"', "white");
  log("   • Log all activity for debugging", "white");
  log("", "white");
  log("💡 Tips:", "cyan");
  log("   • Use [B] to create manual snapshots", "white");
  log("   • Use [U] to rollback the last task", "white");
  log("   • Use [C] to clear OpenCode output", "white");
  log("   • Use [L] to clear activity logs", "white");
  log("", "white");
  log("Happy coding! 🚀", "green");
}

// Run demo if this file is executed directly
if (require.main === module) {
  showDemo();
}

module.exports = { showDemo, createDemoTask, createDemoConfig };
