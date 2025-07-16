#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const os = require("os");

// Colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

// Load config
let config = {
  mainBranch: "main",
  todoColumn: "For Agent",
  progressColumn: "In Progress",
  reviewColumn: "Review",
  completedColumn: "Done",
  pollInterval: 5000,
  backlogPath: "./backlog/tasks",
  autoStart: false,

  timeout: 300000,
};

function loadConfig() {
  const configPath = path.join(process.cwd(), ".backlog-runner.json");
  if (fs.existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config = { ...config, ...userConfig };
    } catch (error) {
      console.log(
        `${colors.yellow}Warning: Invalid config file${colors.reset}`,
      );
    }
  }
}

class SimpleRunner {
  constructor() {
    this.logs = [];
    this.currentTask = null;
    this.isProcessing = false;
    this.autoInterval = null;
    this.stats = {
      completed: 0,
      errors: 0,
      startTime: new Date(),
    };

    loadConfig();
    this.setupInput();
  }

  setupInput() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.on("keypress", this.handleKeyPress.bind(this));
      readline.emitKeypressEvents(process.stdin);
    }

    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
  }

  handleKeyPress(str, key) {
    if (key.ctrl && key.name === "c") {
      this.shutdown();
      return;
    }

    switch (key.name) {
      case "q":
        this.shutdown();
        break;
      case "r":
        this.log("🔄 Refreshing...", "info");
        this.render();
        break;
      case "s":
        this.startNextTask();
        break;
      case "a":
        config.autoStart = !config.autoStart;
        this.log(
          `🔄 Auto-start ${config.autoStart ? "enabled" : "disabled"}`,
          "info",
        );

        if (config.autoStart) {
          this.startAutoPolling();
        } else {
          this.stopAutoPolling();
        }
        this.render();
        break;
      case "m":
        this.mergeAgentBranch();
        break;
      case "d":
        this.deleteAgentBranch();
        break;
    }
  }

  log(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const colorMap = {
      info: colors.cyan,
      success: colors.green,
      error: colors.red,
      warning: colors.yellow,
    };

    const logEntry = {
      timestamp,
      message,
      type,
      colored: `${colors.gray}[${timestamp}]${colors.reset} ${colorMap[type]}${message}${colors.reset}`,
    };

    this.logs.push(logEntry);
    if (this.logs.length > 50) {
      this.logs = this.logs.slice(-50);
    }

    // Re-render after each log to maintain TUI
    setTimeout(() => this.render(), 10);
  }

  exec(command, options = {}) {
    try {
      const result = execSync(command, {
        encoding: "utf8",
        stdio: options.silent ? "pipe" : "pipe",
        ...options,
      });
      return result ? result.trim() : "";
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }

  parseTask(content, filename) {
    const lines = content.split("\n");
    const task = {
      id: filename,
      title: "",
      description: "",
      status: "",
      labels: [],
      isRevision: false,
    };

    // Extract title
    const titleMatch =
      lines[0]?.match(/^#\s*(.+)/) || filename.match(/task-\d+\s*-\s*(.+)\.md/);
    if (titleMatch) {
      task.title = titleMatch[1].trim();
    }

    // Parse frontmatter
    let inFrontmatter = false;
    let frontmatterEnd = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === "---") {
        if (!inFrontmatter) {
          inFrontmatter = true;
        } else {
          frontmatterEnd = i;
          break;
        }
        continue;
      }

      if (inFrontmatter) {
        if (line.startsWith("status:")) {
          task.status = line.split(":")[1].trim().replace(/['"]/g, "");
        } else if (line.startsWith("labels:")) {
          const labelsStr = line.substring(7).trim();
          if (labelsStr.startsWith("[") && labelsStr.endsWith("]")) {
            task.labels = JSON.parse(labelsStr);
          } else {
            task.labels = labelsStr
              .split(",")
              .map((l) => l.trim())
              .filter((l) => l);
          }
        }
      }
    }

    // Get description
    if (frontmatterEnd > 0) {
      task.description = lines
        .slice(frontmatterEnd + 1)
        .join("\n")
        .trim();
    } else {
      task.description = lines.slice(1).join("\n").trim();
    }

    // Check if revision
    task.isRevision =
      task.labels.includes("revision-requested") ||
      task.labels.includes("needs-revision");

    return task;
  }

  async getTasks() {
    try {
      if (!fs.existsSync(config.backlogPath)) {
        return [];
      }

      const tasks = [];
      const files = fs
        .readdirSync(config.backlogPath)
        .filter((file) => file.match(/^task-\d+.*\.md$/))
        .sort();

      for (const file of files) {
        const content = fs.readFileSync(
          path.join(config.backlogPath, file),
          "utf8",
        );
        const task = this.parseTask(content, file);

        if (
          task.status === config.todoColumn ||
          (!task.status && config.todoColumn === "For Agent")
        ) {
          tasks.push(task);
        }
      }

      return tasks;
    } catch (error) {
      this.log(`Error reading tasks: ${error.message}`, "error");
      return [];
    }
  }

  async moveTaskToStatus(taskId, newStatus) {
    try {
      const taskPath = path.join(config.backlogPath, taskId);
      let content = fs.readFileSync(taskPath, "utf8");
      const lines = content.split("\n");

      let frontmatterStart = -1;
      let frontmatterEnd = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
          if (frontmatterStart === -1) {
            frontmatterStart = i;
          } else {
            frontmatterEnd = i;
            break;
          }
        }
      }

      if (frontmatterStart === -1) {
        lines.splice(0, 0, "---", `status: "${newStatus}"`, "---");
      } else {
        let statusUpdated = false;
        for (let i = frontmatterStart + 1; i < frontmatterEnd; i++) {
          if (lines[i].startsWith("status:")) {
            lines[i] = `status: "${newStatus}"`;
            statusUpdated = true;
            break;
          }
        }
        if (!statusUpdated) {
          lines.splice(frontmatterStart + 1, 0, `status: "${newStatus}"`);
        }
      }

      fs.writeFileSync(taskPath, lines.join("\n"));
      this.log(`Moved task to ${newStatus}`, "success");
    } catch (error) {
      this.log(`Error moving task: ${error.message}`, "error");
    }
  }

  generateBranchName(task) {
    // Always use 'agent' branch for all work
    return "agent";
  }

  async runOpenCode(task) {
    const prompt = `please start ${task.id} in backlog. After completing please test your work to confirm you have completed the task. Then update the task with your code and document how you've confirmed you've met the requirements of the task and the status as ${config.reviewColumn}.`;

    return new Promise((resolve, reject) => {
      // First check if OpenCode is available
      try {
        execSync("which opencode", { stdio: "pipe" });
      } catch (error) {
        this.log("❌ OpenCode not found in PATH", "error");
        reject(
          new Error("OpenCode CLI not found. Please install OpenCode first."),
        );
        return;
      }

      this.log("🤖 Running OpenCode...", "info");
      this.log(`📝 Prompt: ${prompt.substring(0, 100)}...`, "info");
      this.log("🔄 OpenCode will run in interactive mode", "info");

      // Capture output while still allowing interactive mode
      let outputLog = "";
      const startTime = new Date().toISOString();

      const child = spawn("opencode", ["run", prompt], {
        stdio: ["inherit", "pipe", "pipe"],
        timeout: config.timeout,
      });

      // Capture stdout and display it
      child.stdout.on("data", (data) => {
        const output = data.toString();
        outputLog += output;
        process.stdout.write(output); // Display in real-time
      });

      // Capture stderr and display it
      child.stderr.on("data", (data) => {
        const output = data.toString();
        outputLog += output;
        process.stderr.write(output); // Display in real-time
      });

      // Add periodic progress indicator
      const progressInterval = setInterval(() => {
        this.log("🔄 OpenCode still running...", "info");
      }, 30000);

      child.on("close", () => {
        clearInterval(progressInterval);
      });

      child.on("close", (code) => {
        this.log(`🔍 OpenCode process closed with code: ${code}`, "info");

        if (code === 0) {
          this.log("✅ OpenCode completed successfully", "success");
          this.log("📋 Appending OpenCode log to task...", "info");

          // Append OpenCode log to task
          this.appendOpenCodeLogToTask(task, outputLog, startTime);

          resolve(outputLog);
        } else {
          this.log(`❌ OpenCode failed with exit code ${code}`, "error");
          reject(new Error(`OpenCode failed with exit code ${code}`));
        }
      });

      child.on("error", (error) => {
        this.log(`❌ OpenCode spawn error: ${error.message}`, "error");
        this.log(
          `💡 Try running 'which opencode' to check if it's installed`,
          "error",
        );
        reject(error);
      });

      this.log("🚀 OpenCode process started", "info");
      this.log(`🔧 Process PID: ${child.pid}`, "info");
    });
  }

  async appendOpenCodeLogToTask(task, outputLog, startTime) {
    try {
      const taskPath = path.join(config.backlogPath, task.id);

      if (!fs.existsSync(taskPath)) {
        this.log(`⚠️ Task file not found: ${taskPath}`, "warning");
        return;
      }

      let content = fs.readFileSync(taskPath, "utf8");

      // Create the OpenCode log section
      const timestamp = new Date().toISOString();
      const duration = new Date(timestamp) - new Date(startTime);
      const durationStr = `${Math.round(duration / 1000)}s`;

      const logSection = `


## OpenCode Execution Log

**Started:** ${new Date(startTime).toLocaleString()}
**Completed:** ${new Date(timestamp).toLocaleString()}
**Duration:** ${durationStr}

\`\`\`
${outputLog.trim()}
\`\`\`

---
*Auto-generated by Backlog Runner*
`;

      // Append the log section to the task
      content += logSection;

      fs.writeFileSync(taskPath, content);
      this.log("✅ OpenCode log appended to task", "success");
    } catch (error) {
      this.log(`❌ Failed to append log to task: ${error.message}`, "error");
    }
  }

  async processTask(task) {
    if (this.isProcessing) {
      this.log("⏸️ Already processing a task", "warning");
      return;
    }

    this.isProcessing = true;
    this.currentTask = task;

    try {
      this.log(`🚀 Starting task: ${task.title}`, "info");

      // Always use 'agent' branch for all work
      const branchName = "agent";

      // SAFETY: Always stash any uncommitted changes first
      try {
        this.exec('git stash push -m "Auto-stash before branch switch"', {
          silent: true,
        });
      } catch (e) {
        // No changes to stash, that's fine
      }

      this.log(`🌿 Switching to agent branch...`, "info");
      try {
        this.exec(`git checkout ${branchName}`);

        // Check if there are changes in main that need to be merged
        this.log(
          `🔄 Checking for changes to merge from ${config.mainBranch}...`,
          "info",
        );
        try {
          const mergeBase = this.exec(
            `git merge-base ${branchName} ${config.mainBranch}`,
            { silent: true },
          );
          const mainHead = this.exec(`git rev-parse ${config.mainBranch}`, {
            silent: true,
          });

          if (mergeBase.trim() !== mainHead.trim()) {
            this.log(
              `📥 Found changes in ${config.mainBranch}, merging...`,
              "info",
            );
            this.exec(`git merge ${config.mainBranch} --no-edit`);
            this.log(
              `✅ Successfully merged changes from ${config.mainBranch}`,
              "success",
            );
          } else {
            this.log(
              `✅ Agent branch is up to date with ${config.mainBranch}`,
              "info",
            );
          }
        } catch (mergeError) {
          this.log(`⚠️ Could not auto-merge: ${mergeError.message}`, "warning");
          this.log(`💡 You may need to resolve conflicts manually`, "warning");
        }
      } catch (error) {
        // Branch doesn't exist, create it
        this.log(`📝 Creating agent branch...`, "info");
        this.exec(`git checkout ${config.mainBranch}`);
        this.exec(`git checkout -b ${branchName}`);
      }

      // Run OpenCode
      this.log("📝 About to run OpenCode...", "info");
      await this.runOpenCode(task);
      this.log("✅ OpenCode execution completed", "success");

      // Commit changes
      this.log("📦 Staging changes...", "info");
      this.exec("git add .");

      try {
        this.exec("git diff --cached --exit-code", { silent: true });
        this.log("ℹ️ No changes to commit", "warning");
      } catch {
        const commitMessage = task.isRevision
          ? `fix: address feedback for ${task.title}`
          : `feat: implement ${task.title}`;
        this.exec(`git commit -m "${commitMessage}"`);
        this.log("💾 Changes committed", "success");
      }

      // LOCAL ONLY - NO REMOTE PUSH OR PR CREATION
      this.log("✅ Changes committed locally", "success");

      // OpenCode will handle moving task to review column
      // Return to main branch SAFELY
      try {
        this.exec(`git checkout ${config.mainBranch}`);
        // Restore any stashed changes
        try {
          this.exec("git stash pop", { silent: true });
        } catch (e) {
          // No stash to pop, that's fine
        }
      } catch (error) {
        this.log("⚠️ Could not return to main branch", "warning");
      }

      this.log(`🎉 Task completed: ${task.title}`, "success");
      this.stats.completed++;
    } catch (error) {
      this.log(`❌ Task failed: ${error.message}`, "error");
      this.stats.errors++;

      // SAFE ERROR RECOVERY - return to main branch
      try {
        this.exec(`git checkout ${config.mainBranch}`);
        // Restore any stashed changes
        try {
          this.exec("git stash pop", { silent: true });
        } catch (e) {
          // No stash to pop, that's fine
        }
      } catch (e) {
        this.log("⚠️ Could not return to main branch", "warning");
      }
    } finally {
      this.isProcessing = false;
      this.currentTask = null;
    }
  }

  startAutoPolling() {
    if (this.autoInterval) {
      clearInterval(this.autoInterval);
    }

    this.autoInterval = setInterval(async () => {
      if (!this.isProcessing) {
        const tasks = await this.getTasks();
        if (tasks.length > 0) {
          await this.processTask(tasks[0]);
        }
      }
    }, config.pollInterval);
  }

  stopAutoPolling() {
    if (this.autoInterval) {
      clearInterval(this.autoInterval);
      this.autoInterval = null;
    }
  }

  mergeAgentBranch() {
    try {
      this.log(`🔄 Merging agent branch into ${config.mainBranch}...`, "info");

      // Check if agent branch exists
      try {
        this.exec(`git show-ref --verify --quiet refs/heads/agent`, {
          silent: true,
        });
      } catch (error) {
        this.log(`❌ Agent branch does not exist`, "error");
        return;
      }

      // Switch to main branch
      this.exec(`git checkout ${config.mainBranch}`);

      // Merge agent branch
      this.exec(`git merge agent --no-edit`);

      this.log(
        `✅ Successfully merged agent branch into ${config.mainBranch}`,
        "success",
      );
      this.log(`💡 Agent branch is still available for future work`, "info");
    } catch (error) {
      this.log(`❌ Failed to merge agent branch: ${error.message}`, "error");
      this.log(`💡 You may need to resolve conflicts manually`, "warning");
    }
  }

  deleteAgentBranch() {
    try {
      this.log(`🗑️ Deleting agent branch...`, "info");

      // Check if agent branch exists
      try {
        this.exec(`git show-ref --verify --quiet refs/heads/agent`, {
          silent: true,
        });
      } catch (error) {
        this.log(`❌ Agent branch does not exist`, "error");
        return;
      }

      // Make sure we're not on the agent branch
      const currentBranch = this.exec(`git branch --show-current`, {
        silent: true,
      });
      if (currentBranch.trim() === "agent") {
        this.log(`🔄 Switching to ${config.mainBranch} first...`, "info");
        this.exec(`git checkout ${config.mainBranch}`);
      }

      // Delete the agent branch
      this.exec(`git branch -D agent`);

      this.log(`✅ Successfully deleted agent branch`, "success");
      this.log(`💡 Future tasks will create a new agent branch`, "info");
    } catch (error) {
      this.log(`❌ Failed to delete agent branch: ${error.message}`, "error");
    }
  }

  async startNextTask() {
    if (this.isProcessing) {
      this.log("⏸️ Already processing a task", "warning");
      return;
    }

    const tasks = await this.getTasks();
    if (tasks.length === 0) {
      this.log("📭 No tasks available", "warning");
      return;
    }

    await this.processTask(tasks[0]);
  }

  async render() {
    console.clear();

    const width = process.stdout.columns || 80;

    // Header
    console.log(
      `${colors.bright}${colors.cyan}${"=".repeat(width)}${colors.reset}`,
    );
    console.log(`${colors.bright}${colors.cyan}BACKLOG RUNNER${colors.reset}`);
    console.log(
      `${colors.bright}${colors.cyan}${"=".repeat(width)}${colors.reset}`,
    );
    console.log();

    // Status
    const status = this.isProcessing
      ? `${colors.yellow}🔄 PROCESSING: ${this.currentTask?.title || "Unknown"}${colors.reset}`
      : `${colors.green}⚡ READY${colors.reset}`;

    console.log(`Status: ${status}`);
    console.log();

    // Tasks
    const tasks = await this.getTasks();
    console.log(
      `${colors.bright}📋 Task Queue (${tasks.length}):${colors.reset}`,
    );

    if (tasks.length === 0) {
      console.log(
        `${colors.gray}  No tasks in "${config.todoColumn}" column${colors.reset}`,
      );
    } else {
      tasks.slice(0, 5).forEach((task, i) => {
        const prefix =
          i === 0
            ? `${colors.green}▶${colors.reset}`
            : `${colors.gray}${i + 1}.${colors.reset}`;
        const revision = task.isRevision
          ? ` ${colors.red}(REV)${colors.reset}`
          : "";
        console.log(`  ${prefix} ${task.title}${revision}`);
      });

      if (tasks.length > 5) {
        console.log(
          `${colors.gray}  ... and ${tasks.length - 5} more${colors.reset}`,
        );
      }
    }
    console.log();

    // Stats
    const runtime = new Date() - this.stats.startTime;
    const minutes = Math.floor(runtime / (1000 * 60));

    console.log(`${colors.bright}📊 Stats:${colors.reset}`);
    console.log(
      `  Runtime: ${minutes}m • Completed: ${colors.green}${this.stats.completed}${colors.reset} • Errors: ${colors.red}${this.stats.errors}${colors.reset}`,
    );
    console.log();

    // Recent logs
    console.log(`${colors.bright}📜 Recent Activity:${colors.reset}`);
    const recentLogs = this.logs.slice(-3);
    if (recentLogs.length === 0) {
      console.log(`${colors.gray}  No recent activity${colors.reset}`);
    } else {
      recentLogs.forEach((log) => console.log(`  ${log.colored}`));
    }
    console.log();

    // Controls
    const autoStatus = config.autoStart
      ? `${colors.green}[AUTO ON]${colors.reset}`
      : `${colors.gray}[AUTO OFF]${colors.reset}`;

    console.log(`${colors.bright}🎮 Controls:${colors.reset}`);
    console.log(
      `  [R]efresh • [S]tart • [A]uto • [M]erge • [D]elete • [Q]uit • ${autoStatus}`,
    );
    console.log(
      `${colors.gray}  [M] = Merge agent branch to main • [D] = Delete agent branch${colors.reset}`,
    );
    console.log();

    // Footer
    const cwd = process.cwd().replace(os.homedir(), "~");
    console.log(`${colors.gray}📁 ${cwd}${colors.reset}`);
  }

  async start() {
    // Check environment
    try {
      this.exec("git rev-parse --git-dir", { silent: true });
    } catch (error) {
      console.error("❌ Not in a git repository");
      process.exit(1);
    }

    if (!fs.existsSync(config.backlogPath)) {
      console.error(`❌ Backlog path not found: ${config.backlogPath}`);
      process.exit(1);
    }

    this.log("🚀 Backlog Runner started", "success");
    this.log("Press [H] for help, [Q] to quit", "info");

    // Initial render
    this.render();

    // Auto-process if enabled
    if (config.autoStart) {
      this.startAutoPolling();
    }
  }

  shutdown() {
    this.log("👋 Shutting down...", "info");
    this.stopAutoPolling();
    if (this.rl) {
      this.rl.close();
    }
    process.exit(0);
  }
}

// CLI entry point
if (require.main === module) {
  const runner = new SimpleRunner();
  runner.start();
}

module.exports = SimpleRunner;
