FROM node:18-alpine
WORKDIR /app

# Copy only package files from the socket-server folder first and install
COPY ./socket-server/package*.json ./
# `npm ci` requires a lockfile; use npm install and omit dev deps for reproducible install without package-lock
RUN npm install --omit=dev --no-audit --no-fund

# Copy the socket-server sources into /app so index.js lives at /app/index.js
COPY ./socket-server .

ENV PORT 3001
EXPOSE 3001
CMD ["node", "index.js"]
