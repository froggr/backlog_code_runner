#!/bin/bash

# Run OpenCode on host but locked to project directory
PROJECT_PATH=${PROJECT_PATH:-/Users/frog/projects/DongleControl}

# Safety checks
if [ ! -d "$PROJECT_PATH" ]; then
    echo "Error: Project path $PROJECT_PATH does not exist"
    exit 1
fi

# Ensure container is running for other tools (without mount)
if ! docker ps --format "{{.Names}}" | grep -q "^opencode-sandbox$"; then
    echo "Starting container for development tools..."
    docker compose up -d
fi

# Change to project directory
cd "$PROJECT_PATH" || exit 1

echo "🚀 Running OpenCode on host in: $PROJECT_PATH"
echo "📦 Container available for other tools: docker compose exec opencode-sandbox bash"

# Run OpenCode with additional restrictions
export OPENCODE_WORKSPACE="$PROJECT_PATH"
export OPENCODE_RESTRICT_TO_WORKSPACE=true

opencode "$@"