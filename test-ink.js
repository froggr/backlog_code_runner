#!/usr/bin/env node

const React = require("react");
const { render, Box, Text } = require("ink");

// Simple test component
const TestApp = () => {
  return React.createElement(
    Box,
    { flexDirection: "column", padding: 1 },
    React.createElement(
      Text,
      { color: "green", bold: true },
      "🎉 Ink TUI Test - SUCCESS!"
    ),
    React.createElement(
      Text,
      { color: "cyan" },
      "If you can see this, the Ink TUI is working correctly."
    ),
    React.createElement(
      Text,
      { color: "yellow" },
      "Press Ctrl+C to exit."
    )
  );
};

// Only run if in a TTY
if (process.stdout.isTTY) {
  console.log("Starting Ink TUI test...");

  const { unmount } = render(React.createElement(TestApp));

  // Auto-exit after 3 seconds for testing
  setTimeout(() => {
    unmount();
    console.log("Test completed successfully!");
    process.exit(0);
  }, 3000);

  // Handle manual exit
  process.on('SIGINT', () => {
    unmount();
    console.log("\nTest interrupted.");
    process.exit(0);
  });
} else {
  console.log("❌ Not running in a TTY - Ink TUI requires an interactive terminal");
  process.exit(1);
}
