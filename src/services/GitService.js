const { execSync } = require('child_process');
const config = require('../config/config');

class GitService {
  constructor(logger) {
    this.logger = logger;
  }

  exec(command, options = {}) {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'pipe', // Changed to pipe to avoid TUI interference
        ...options,
      });
      return result ? result.trim() : '';
    } catch (error) {
      throw new Error(`Git command failed: ${command}\n${error.message}`);
    }
  }

  checkEnvironment() {
    const errors = [];

    // Check if we're in a git repository
    try {
      this.exec('git rev-parse --git-dir', { silent: true });
    } catch (error) {
      errors.push('Not in a git repository. Please run "git init" first.');
    }

    // Check if main branch exists
    try {
      this.exec(
        `git show-ref --verify --quiet refs/heads/${config.get('mainBranch')}`,
        { silent: true }
      );
    } catch (error) {
      errors.push(
        `Main branch "${config.get('mainBranch')}" does not exist. Please create it first.`
      );
    }

    return errors;
  }

  getCurrentBranch() {
    try {
      return this.exec('git branch --show-current', { silent: true });
    } catch (error) {
      this.logger.warning('Could not get current branch');
      return null;
    }
  }

  switchToMainBranch() {
    const mainBranch = config.get('mainBranch');
    this.logger.info(`🔄 Switching to ${mainBranch} branch`);
    this.exec(`git checkout ${mainBranch}`);
  }

  pullLatest() {
    const mainBranch = config.get('mainBranch');
    this.logger.info('⬇️ Pulling latest changes');
    this.exec(`git pull origin ${mainBranch} || true`);
  }

  generateBranchName(task) {
    // Extract just the task number from the task ID
    const taskNum = task.id.match(/task-(\d+)/)?.[1] || task.id.replace(/[^0-9]/g, '');
    return `${config.get('branchPrefix')}-${taskNum}`;
  }

  createBranch(branchName, task) {
    this.logger.info(`🌿 Creating new branch: ${branchName}`);

    // Switch to main and pull latest
    this.switchToMainBranch();
    this.pullLatest();

    // Check if branch already exists
    try {
      this.exec(`git show-ref --verify --quiet refs/heads/${branchName}`, { silent: true });
      this.logger.warning(`⚠️ Branch ${branchName} already exists, using unique name`);
      const timestamp = Date.now().toString().slice(-6);
      const uniqueBranchName = `${branchName}-${timestamp}`;
      this.exec(`git checkout -b ${uniqueBranchName}`);
      return uniqueBranchName;
    } catch {
      this.exec(`git checkout -b ${branchName}`);
      return branchName;
    }
  }

  switchToBranch(branchName) {
    this.logger.info(`🔄 Switching to existing branch: ${branchName}`);
    try {
      this.exec(`git checkout ${branchName}`);
      this.exec(`git pull origin ${branchName} || true`);
    } catch (error) {
      this.logger.warning(`⚠️ Could not checkout ${branchName}, creating new branch`);
      this.exec(`git checkout -b ${branchName}`);
    }
  }

  stageChanges() {
    this.logger.info('📦 Staging changes...');
    this.exec('git add .');
  }

  hasChanges() {
    try {
      this.exec('git diff --cached --exit-code', { silent: true });
      return false; // No changes
    } catch {
      return true; // Has changes
    }
  }

  commit(message) {
    if (!this.hasChanges()) {
      this.logger.warning('ℹ️ No changes to commit, task may have been a no-op');
      return false;
    }

    this.logger.info('💾 Committing changes...');
    this.exec(`git commit -m "${message}"`);
    return true;
  }

  push(branchName) {
    this.logger.info('⬆️ Pushing to remote repository...');
    this.exec(`git push -u origin ${branchName}`);
  }

  createPullRequest(task, branchName) {
    this.logger.info('🔗 Creating pull request...');
    try {
      const prData = config.getPRTemplate(task);
      const mainBranch = config.get('mainBranch');

      this.exec(
        `gh pr create --title "${prData.title}" --body "${prData.body.replace(/"/g, '\\"')}" --head ${branchName} --base ${mainBranch}`
      );

      this.logger.success('📋 Pull request created successfully');
      return true;
    } catch (error) {
      this.logger.warning(`⚠️ PR creation failed (gh CLI might not be configured): ${error.message}`);
      return false;
    }
  }

  cleanup() {
    try {
      this.switchToMainBranch();
    } catch (error) {
      this.logger.warning(`⚠️ Could not return to main branch: ${error.message}`);
    }
  }
}

module.exports = GitService;
