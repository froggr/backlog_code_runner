# Use Node.js with Playwright support
FROM mcr.microsoft.com/playwright:v1.49.0-noble

# Install only essential system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install global packages
RUN npm install -g npm@latest \
    backlog.md

# Playwright browsers are already installed in the base image
# No need to install again - this saves ~500MB

# Copy and install this project
COPY package*.json ./
RUN npm install
COPY . .
RUN npm install -g .

# Create workspace directory
RUN mkdir -p /workspace

# Install OpenCode using official installer
RUN curl -fsSL https://opencode.ai/install | bash

# Ensure it's in PATH
ENV PATH="/root/.opencode/bin:$PATH"

# Set default working directory to mounted project
WORKDIR /workspace

# Default command
CMD ["bash"]