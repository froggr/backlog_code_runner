# Backlog Code Runner

An automated task runner for `backlog.md` with OpenCode integration, featuring a beautiful terminal user interface built with Ink (React for Terminal).

## Features

- 🚀 **Beautiful TUI**: Split-screen terminal interface with real-time updates
- 🤖 **OpenCode Integration**: Automatic task execution with live output streaming
- 📋 **Backlog.md Support**: Seamless integration with backlog.md task management
- 🌿 **Git Worktree**: Isolated agent work environment using Git worktrees
- 🔄 **Auto-processing**: Configurable auto-start mode for continuous task processing
- 📊 **Real-time Stats**: Live tracking of completed tasks, errors, and runtime
- 🎮 **Interactive Controls**: Keyboard shortcuts for all operations

## Installation

### Prerequisites

- Node.js 14+ 
- Git repository initialized
- [OpenCode CLI](https://github.com/opencodedev/opencode) installed
- `backlog.md` project with tasks in `backlog/tasks/` directory

### Install Globally

```bash
npm install -g backlog-opencode-runner
```

### Install Locally

```bash
git clone <repository>
cd backlog_code_runner
npm install
npm run global  # Install globally from local
```

## Quick Start

1. **Initialize your project** with backlog.md:
   ```bash
   backlog init
   ```

2. **Configure the runner** (optional):
   Create `.backlog-runner.json` in your project root:
   ```json
   {
     "todoColumn": "For Agent",
     "progressColumn": "In Progress", 
     "reviewColumn": "Review",
     "completedColumn": "Done",
     "backlogPath": "./backlog/tasks",
     "mainBranch": "main"
   }
   ```

3. **Run the TUI**:
   ```bash
   backlog-runner
   ```

## Interface Overview

### Split-Screen Layout

```
┌─────────────────────────────┬─────────────────────────────┐
│                             │                             │
│         LEFT PANEL          │        RIGHT PANEL          │
│                             │                             │
│  🔄 BACKLOG RUNNER          │  🤖 OpenCode Output         │
│                             │  (Live streaming)           │
│  Status: ⚡ READY            │                             │
│                             │  ┌─────────────────────────┐ │
│  📋 Task Queue (3):         │  │ > Starting task...      │ │
│  ▶ Add user authentication  │  │ > Analyzing code...     │ │
│  2. Fix login bug          │  │ > Running tests...      │ │
│  3. Update documentation   │  │ > Task completed!       │ │
│                             │  └─────────────────────────┘ │
│  📊 Stats:                  │                             │
│  Runtime: 5m 23s           │  📜 Activity Logs           │
│  Completed: 12             │  ┌─────────────────────────┐ │
│  Errors: 1                 │  │ [14:23:45] Task started │ │
│                             │  │ [14:24:12] Git changes  │ │
│  🎮 Controls:               │  │ [14:24:30] Task done    │ │
│  [R]efresh • [S]tart        │  └─────────────────────────┘ │
│  [A]uto • [Q]uit            │                             │
│                             │                             │
└─────────────────────────────┴─────────────────────────────┘
```

### Left Panel
- **Header**: Current application status
- **Task Queue**: Shows tasks in "For Agent" column
- **Stats**: Runtime, completed tasks, errors
- **Controls**: Available keyboard shortcuts
- **Help**: Additional command explanations

### Right Panel
- **Top 60%**: Live OpenCode output streaming
- **Bottom 40%**: Activity logs and system messages

## Keyboard Controls

| Key | Action | Description |
|-----|--------|-------------|
| `R` | Refresh | Reload tasks from backlog |
| `S` | Start | Process next task manually |
| `A` | Auto-start | Toggle automatic task processing |
| `B` | Backup | Create manual snapshot |
| `U` | Undo | Rollback last task |
| `C` | Clear output | Clear OpenCode output panel |
| `L` | Clear logs | Clear activity logs panel |
| `Q` | Quit | Exit the application |
| `Ctrl+C` | Force quit | Emergency exit |

## How It Works

### Task Processing Flow

1. **Task Detection**: Monitors `backlog/tasks/` for tasks in "For Agent" column
2. **Snapshot Creation**: Creates Git snapshot for rollback capability
3. **OpenCode Execution**: Runs OpenCode with task-specific prompt
4. **Output Capture**: Streams all output to TUI in real-time
5. **Git Operations**: Stages and commits changes with descriptive messages
6. **Task Updates**: Appends OpenCode output to task file for auditability
7. **Status Updates**: Moves task to "Review" column when complete

### Snapshot/Rollback Benefits

- **Safety**: Every task creates a snapshot before starting
- **Easy Recovery**: Simple rollback with `[U]` key or Git commands
- **No Conflicts**: Works directly in your current branch
- **Transparency**: All changes are visible in your working directory

### OpenCode Integration

The runner automatically:
- Passes task context to OpenCode
- Captures all output for debugging
- Appends execution logs to task files
- Handles errors gracefully with proper logging

## Configuration

### Environment Variables

```bash
export BACKLOG_RUNNER_AUTO_START=true
export BACKLOG_RUNNER_POLL_INTERVAL=5000
```

### Config File (`.backlog-runner.json`)

```json
{
  "todoColumn": "For Agent",
  "progressColumn": "In Progress",
  "reviewColumn": "Review", 
  "completedColumn": "Done",
  "backlogPath": "./backlog/tasks",
  "mainBranch": "main",
  "branchPrefix": "task",
  "timeout": 300000
}
```

## Task File Format

Tasks must be in `backlog/tasks/` with frontmatter:

```markdown
---
status: "For Agent"
labels: ["backend", "api"]
---

# task-42 - Add user authentication

## Description
Implement OAuth2 authentication for the user login system.

## Acceptance Criteria
- [ ] OAuth2 flow implemented
- [ ] User sessions managed
- [ ] Security tests pass
```

## Troubleshooting

### Common Issues

**"TTY Error: This application requires an interactive terminal"**
- Solution: Run in a proper terminal, not in CI/CD or non-interactive environments

**"OpenCode CLI not found"**
- Solution: Install OpenCode CLI: `npm install -g @opencodedev/cli`

**"Not in a git repository"**
- Solution: Initialize git: `git init && git add . && git commit -m "Initial commit"`

**"Main branch does not exist"**
- Solution: Create main branch: `git checkout -b main`

**"Backlog directory not found"**
- Solution: Initialize backlog: `backlog init`

### Debug Mode

Run with additional logging:
```bash
DEBUG=backlog-runner backlog-runner
```

### Alternative Simple Mode

If TUI doesn't work, use simple mode:
```bash
npm run simple
```

## Development

### Scripts

```bash
npm start          # Start Ink TUI
npm run simple     # Start simple CLI version
npm run dev        # Development mode
npm run global     # Install globally from local
npm run uninstall  # Remove global installation
```

### Testing

```bash
# Test if Ink TUI works
node test-ink.js

# Test basic functionality
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- 📝 **Issues**: Report bugs or request features via GitHub Issues
- 💬 **Discussions**: Join the conversation in GitHub Discussions
- 📧 **Email**: Contact the maintainers for urgent issues

---

Made with ❤️ for the backlog.md community