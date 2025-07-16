const React = require("react");
const { useState, useEffect, useRef } = React;
const { render, Box, Text, useInput, useApp } = require("ink");
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
  const [currentView, setCurrentView] = useState("main");
  const logsRef = useRef([]);
  const outputRef = useRef([]);

  // Add log entry
  const addLog = (message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      timestamp,
      message,
      type,
      id: Date.now(),
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

    try {
      // Setup worktree
      const worktreePath = await taskRunner.setupAgentWorktree();
      const originalCwd = process.cwd();

      try {
        process.chdir(worktreePath);
        addLog(`📁 Working in agent worktree: ${worktreePath}`, "info");

        // Run OpenCode with output capture
        const prompt = `please start ${task.id} in backlog. After completing please test your work to confirm you have completed the task. Then update the task with your code and document how you've confirmed you've met the requirements of the task and the status as Review.`;

        await runOpenCodeWithOutput(prompt);

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
          addLog("💾 Changes committed in agent worktree", "success");
        }
      } finally {
        process.chdir(originalCwd);
      }

      addLog(`🎉 Task completed: ${task.title}`, "success");
      setStats((prev) => ({ ...prev, completed: prev.completed + 1 }));
    } catch (error) {
      addLog(`❌ Task failed: ${error.message}`, "error");
      setStats((prev) => ({ ...prev, errors: prev.errors + 1 }));
    } finally {
      setStats((prev) => ({ ...prev, isProcessing: false, currentTask: null }));
      loadTasks();
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
        stdio: ["inherit", "pipe", "pipe"],
      });

      let outputBuffer = "";

      child.stdout.on("data", (data) => {
        const output = data.toString();
        outputBuffer += output;

        // Split into lines and add to output
        const lines = output.split("\n");
        lines.forEach((line) => {
          if (line.trim()) {
            addOpenCodeOutput(line.trim());
          }
        });

        // Also write to stdout for interactive display
        process.stdout.write(output);
      });

      child.stderr.on("data", (data) => {
        const output = data.toString();
        outputBuffer += output;

        // Add stderr to output with different formatting
        const lines = output.split("\n");
        lines.forEach((line) => {
          if (line.trim()) {
            addOpenCodeOutput(`⚠️ ${line.trim()}`);
          }
        });

        process.stderr.write(output);
      });

      child.on("close", (code) => {
        addOpenCodeOutput(
          `✅ OpenCode finished: ${new Date().toLocaleTimeString()}`,
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
        reject(error);
      });
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
      case "m":
        mergeAgentBranch();
        break;
      case "d":
        deleteAgentBranch();
        break;
      case "c":
        setOpenCodeOutput([]);
        break;
      case "l":
        setLogs([]);
        break;
    }
  });

  // Auto-start polling
  useEffect(() => {
    let interval;
    if (autoStart) {
      interval = setInterval(() => {
        if (!stats.isProcessing && tasks.length > 0) {
          processTask(tasks[0]);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [autoStart, stats.isProcessing, tasks]);

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 10000);
    return () => clearInterval(interval);
  }, []);

  // Merge agent branch
  const mergeAgentBranch = async () => {
    try {
      addLog("🔄 Merging agent branch into main...", "info");
      taskRunner.exec("git checkout main");
      taskRunner.exec("git merge agent --no-edit");
      addLog("✅ Successfully merged agent branch into main", "success");
    } catch (error) {
      addLog(`❌ Failed to merge agent branch: ${error.message}`, "error");
    }
  };

  // Delete agent branch
  const deleteAgentBranch = async () => {
    try {
      addLog("🗑️ Deleting agent branch and worktree...", "info");
      const worktreePath = path.join(process.cwd(), ".agent-worktree");

      if (fs.existsSync(worktreePath)) {
        taskRunner.exec(`git worktree remove ${worktreePath} --force`);
      }

      const currentBranch = taskRunner.exec("git branch --show-current", {
        silent: true,
      });
      if (currentBranch.trim() === "agent") {
        taskRunner.exec("git checkout main");
      }

      taskRunner.exec("git branch -D agent");
      addLog("✅ Successfully deleted agent branch and worktree", "success");
    } catch (error) {
      addLog(`❌ Failed to delete agent branch: ${error.message}`, "error");
    }
  };

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

  return (
    <Box flexDirection="row" height="100%" width="100%">
      {/* Left Panel - Status & Controls */}
      <Box flexDirection="column" width="50%" paddingX={2} paddingY={1}>
        {/* Header */}
        <Box borderStyle="double" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text color="cyan" bold>
            🔄 BACKLOG RUNNER
          </Text>
        </Box>

        {/* Status */}
        <Box marginTop={1}>
          <Text color={getStatusColor()}>
            Status:{" "}
            {stats.isProcessing
              ? `🔄 PROCESSING: ${stats.currentTask?.title || "Unknown"}`
              : "⚡ READY"}
          </Text>
        </Box>

        {/* Task Queue */}
        <Box marginTop={1} flexDirection="column">
          <Text color="magenta" bold>
            📋 Task Queue ({tasks.length}):
          </Text>
          {tasks.length === 0 ? (
            <Text color="gray"> No tasks in "For Agent" column</Text>
          ) : (
            tasks.slice(0, 5).map((task, index) => (
              <Box key={task.id} marginLeft={2}>
                <Text color={index === 0 ? "green" : "white"}>
                  {index === 0 ? "▶ " : `${index + 1}. `}
                  {task.title}
                  {task.isRevision ? <Text color="red"> (REV)</Text> : ""}
                </Text>
              </Box>
            ))
          )}
          {tasks.length > 5 && (
            <Text color="gray" marginLeft={2}>
              ... and {tasks.length - 5} more
            </Text>
          )}
        </Box>

        {/* Stats */}
        <Box marginTop={1} flexDirection="column">
          <Text color="blue" bold>
            📊 Stats:
          </Text>
          <Text> Runtime: {minutes}m</Text>
          <Text>
            {" "}
            Completed: <Text color="green">{stats.completed}</Text>
          </Text>
          <Text>
            {" "}
            Errors: <Text color="red">{stats.errors}</Text>
          </Text>
        </Box>

        {/* Controls */}
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" bold>
            🎮 Controls:
          </Text>
          <Text>
            {" "}
            [R]efresh • [S]tart • [A]uto • [M]erge • [D]elete • [Q]uit
          </Text>
          <Text> [C]lear output • [L]ogs clear</Text>
          <Text color={autoStart ? "green" : "gray"}>
            Auto-start: {autoStart ? "ON" : "OFF"}
          </Text>
        </Box>

        {/* Help */}
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">[M] = Merge agent to main</Text>
          <Text color="gray">[D] = Delete agent worktree</Text>
        </Box>
      </Box>

      {/* Right Panel - Logs & Output */}
      <Box flexDirection="column" width="50%" paddingX={2} paddingY={1}>
        {/* OpenCode Output */}
        <Box
          flexDirection="column"
          height="60%"
          borderStyle="single"
          borderColor="green"
          paddingX={1}
        >
          <Text color="green" bold>
            🤖 OpenCode Output:
          </Text>
          <Box flexDirection="column" height="100%" overflow="hidden">
            {openCodeOutput.length === 0 ? (
              <Text color="gray">No OpenCode output yet...</Text>
            ) : (
              openCodeOutput.slice(-15).map((line, index) => (
                <Text key={index} color="white">
                  {line}
                </Text>
              ))
            )}
          </Box>
        </Box>

        {/* Activity Logs */}
        <Box
          flexDirection="column"
          height="40%"
          borderStyle="single"
          borderColor="blue"
          paddingX={1}
          marginTop={1}
        >
          <Text color="blue" bold>
            📜 Activity Logs:
          </Text>
          <Box flexDirection="column" height="100%" overflow="hidden">
            {logs.length === 0 ? (
              <Text color="gray">No activity yet...</Text>
            ) : (
              logs.slice(-8).map((log, index) => (
                <Text key={log.id} color={getLogColor(log.type)}>
                  [{log.timestamp}] {log.message}
                </Text>
              ))
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

module.exports = BacklogRunnerTUI;
