const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class TaskRunner {
  constructor() {
    this.config = {
      mainBranch: 'main',
      todoColumn: 'For Agent',
      progressColumn: 'In Progress',
      reviewColumn: 'Review',
      completedColumn: 'Done',
      backlogPath: './backlog/tasks',
      branchPrefix: 'task',
      timeout: 300000,
    };

    this.loadConfig();
  }

  loadConfig() {
    const configPath = path.join(process.cwd(), '.backlog-runner.json');
    if (fs.existsSync(configPath)) {
      try {
        const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.config = { ...this.config, ...userConfig };
      } catch (error) {
        console.warn('Warning: Invalid config file, using defaults');
      }
    }
  }

  exec(command, options = {}) {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'pipe',
        ...options,
      });
      return result ? result.trim() : '';
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }

  parseTask(content, filename) {
    const lines = content.split('\n');
    const task = {
      id: filename,
      title: '',
      description: '',
      status: '',
      labels: [],
      isRevision: false,
    };

    // Extract title
    const titleMatch = lines[0]?.match(/^#\s*(.+)/) || filename.match(/task-\d+\s*-\s*(.+)\.md/);
    if (titleMatch) {
      task.title = titleMatch[1].trim();
    }

    // Parse frontmatter
    let inFrontmatter = false;
    let frontmatterEnd = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
        } else {
          frontmatterEnd = i;
          break;
        }
        continue;
      }

      if (inFrontmatter) {
        if (line.startsWith('status:')) {
          task.status = line.split(':')[1].trim().replace(/['"]/g, '');
        } else if (line.startsWith('labels:')) {
          const labelsStr = line.substring(7).trim();
          if (labelsStr.startsWith('[') && labelsStr.endsWith(']')) {
            task.labels = JSON.parse(labelsStr);
          } else {
            task.labels = labelsStr.split(',').map(l => l.trim()).filter(l => l);
          }
        }
      }
    }

    // Get description
    if (frontmatterEnd > 0) {
      task.description = lines.slice(frontmatterEnd + 1).join('\n').trim();
    } else {
      task.description = lines.slice(1).join('\n').trim();
    }

    // Check if revision
    task.isRevision = task.labels.includes('revision-requested') ||
                     task.labels.includes('needs-revision');

    return task;
  }

  async getTasks() {
    try {
      if (!fs.existsSync(this.config.backlogPath)) {
        return [];
      }

      const tasks = [];
      const files = fs.readdirSync(this.config.backlogPath)
        .filter(file => file.match(/^task-\d+.*\.md$/))
        .sort();

      for (const file of files) {
        const content = fs.readFileSync(path.join(this.config.backlogPath, file), 'utf8');
        const task = this.parseTask(content, file);

        if (task.status === this.config.todoColumn || (!task.status && this.config.todoColumn === 'For Agent')) {
          tasks.push(task);
        }
      }

      return tasks;
    } catch (error) {
      console.error(`Error reading tasks: ${error.message}`);
      return [];
    }
  }

  async checkEnvironment() {
    const errors = [];

    // Check if we're in a git repository
    try {
      this.exec('git rev-parse --git-dir', { silent: true });
    } catch (error) {
      errors.push('Not in a git repository. Please run "git init" first.');
    }

    // Check if main branch exists
    try {
      this.exec(`git show-ref --verify --quiet refs/heads/${this.config.mainBranch}`, { silent: true });
    } catch (error) {
      errors.push(`Main branch "${this.config.mainBranch}" does not exist. Please create it first.`);
    }

    // Check if backlog directory exists
    if (!fs.existsSync(this.config.backlogPath)) {
      errors.push(`Backlog directory "${this.config.backlogPath}" not found. Please run "backlog init" first.`);
    }

    // Check if opencode is available
    try {
      this.exec('which opencode', { silent: true });
    } catch (error) {
      errors.push('OpenCode CLI not found. Please install it first.');
    }

    return errors;
  }

  async setupAgentWorktree() {
    const worktreePath = path.join(process.cwd(), '.agent-worktree');
    const branchName = 'agent';

    try {
      // Check if worktree already exists
      if (fs.existsSync(worktreePath)) {
        // Update the worktree with latest main changes
        const currentDir = process.cwd();
        process.chdir(worktreePath);

        try {
          this.exec(`git merge ${this.config.mainBranch} --no-edit`);
        } catch (error) {
          // Merge conflicts or other issues
        }

        process.chdir(currentDir);
        return worktreePath;
      }

      // Create agent branch if it doesn't exist
      try {
        this.exec(`git show-ref --verify --quiet refs/heads/${branchName}`, { silent: true });
      } catch (error) {
        this.exec(`git checkout -b ${branchName}`);
        this.exec(`git checkout ${this.config.mainBranch}`);
      }

      // Create worktree
      this.exec(`git worktree add ${worktreePath} ${branchName}`);
      return worktreePath;
    } catch (error) {
      throw new Error(`Failed to setup agent worktree: ${error.message}`);
    }
  }
}

module.exports = TaskRunner;
