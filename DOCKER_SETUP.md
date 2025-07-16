# OpenCode Sandbox Environment

A super simple Docker sandbox for running OpenCode and backlog.md safely with Playwright MCP support.

## 🚀 Quick Start

**Prerequisites:** `opencode login` on your host system first

1. **Setup (one time):**
   ```bash
   ./setup-sandbox.sh
   ```
   This will prompt you for your project directory path and create a `.env` file.

2. **Run (every time):**
   ```bash
   ./run-sandbox.sh
   ```

That's it! Everything is pre-configured and your OpenCode auth is automatically available.

## ⚙️ Configuration

The setup creates a `.env` file:
```bash
# OpenCode Sandbox Configuration
PROJECT_PATH=/path/to/your/project
```

**To change project path:**
- Edit `.env` file directly, or
- Delete `.env` and run `./setup-sandbox.sh` again

## ✨ What's Included

- **OpenCode:** Pre-authenticated using your host credentials
- **backlog.md:** CLI tool installed globally
- **Playwright MCP:** Ready for web automation tasks
- **Your project:** Mounted at `/workspace`
- **Git config:** From your host system
- **SSH keys:** Read-only access to your host keys

## 🔒 Security Benefits

- **Complete isolation:** Container can't access host beyond mounted directories
- **No setup complexity:** Just mount your existing auth
- **Controlled access:** Only your specified project directory is writable
- **Clean slate:** Fresh container each run

## 🎯 Usage Examples

```bash
# Inside the container:
backlog-runner                    # Run your agent
backlog task list --plain         # List tasks
opencode "help me with this bug"  # Already authenticated!
```

## 🛠️ How It Works

1. **Dockerfile** builds everything at container creation time
2. **docker-compose.yml** uses `.env` for project path configuration
3. **setup-sandbox.sh** creates `.env` with your project path
4. **run-sandbox.sh** starts the container with everything ready

## 🔧 Manual Commands

```bash
# Build
docker-compose build

# Run interactive shell
docker-compose run --rm opencode-sandbox

# Run one-off command
docker-compose run --rm opencode-sandbox backlog-runner
```

## 📁 What Gets Mounted

- `PROJECT_PATH` (from `.env`) → `/workspace` (your project)
- `~/.config/opencode` → Container OpenCode auth
- `~/.gitconfig` → Container Git config  
- `~/.ssh` → Container SSH keys (read-only)

Super simple, secure, and ready to go!