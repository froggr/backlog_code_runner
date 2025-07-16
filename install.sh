#!/bin/bash

# Backlog Code Runner Installation Script
# This script installs the Backlog Code Runner globally

set -e

echo "🚀 Installing Backlog Code Runner..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 14+ first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="14.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please install Node.js 14+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    exit 1
fi

# Check if OpenCode is installed
if ! command -v opencode &> /dev/null; then
    echo "⚠️  OpenCode CLI is not installed."
    echo "The runner will not work without OpenCode."
    echo "Install it with: npm install -g @opencodedev/cli"
    read -p "Continue installation anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "✅ All prerequisites satisfied"

# Install the package globally
echo "📦 Installing backlog-opencode-runner globally..."
npm install -g .

echo "✅ Installation complete!"

# Test the installation
echo "🧪 Testing installation..."
if backlog-runner --version &> /dev/null; then
    echo "✅ Installation test passed"
else
    echo "❌ Installation test failed"
    echo "Try running: npm install -g ."
    exit 1
fi

echo ""
echo "🎉 Backlog Code Runner is now installed!"
echo ""
echo "Next steps:"
echo "1. Navigate to your project directory"
echo "2. Initialize backlog.md: backlog init"
echo "3. Create .backlog-runner.json config (optional)"
echo "4. Run: backlog-runner"
echo ""
echo "For help and documentation, visit:"
echo "https://github.com/your-repo/backlog-code-runner"
