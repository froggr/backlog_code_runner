# Use Node.js with Playwright support
FROM mcr.microsoft.com/playwright:v1.49.0-noble

# Install only essential system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install global packages
RUN npm install -g npm@latest \
    backlog.md \
    opencode-ai \
    @executeautomation/playwright-mcp-server

# Playwright browsers are already installed in the base image
# No need to install again - this saves ~500MB

# Copy and install this project
COPY package*.json ./
RUN npm install
COPY . .
RUN npm install -g .

# Create workspace directory
RUN mkdir -p /workspace

# Create MCP config for OpenCode
RUN mkdir -p /root/.config/opencode
RUN echo '{"mcpServers":{"playwright":{"command":"npx","args":["@executeautomation/playwright-mcp-server"],"env":{"PLAYWRIGHT_BROWSERS_PATH":"/ms-playwright"}}}}' > /root/.config/opencode/mcp.json

# Set default working directory to mounted project
WORKDIR /workspace

# Default command
CMD ["bash"]