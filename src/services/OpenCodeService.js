const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class OpenCodeService {
  constructor(logger) {
    this.logger = logger;
  }

  checkAvailability() {
    try {
      const { execSync } = require('child_process');
      execSync('which opencode', { stdio: 'pipe' });
      return true;
    } catch (error) {
      return false;
    }
  }

  async runOpenCode(task) {
    if (!this.checkAvailability()) {
      throw new Error('OpenCode CLI not found. Please install it first.');
    }

    const prompt = config.getOpenCodeTemplate(task, task.isRevision);
    const timeout = config.get('timeout');

    this.logger.info('🤖 Running OpenCode...');

    return new Promise((resolve, reject) => {
      // Create a temporary file for the prompt to avoid command line length issues
      const tempFile = path.join(process.cwd(), '.opencode-prompt.tmp');
      fs.writeFileSync(tempFile, prompt);

      // Use spawn instead of execSync to maintain TUI control
      const child = spawn('opencode', ['run', '--prompt-file', tempFile], {
        stdio: 'pipe', // Capture output instead of inheriting
        timeout: timeout,
      });

      let stdout = '';
      let stderr = '';

      // Capture output but log it through our logger to maintain TUI
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        // Log chunks as they come in
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          if (line.trim()) {
            this.logger.debug(`OpenCode: ${line.trim()}`);
          }
        });
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log error chunks
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          if (line.trim()) {
            this.logger.warning(`OpenCode: ${line.trim()}`);
          }
        });
      });

      child.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }

        if (code === 0) {
          this.logger.success('✅ OpenCode completed successfully');
          resolve(stdout);
        } else {
          this.logger.error(`❌ OpenCode failed with exit code ${code}`);
          reject(new Error(`OpenCode failed with exit code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }

        if (error.code === 'ETIMEDOUT') {
          this.logger.error(`⏰ OpenCode timed out after ${timeout / 1000} seconds`);
          reject(new Error(`OpenCode timed out after ${timeout / 1000} seconds`));
        } else {
          this.logger.error(`❌ OpenCode error: ${error.message}`);
          reject(error);
        }
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        this.logger.error(`⏰ OpenCode timed out after ${timeout / 1000} seconds`);
        reject(new Error(`OpenCode timed out after ${timeout / 1000} seconds`));
      }, timeout);

      child.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  async processTask(task) {
    this.logger.info(`🚀 Processing task with OpenCode: ${task.title}`);

    try {
      const result = await this.runOpenCode(task);
      return result;
    } catch (error) {
      this.logger.error(`Failed to process task: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OpenCodeService;
