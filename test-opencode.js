#!/usr/bin/env node

const { spawn } = require("child_process");

console.log("Testing OpenCode command...");

const prompt =
  "please start task-1 - create-hello.txt.md in backlog. After completing please test your work to confirm you have completed the task. Then update the task with your code and document how you've confirmed you've met the requirements of the task and the status as Review.";

console.log(`Running: opencode run "${prompt.substring(0, 80)}..."`);

const child = spawn("opencode", ["run", prompt], {
  stdio: "pipe",
});

let output = "";

child.stdout.on("data", (data) => {
  output += data.toString();
  console.log(`OpenCode: ${data.toString()}`);
});

child.stderr.on("data", (data) => {
  console.log(`OpenCode Error: ${data.toString()}`);
});

// Add timeout warning
const timeoutId = setTimeout(() => {
  console.log("⏰ OpenCode taking longer than expected...");
  console.log(`📊 Process PID: ${child.pid}`);
  console.log(`📈 Output so far: ${output.length} characters`);
}, 30000);

child.on("close", (code) => {
  clearTimeout(timeoutId);
  console.log(`\nOpenCode process exited with code: ${code}`);

  if (code === 0) {
    console.log("✅ OpenCode completed successfully");

    // Check if file was created
    const fs = require("fs");
    if (fs.existsSync("hello.txt")) {
      const content = fs.readFileSync("hello.txt", "utf8");
      console.log(`📄 File created with content: "${content}"`);
    } else {
      console.log("❌ File was not created");
    }

    // Check if task was updated
    const taskPath = "backlog/tasks/task-1 - create-hello.txt.md";
    if (fs.existsSync(taskPath)) {
      const taskContent = fs.readFileSync(taskPath, "utf8");
      console.log(`📋 Task file updated`);
      if (taskContent.includes("Review")) {
        console.log("✅ Task status updated to Review");
      }
    }
  } else {
    console.log("❌ OpenCode failed");
  }
});

child.on("error", (error) => {
  clearTimeout(timeoutId);
  console.log(`❌ Error spawning OpenCode: ${error.message}`);
});

console.log(`🚀 OpenCode process started with PID: ${child.pid}`);
