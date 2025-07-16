#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('Testing OpenCode command...');

const prompt = 'create a file called hello.txt with content "world"';

console.log(`Running: opencode run "${prompt}"`);

const child = spawn('opencode', ['run', prompt], {
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log(`\nOpenCode process exited with code: ${code}`);

  if (code === 0) {
    console.log('✅ OpenCode completed successfully');

    // Check if file was created
    const fs = require('fs');
    if (fs.existsSync('hello.txt')) {
      const content = fs.readFileSync('hello.txt', 'utf8');
      console.log(`📄 File created with content: "${content}"`);
    } else {
      console.log('❌ File was not created');
    }
  } else {
    console.log('❌ OpenCode failed');
  }
});

child.on('error', (error) => {
  console.log(`❌ Error spawning OpenCode: ${error.message}`);
});
