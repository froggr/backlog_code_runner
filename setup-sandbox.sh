#!/bin/bash

# Super simple setup script for OpenCode sandbox
echo "🚀 Setting up OpenCode sandbox environment..."

# Check if opencode is authenticated on host
if [ ! -f ~/.local/share/opencode/auth.json ]; then
    echo "⚠️  OpenCode not authenticated on host system!"
    echo "   Please run 'opencode login' on your host system first"
    echo "   This will be mounted into the container"
    exit 1
fi

echo "✅ OpenCode authentication found on host"

# Create .env file for project path
if [ ! -f .env ]; then
    echo "📁 Setting up project path configuration..."
    read -p "Enter the path to your project directory: " PROJECT_PATH
    
    # Convert to absolute path
    PROJECT_PATH=$(realpath "$PROJECT_PATH")
    
    # Verify path exists
    if [ ! -d "$PROJECT_PATH" ]; then
        echo "❌ Directory does not exist: $PROJECT_PATH"
        exit 1
    fi
    
    # Create .env file
    cat > .env << EOF
# OpenCode Sandbox Configuration
PROJECT_PATH=$PROJECT_PATH
EOF
    
    echo "✅ Created .env file with PROJECT_PATH=$PROJECT_PATH"
else
    echo "✅ .env file already exists"
fi

# Create simple run script
cat > run-sandbox.sh << 'EOF'
#!/bin/bash

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ No .env file found. Run ./setup-sandbox.sh first"
    exit 1
fi

# Source .env for display
source .env

echo "🏗️  Building OpenCode sandbox..."
docker-compose build

echo "🚀 Starting OpenCode sandbox..."
echo "📁 Project directory: $PROJECT_PATH"
docker-compose run --rm opencode-sandbox

echo "📋 Inside the container you can:"
echo "  - backlog-runner       # Run your backlog runner"
echo "  - backlog task list --plain  # Use backlog.md"
echo "  - opencode --help      # OpenCode is pre-authenticated"
echo "  - Your project is mounted at /workspace"
EOF

chmod +x run-sandbox.sh

echo "✅ Setup complete!"
echo ""
echo "🚀 To start the sandbox:"
echo "   ./run-sandbox.sh"
echo ""
echo "🔧 To change project path:"
echo "   Edit .env file or delete it and run setup again"
echo ""
echo "🎯 What's included:"
echo "   ✅ OpenCode (pre-authenticated from host)"
echo "   ✅ backlog.md CLI tool"
echo "   ✅ Playwright MCP server"
echo "   ✅ Your project mounted at /workspace"
echo "   ✅ Git config from host"
echo ""
echo "🔒 Everything runs isolated in container!"