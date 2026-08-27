# Crucible MCP server — served over Streamable HTTP so TrueForge can register it as a remote
# MCP server, and attached to the internal arena network so `connect` can reach arena targets.
FROM node:22-slim
WORKDIR /app

# Install deps first for layer caching, from the committed lockfile for reproducible builds.
# `npm ci` needs both manifests; keep dev deps because the runtime command uses tsx.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY challenge-files ./challenge-files

ENV CRUCIBLE_MCP_PORT=8848
ENV CRUCIBLE_MCP_PATH=/mcp
EXPOSE 8848

# Lightweight healthcheck against the /health endpoint (node, no curl needed).
HEALTHCHECK --interval=3s --timeout=3s --retries=10 --start-period=3s \
  CMD node -e "require('http').get('http://127.0.0.1:8848/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "run", "start:http"]
