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
  pollInterval: 30000,
  backlogPath: "./backlog/tasks",
  autoStart: false,
  branchPrefix: "task",
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
        this.render();
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
    // Simple: just task-{number}
    const taskNum =
      task.id.match(/task-(\d+)/)?.[1] || task.id.replace(/[^0-9]/g, "");
    return `${config.branchPrefix}-${taskNum}`;
  }

  async runOpenCode(task) {
    const prompt = `
Task: ${task.title}
ID: ${task.id}
Description: ${task.description}

${
  task.isRevision
    ? "🔄 REVISION REQUEST - Please address the feedback and improve the implementation."
    : "✨ NEW IMPLEMENTATION - Please implement this task with clean, maintainable code."
}

Focus on quality and completeness. Make atomic commits with descriptive messages.
`;

    return new Promise((resolve, reject) => {
      // Write prompt to temp file
      const tempFile = path.join(process.cwd(), ".opencode-prompt.tmp");
      fs.writeFileSync(tempFile, prompt);

      this.log("🤖 Running OpenCode...", "info");

      const child = spawn("opencode", ["run", "--prompt-file", tempFile], {
        stdio: "pipe",
        timeout: config.timeout,
      });

      let output = "";

      child.stdout.on("data", (data) => {
        output += data.toString();
        // Log progress without spamming
        const lines = data
          .toString()
          .split("\n")
          .filter((line) => line.trim());
        if (lines.length > 0) {
          this.log(
            `OpenCode: ${lines[lines.length - 1].substring(0, 80)}...`,
            "info",
          );
        }
      });

      child.stderr.on("data", (data) => {
        this.log(`OpenCode Error: ${data.toString().trim()}`, "warning");
      });

      child.on("close", (code) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}

        if (code === 0) {
          this.log("✅ OpenCode completed successfully", "success");
          resolve(output);
        } else {
          this.log(`❌ OpenCode failed with exit code ${code}`, "error");
          reject(new Error(`OpenCode failed with exit code ${code}`));
        }
      });

      child.on("error", (error) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}

        this.log(`❌ OpenCode error: ${error.message}`, "error");
        reject(error);
      });
    });
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

      // Move to progress column
      await this.moveTaskToStatus(task.id, config.progressColumn);

      // Create/switch to branch (LOCAL ONLY - NO REMOTE)
      const branchName = this.generateBranchName(task);

      // SAFETY: Always stash any uncommitted changes first
      try {
        this.exec('git stash push -m "Auto-stash before branch switch"', {
          silent: true,
        });
      } catch (e) {
        // No changes to stash, that's fine
      }

      if (task.isRevision && task.branch) {
        this.log(`🔄 Switching to existing branch: ${task.branch}`, "info");
        this.exec(`git checkout ${task.branch}`);
      } else {
        this.log(`🌿 Creating/switching to branch: ${branchName}`, "info");
        this.exec(`git checkout ${config.mainBranch}`);
        // NO PULL - LOCAL ONLY

        try {
          this.exec(`git checkout -b ${branchName}`);
        } catch (error) {
          // Branch might exist, try to switch
          this.exec(`git checkout ${branchName}`);
        }
      }

      // Run OpenCode
      await this.runOpenCode(task);

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

      // Move to review column
      await this.moveTaskToStatus(task.id, config.reviewColumn);

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
    console.log(`  [R]efresh • [S]tart • [A]uto • [Q]uit • ${autoStatus}`);
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
      setInterval(async () => {
        if (!this.isProcessing) {
          const tasks = await this.getTasks();
          if (tasks.length > 0) {
            await this.processTask(tasks[0]);
          }
        }
      }, config.pollInterval);
    }
  }

  shutdown() {
    this.log("👋 Shutting down...", "info");
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
