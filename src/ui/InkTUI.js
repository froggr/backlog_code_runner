const React = require("react");
const { useState, useEffect, useRef } = React;
const { Box, Text, useInput, useApp } = require("ink");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const BacklogRunnerTUI = ({ taskRunner }) => {
  const { exit } = useApp();
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    completed: 0,
    errors: 0,
    startTime: new Date(),
    isProcessing: false,
    currentTask: null,
  });
  const [autoStart, setAutoStart] = useState(false);
  const [openCodeOutput, setOpenCodeOutput] = useState([]);
  const logsRef = useRef([]);
  const outputRef = useRef([]);

  // Add log entry
  const addLog = (message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      timestamp,
      message,
      type,
      id: Date.now() + Math.random(),
    };
    logsRef.current = [...logsRef.current.slice(-49), logEntry];
    setLogs([...logsRef.current]);
  };

  // Add OpenCode output
  const addOpenCodeOutput = (output) => {
    outputRef.current = [...outputRef.current.slice(-99), output];
    setOpenCodeOutput([...outputRef.current]);
  };

  // Load tasks
  const loadTasks = async () => {
    try {
      const tasks = await taskRunner.getTasks();
      setTasks(tasks);
    } catch (error) {
      addLog(`Error loading tasks: ${error.message}`, "error");
    }
  };

  // Process task with OpenCode
  const processTask = async (task) => {
    if (stats.isProcessing) return;

    setStats((prev) => ({ ...prev, isProcessing: true, currentTask: task }));
    addLog(`🚀 Starting task: ${task.title}`, "info");
    addOpenCodeOutput(`--- Starting task: ${task.title} ---`);

    try {
      // Create snapshot before starting task
      addLog("📸 Creating snapshot before task...", "info");
      const snapshotRef = await createTaskSnapshot(task);
      addLog(`📸 Snapshot created: ${snapshotRef}`, "success");

      // Run OpenCode with output capture
      const prompt = `please start ${task.id} in backlog. After completing please test your work to confirm you have completed the task. Then update the task with your code and document how you've confirmed you've met the requirements of the task and the status as Review.`;

      const openCodeOutput = await runOpenCodeWithOutput(prompt);

      // Append OpenCode output to task file for auditability
      try {
        const taskFilePath = path.join(taskRunner.config.backlogPath, task.id);
        if (fs.existsSync(taskFilePath)) {
          const timestamp = new Date().toISOString();
          const outputSection = `\n\n## OpenCode Output (${timestamp})\n\n\`\`\`\n${openCodeOutput}\n\`\`\`\n\n## Snapshot Reference\n\nTo rollback this task: \`git reset --hard ${snapshotRef}\`\n`;
          fs.appendFileSync(taskFilePath, outputSection);
          addLog("📝 OpenCode output appended to task file", "info");
        }
      } catch (error) {
        addLog(
          `⚠️ Could not append output to task file: ${error.message}`,
          "warning",
        );
      }

      // Commit changes
      addLog("📦 Staging changes...", "info");
      taskRunner.exec("git add .");

      try {
        taskRunner.exec("git diff --cached --exit-code", { silent: true });
        addLog("ℹ️ No changes to commit", "warning");
      } catch {
        const commitMessage = task.isRevision
          ? `fix: address feedback for ${task.title}`
          : `feat: implement ${task.title}`;
        taskRunner.exec(`git commit -m "${commitMessage}"`);
        addLog("💾 Changes committed", "success");
      }

      addLog(`🎉 Task completed: ${task.title}`, "success");
      addOpenCodeOutput(`--- Task completed: ${task.title} ---`);
      addOpenCodeOutput(
        `📸 Rollback available: git reset --hard ${snapshotRef}`,
      );
      setStats((prev) => ({ ...prev, completed: prev.completed + 1 }));
    } catch (error) {
      addLog(`❌ Task failed: ${error.message}`, "error");
      addOpenCodeOutput(`❌ Task failed: ${error.message}`);
      setStats((prev) => ({ ...prev, errors: prev.errors + 1 }));
    } finally {
      setStats((prev) => ({ ...prev, isProcessing: false, currentTask: null }));
      await loadTasks();
    }
  };

  // Run OpenCode and capture output
  const runOpenCodeWithOutput = (prompt) => {
    return new Promise((resolve, reject) => {
      addLog("🤖 Running OpenCode...", "info");
      addOpenCodeOutput(
        `🚀 OpenCode started: ${new Date().toLocaleTimeString()}`,
      );

      const child = spawn("opencode", ["run", prompt], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "0" },
        cwd: process.cwd(),
      });

      let outputBuffer = "";
      let hasOutput = false;
      let lineBuffer = "";

      const processOutput = (data, isStderr = false) => {
        hasOutput = true;
        const output = data.toString();
        outputBuffer += output;
        lineBuffer += output;

        // Process complete lines
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() || ""; // Keep incomplete line

        lines.forEach((line) => {
          if (line.trim()) {
            const prefix = isStderr ? "⚠️ " : "";
            addOpenCodeOutput(`${prefix}${line.trim()}`);
          }
        });
      };

      child.stdout.on("data", (data) => processOutput(data, false));
      child.stderr.on("data", (data) => processOutput(data, true));

      child.on("close", (code) => {
        // Process any remaining output
        if (lineBuffer.trim()) {
          addOpenCodeOutput(lineBuffer.trim());
        }

        addOpenCodeOutput(
          `✅ OpenCode finished: ${new Date().toLocaleTimeString()} (exit code: ${code})`,
        );

        if (code === 0) {
          addLog("✅ OpenCode completed successfully", "success");
          resolve(outputBuffer);
        } else {
          addLog(`❌ OpenCode failed with exit code ${code}`, "error");
          reject(new Error(`OpenCode failed with exit code ${code}`));
        }
      });

      child.on("error", (error) => {
        addLog(`❌ OpenCode spawn error: ${error.message}`, "error");
        addOpenCodeOutput(`❌ Error: ${error.message}`);
        reject(error);
      });

      // Handle timeout
      setTimeout(() => {
        if (!hasOutput) {
          addLog("⏰ OpenCode taking longer than expected...", "warning");
          addOpenCodeOutput("⏰ No output received yet, please wait...");
        }
      }, 10000);
    });
  };

  // Handle keyboard input
  useInput((input, key) => {
    if (key.ctrl && key.name === "c") {
      exit();
      return;
    }

    switch (input.toLowerCase()) {
      case "q":
        exit();
        break;
      case "r":
        addLog("🔄 Refreshing tasks...", "info");
        loadTasks();
        break;
      case "s":
        if (tasks.length > 0 && !stats.isProcessing) {
          processTask(tasks[0]);
        } else if (stats.isProcessing) {
          addLog("⏸️ Task already in progress...", "warning");
        } else {
          addLog("📭 No tasks available", "warning");
        }
        break;
      case "a":
        setAutoStart((prev) => !prev);
        addLog(`🔄 Auto-start ${!autoStart ? "enabled" : "disabled"}`, "info");
        break;
      case "b":
        createSnapshot();
        break;
      case "u":
        rollbackLastTask();
        break;
      case "c":
        outputRef.current = [];
        setOpenCodeOutput([]);
        addLog("🧹 OpenCode output cleared", "info");
        break;
      case "l":
        logsRef.current = [];
        setLogs([]);
        addLog("🧹 Activity logs cleared", "info");
        break;
    }
  });

  // Create snapshot
  const createSnapshot = async () => {
    try {
      addLog("📸 Creating manual snapshot...", "info");
      const ref = taskRunner.exec("git rev-parse HEAD", { silent: true });
      addLog(`📸 Snapshot created: ${ref}`, "success");
      addOpenCodeOutput(`📸 Manual snapshot: ${ref}`);
    } catch (error) {
      addLog(`❌ Failed to create snapshot: ${error.message}`, "error");
    }
  };

  // Create task snapshot
  const createTaskSnapshot = async (task) => {
    try {
      // Commit current state if there are changes
      try {
        taskRunner.exec("git diff --exit-code", { silent: true });
      } catch {
        // There are unstaged changes, stash them
        taskRunner.exec("git stash push -m 'Pre-task snapshot'");
        addLog("📦 Stashed uncommitted changes", "info");
      }

      // Get current HEAD as snapshot reference
      const ref = taskRunner.exec("git rev-parse HEAD", { silent: true });
      return ref;
    } catch (error) {
      throw new Error(`Failed to create snapshot: ${error.message}`);
    }
  };

  // Rollback last task
  const rollbackLastTask = async () => {
    try {
      addLog("⏪ Rolling back last task...", "info");

      // Get the last commit message to see if it's a task commit
      const lastCommitMsg = taskRunner.exec("git log -1 --pretty=format:%s", {
        silent: true,
      });

      if (lastCommitMsg.includes("feat:") || lastCommitMsg.includes("fix:")) {
        // Reset to previous commit
        taskRunner.exec("git reset --hard HEAD~1");
        addLog("✅ Successfully rolled back last task", "success");
        addOpenCodeOutput("⏪ Last task rolled back");
      } else {
        addLog("⚠️ Last commit doesn't appear to be a task", "warning");
      }
    } catch (error) {
      addLog(`❌ Failed to rollback: ${error.message}`, "error");
    }
  };

  // Auto-start polling
  useEffect(() => {
    let interval;
    if (autoStart) {
      interval = setInterval(async () => {
        if (!stats.isProcessing && tasks.length > 0) {
          await processTask(tasks[0]);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [autoStart, stats.isProcessing, tasks]);

  // Load tasks on mount and periodic refresh
  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 10000);
    return () => clearInterval(interval);
  }, []);

  // Get status color
  const getStatusColor = () => {
    if (stats.isProcessing) return "yellow";
    if (stats.errors > 0) return "red";
    return "green";
  };

  // Get log color
  const getLogColor = (type) => {
    switch (type) {
      case "error":
        return "red";
      case "warning":
        return "yellow";
      case "success":
        return "green";
      default:
        return "cyan";
    }
  };

  const runtime = Date.now() - stats.startTime;
  const minutes = Math.floor(runtime / (1000 * 60));
  const seconds = Math.floor((runtime % (1000 * 60)) / 1000);

  return React.createElement(
    Box,
    { flexDirection: "row", height: "100%" },
    // Left Panel - Status & Controls
    React.createElement(
      Box,
      { flexDirection: "column", width: "50%", paddingX: 2, paddingY: 1 },
      // Header
      React.createElement(
        Box,
        {
          borderStyle: "double",
          borderColor: "cyan",
          paddingX: 2,
          paddingY: 1,
        },
        React.createElement(
          Text,
          { color: "cyan", bold: true },
          "🔄 BACKLOG RUNNER",
        ),
      ),
      // Status
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(
          Text,
          { color: getStatusColor() },
          "Status: ",
          stats.isProcessing
            ? `🔄 PROCESSING: ${stats.currentTask?.title || "Unknown"}`
            : "⚡ READY",
        ),
      ),
      // Task Queue
      React.createElement(
        Box,
        { marginTop: 1, flexDirection: "column" },
        React.createElement(
          Text,
          { color: "magenta", bold: true },
          `📋 Task Queue (${tasks.length}):`,
        ),
        tasks.length === 0
          ? React.createElement(
              Text,
              { color: "gray" },
              ' No tasks in "For Agent" column',
            )
          : tasks
              .slice(0, 5)
              .map((task, index) =>
                React.createElement(
                  Box,
                  { key: task.id, marginLeft: 2 },
                  React.createElement(
                    Text,
                    { color: index === 0 ? "green" : "white" },
                    index === 0 ? "▶ " : `${index + 1}. `,
                    task.title,
                    task.isRevision
                      ? React.createElement(Text, { color: "red" }, " (REV)")
                      : "",
                  ),
                ),
              ),
        tasks.length > 5 &&
          React.createElement(
            Text,
            { color: "gray", marginLeft: 2 },
            `... and ${tasks.length - 5} more`,
          ),
      ),
      // Stats
      React.createElement(
        Box,
        { marginTop: 1, flexDirection: "column" },
        React.createElement(Text, { color: "blue", bold: true }, "📊 Stats:"),
        React.createElement(Text, null, ` Runtime: ${minutes}m ${seconds}s`),
        React.createElement(
          Text,
          null,
          " Completed: ",
          React.createElement(
            Text,
            { color: "green" },
            stats.completed.toString(),
          ),
        ),
        React.createElement(
          Text,
          null,
          " Errors: ",
          React.createElement(Text, { color: "red" }, stats.errors.toString()),
        ),
      ),
      // Controls
      React.createElement(
        Box,
        { marginTop: 1, flexDirection: "column" },
        React.createElement(
          Text,
          { color: "yellow", bold: true },
          "🎮 Controls:",
        ),
        React.createElement(
          Text,
          null,
          " [R]efresh • [S]tart • [A]uto • [B]ackup • [U]ndo • [Q]uit",
        ),
        React.createElement(Text, null, " [C]lear output • [L]ogs clear"),
        React.createElement(
          Text,
          { color: autoStart ? "green" : "gray" },
          `Auto-start: ${autoStart ? "ON" : "OFF"}`,
        ),
      ),
      // Help
      React.createElement(
        Box,
        { marginTop: 1, flexDirection: "column" },
        React.createElement(Text, { color: "gray" }, "[B] = Create snapshot"),
        React.createElement(
          Text,
          { color: "gray" },
          "[U] = Rollback last task",
        ),
      ),
    ),
    // Right Panel - Logs & Output
    React.createElement(
      Box,
      { flexDirection: "column", width: "50%", paddingX: 2, paddingY: 1 },
      // OpenCode Output
      React.createElement(
        Box,
        {
          flexDirection: "column",
          height: "60%",
          borderStyle: "single",
          borderColor: "green",
          paddingX: 1,
        },
        React.createElement(
          Text,
          { color: "green", bold: true },
          "🤖 OpenCode Output:",
        ),
        React.createElement(
          Box,
          { flexDirection: "column", height: "100%", overflowY: "hidden" },
          openCodeOutput.length === 0
            ? React.createElement(
                Text,
                { color: "gray" },
                "No OpenCode output yet...",
              )
            : openCodeOutput
                .slice(-15)
                .map((line, index) =>
                  React.createElement(
                    Text,
                    { key: index, color: "white" },
                    line.length > 80 ? line.substring(0, 77) + "..." : line,
                  ),
                ),
        ),
      ),
      // Activity Logs
      React.createElement(
        Box,
        {
          flexDirection: "column",
          height: "40%",
          borderStyle: "single",
          borderColor: "blue",
          paddingX: 1,
          marginTop: 1,
        },
        React.createElement(
          Text,
          { color: "blue", bold: true },
          "📜 Activity Logs:",
        ),
        React.createElement(
          Box,
          { flexDirection: "column", height: "100%", overflowY: "hidden" },
          logs.length === 0
            ? React.createElement(Text, { color: "gray" }, "No activity yet...")
            : logs
                .slice(-8)
                .map((log) =>
                  React.createElement(
                    Text,
                    { key: log.id, color: getLogColor(log.type) },
                    `[${log.timestamp}] ${log.message}`,
                  ),
                ),
        ),
      ),
    ),
  );
};

module.exports = BacklogRunnerTUI;
