#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');

// Test different stdio configurations for OpenCode
async function testOpenCodeStdio() {
  console.log('🧪 Testing OpenCode stdio configurations\n');

  const prompt = "Create a simple hello.txt file with 'Hello, World!' content.";

  // Test 1: Full inherit (like simple runner)
  console.log('Test 1: stdio: "inherit"');
  await testConfig('inherit', prompt);

  // Test 2: Inherit stdin, pipe stdout/stderr (like simple runner working version)
  console.log('\nTest 2: stdio: ["inherit", "pipe", "pipe"]');
  await testConfig(['inherit', 'pipe', 'pipe'], prompt);

  // Test 3: Pipe all (current TUI version)
  console.log('\nTest 3: stdio: ["pipe", "pipe", "pipe"]');
  await testConfig(['pipe', 'pipe', 'pipe'], prompt);

  // Test 4: Ignore stdin, pipe stdout/stderr
  console.log('\nTest 4: stdio: ["ignore", "pipe", "pipe"]');
  await testConfig(['ignore', 'pipe', 'pipe'], prompt);

  // Test 5: Using a pseudo TTY
  console.log('\nTest 5: Detached process');
  await testDetached(prompt);
}

function testConfig(stdio, prompt) {
  return new Promise((resolve) => {
    console.log(`  Spawning OpenCode with stdio: ${JSON.stringify(stdio)}`);

    const child = spawn('opencode', ['run', prompt], {
      stdio: stdio,
      timeout: 10000,
    });

    let hasOutput = false;
    let outputData = '';

    if (stdio !== 'inherit' && child.stdout) {
      child.stdout.on('data', (data) => {
        hasOutput = true;
        outputData += data.toString();
        console.log(`  📤 stdout: ${data.toString().substring(0, 100)}...`);
      });
    }

    if (stdio !== 'inherit' && child.stderr) {
      child.stderr.on('data', (data) => {
        hasOutput = true;
        outputData += data.toString();
        console.log(`  📤 stderr: ${data.toString().substring(0, 100)}...`);
      });
    }

    const timeout = setTimeout(() => {
      console.log('  ⏰ Timeout reached, killing process');
      child.kill('SIGTERM');
    }, 10000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      console.log(`  ✅ Process closed with code: ${code}`);
      console.log(`  📊 Had output: ${hasOutput}`);
      console.log(`  📝 Output length: ${outputData.length}`);
      resolve();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      console.log(`  ❌ Process error: ${error.message}`);
      resolve();
    });
  });
}

function testDetached(prompt) {
  return new Promise((resolve) => {
    console.log('  Spawning detached OpenCode process');

    const child = spawn('opencode', ['run', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      timeout: 10000,
    });

    let hasOutput = false;
    let outputData = '';

    child.stdout.on('data', (data) => {
      hasOutput = true;
      outputData += data.toString();
      console.log(`  📤 stdout: ${data.toString().substring(0, 100)}...`);
    });

    child.stderr.on('data', (data) => {
      hasOutput = true;
      outputData += data.toString();
      console.log(`  📤 stderr: ${data.toString().substring(0, 100)}...`);
    });

    const timeout = setTimeout(() => {
      console.log('  ⏰ Timeout reached, killing process');
      process.kill(-child.pid, 'SIGTERM');
    }, 10000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      console.log(`  ✅ Process closed with code: ${code}`);
      console.log(`  📊 Had output: ${hasOutput}`);
      console.log(`  📝 Output length: ${outputData.length}`);
      resolve();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      console.log(`  ❌ Process error: ${error.message}`);
      resolve();
    });
  });
}

// Check if OpenCode is available
function checkOpenCode() {
  return new Promise((resolve) => {
    const child = spawn('which', ['opencode'], { stdio: 'pipe' });
    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ OpenCode is available');
        resolve(true);
      } else {
        console.log('❌ OpenCode is not available');
        resolve(false);
      }
    });
  });
}

// Main execution
async function main() {
  console.log('🔍 OpenCode stdio configuration test\n');

  const hasOpenCode = await checkOpenCode();
  if (!hasOpenCode) {
    console.log('Please install OpenCode first: npm install -g @opencodedev/cli');
    process.exit(1);
  }

  // Check if we're in a TTY
  console.log(`📺 Running in TTY: ${process.stdout.isTTY}`);
  console.log(`📺 stdin TTY: ${process.stdin.isTTY}`);
  console.log(`📺 stdout TTY: ${process.stdout.isTTY}`);
  console.log(`📺 stderr TTY: ${process.stderr.isTTY}\n`);

  await testOpenCodeStdio();

  console.log('\n🎉 Testing complete!');
  console.log('\n💡 Analysis:');
  console.log('- If Test 1 or 2 show output but Test 3 doesn\'t, OpenCode needs interactive stdin');
  console.log('- If Test 4 works, we can use "ignore" for stdin in TUI');
  console.log('- If Test 5 works, we can use detached processes');
}

if (require.main === module) {
  main().catch(console.error);
}
