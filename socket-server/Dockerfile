FROM node:18-alpine

# Add dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory with proper permissions
WORKDIR /app
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Copy package files and install dependencies
COPY --chown=node:node ./socket-server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy application code
COPY --chown=node:node ./socket-server .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Expose port
EXPOSE $PORT

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
