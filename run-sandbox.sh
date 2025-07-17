#!/bin/bash

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ No .env file found. Run ./setup-sandbox.sh first"
    exit 1
fi

# Source .env for display
source .env

echo "🏗️  Building OpenCode sandbox..."
docker compose build

echo "🚀 Starting OpenCode sandbox..."
echo "📁 Project directory: $PROJECT_PATH"
docker compose run --rm opencode-sandbox

echo "📋 Inside the container you can:"
echo "  - backlog-runner       # Run your backlog runner"
echo "  - backlog task list --plain  # Use backlog.md"
echo "  - opencode --help      # OpenCode is pre-authenticated"
echo "  - Your project is mounted at /workspace"
