#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const TaskRunner = require("./src/runners/TaskRunner.js");

// ANSI color codes
const colors = {
  reset: "\033[0m",
  red: "\033[31m",
  green: "\033[32m",
  yellow: "\033[33m",
  blue: "\033[34m",
  cyan: "\033[36m",
  bold: "\033[1m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, passed, details = "") {
  const status = passed ? "✅ PASS" : "❌ FAIL";
  const statusColor = passed ? "green" : "red";
  log(`${status} ${name}`, statusColor);
  if (details) {
    log(`     ${details}`, "cyan");
  }
}

async function runTests() {
  log("🧪 Running Backlog Code Runner Tests\n", "bold");

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
  };

  async function test(name, testFn) {
    results.total++;
    try {
      const result = await testFn();
      if (result === true || result === undefined) {
        results.passed++;
        logTest(name, true);
      } else {
        results.failed++;
        logTest(name, false, result);
      }
    } catch (error) {
      results.failed++;
      logTest(name, false, error.message);
    }
  }

  // Test 1: TaskRunner instantiation
  test("TaskRunner instantiation", () => {
    const runner = new TaskRunner();
    return runner && typeof runner.config === "object";
  });

  // Test 2: Default configuration
  test("Default configuration loaded", () => {
    const runner = new TaskRunner();
    const expectedKeys = [
      "mainBranch",
      "todoColumn",
      "progressColumn",
      "reviewColumn",
      "completedColumn",
      "backlogPath",
    ];
    return expectedKeys.every((key) => runner.config.hasOwnProperty(key));
  });

  // Test 3: Task parsing
  test("Task parsing functionality", () => {
    const runner = new TaskRunner();
    const sampleTask = `---
status: "For Agent"
labels: ["backend", "api"]
---

# task-42 - Add user authentication

## Description
Implement OAuth2 authentication for the user login system.

## Acceptance Criteria
- [ ] OAuth2 flow implemented
- [ ] User sessions managed
- [ ] Security tests pass`;

    const parsed = runner.parseTask(
      sampleTask,
      "task-42 - Add user authentication.md",
    );

    return (
      parsed.id === "task-42 - Add user authentication.md" &&
      parsed.title === "task-42 - Add user authentication" &&
      parsed.status === "For Agent" &&
      Array.isArray(parsed.labels) &&
      parsed.labels.includes("backend")
    );
  });

  // Test 4: Environment check
  await test("Environment check runs", async () => {
    const runner = new TaskRunner();
    const errors = await runner.checkEnvironment();
    return Array.isArray(errors);
  });

  // Test 5: Git repository check
  test("Git repository detection", () => {
    const runner = new TaskRunner();
    try {
      runner.exec("git rev-parse --git-dir", { silent: true });
      return true;
    } catch (error) {
      return "Not in a git repository";
    }
  });

  // Test 6: OpenCode availability
  test("OpenCode CLI availability", () => {
    const runner = new TaskRunner();
    try {
      runner.exec("which opencode", { silent: true });
      return true;
    } catch (error) {
      try {
        runner.exec("where opencode", { silent: true });
        return true;
      } catch (error2) {
        return "OpenCode CLI not found";
      }
    }
  });

  // Test 7: Task file format validation
  test("Task file format validation", () => {
    const runner = new TaskRunner();

    // Test with minimal task
    const minimalTask = `# task-1 - Simple task
This is a simple task description.`;

    const parsed = runner.parseTask(minimalTask, "task-1 - Simple task.md");
    return (
      parsed.title === "task-1 - Simple task" &&
      parsed.description.includes("This is a simple task description")
    );
  });

  // Test 8: Revision detection
  test("Revision detection", () => {
    const runner = new TaskRunner();
    const revisionTask = `---
status: "For Agent"
labels: ["revision-requested"]
---

# task-3 - Fix bug

This needs revision.`;

    const parsed = runner.parseTask(revisionTask, "task-3 - Fix bug.md");
    return parsed.isRevision === true;
  });

  // Test 9: Configuration file loading
  test("Configuration file loading", () => {
    const configPath = ".backlog-runner.json";
    const testConfig = {
      todoColumn: "Custom Column",
      mainBranch: "develop",
    };

    // Create temporary config file
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

    try {
      const runner = new TaskRunner();
      const result =
        runner.config.todoColumn === "Custom Column" &&
        runner.config.mainBranch === "develop";

      // Clean up
      fs.unlinkSync(configPath);
      return result;
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
      throw error;
    }
  });

  // Test 10: Backlog path validation
  test("Backlog path validation", () => {
    const runner = new TaskRunner();
    const backlogPath = runner.config.backlogPath;

    if (fs.existsSync(backlogPath)) {
      return true;
    } else {
      return `Backlog directory not found: ${backlogPath}`;
    }
  });

  // Test 11: Task loading
  await test("Task loading from backlog", async () => {
    const runner = new TaskRunner();
    try {
      const tasks = await runner.getTasks();
      return Array.isArray(tasks);
    } catch (error) {
      return `Error loading tasks: ${error.message}`;
    }
  });

  // Test 12: Module imports
  test("Module imports work", () => {
    try {
      const InkTUI = require("./src/ui/InkTUI.js");
      return typeof InkTUI === "function";
    } catch (error) {
      return `Module import failed: ${error.message}`;
    }
  });

  // Test 13: React and Ink dependencies
  test("React and Ink dependencies", () => {
    try {
      const React = require("react");
      const { Box, Text } = require("ink");
      return React && typeof Box === "function" && typeof Text === "function";
    } catch (error) {
      return `React/Ink dependencies missing: ${error.message}`;
    }
  });

  // Test 14: Package.json validation
  test("Package.json validation", () => {
    const packageJson = require("./package.json");
    return (
      packageJson.name === "backlog-opencode-runner" &&
      packageJson.bin &&
      packageJson.bin["backlog-runner"] &&
      packageJson.dependencies &&
      packageJson.dependencies.ink &&
      packageJson.dependencies.react &&
      packageJson.main === "src/ink-runner.js"
    );
  });

  // Test 15: File permissions
  test("File permissions", () => {
    const files = [
      "./src/ink-runner.js",
      "./src/simple-runner.js",
      "./install.sh",
    ];

    for (const file of files) {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        if (!(stats.mode & parseInt("100", 8))) {
          return `${file} is not executable`;
        }
      }
    }
    return true;
  });

  // Print summary
  log("\n" + "=".repeat(50), "cyan");
  log(`📊 Test Results Summary:`, "bold");
  log(`   Total:  ${results.total}`, "cyan");
  log(`   Passed: ${results.passed}`, "green");
  log(`   Failed: ${results.failed}`, "red");

  const percentage = Math.round((results.passed / results.total) * 100);
  log(`   Success Rate: ${percentage}%`, percentage >= 80 ? "green" : "red");

  if (results.failed === 0) {
    log("\n🎉 All tests passed!", "green");
    process.exit(0);
  } else {
    log("\n⚠️  Some tests failed. Please check the issues above.", "yellow");
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch((error) => {
    log(`\n❌ Test runner failed: ${error.message}`, "red");
    process.exit(1);
  });
}

module.exports = { runTests };
