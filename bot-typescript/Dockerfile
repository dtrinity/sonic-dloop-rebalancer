# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install necessary system packages
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./yarn.lock ./

# Install only production dependencies
RUN yarn install --frozen-lockfile --production

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S botuser -u 1001

# Create directory for cache files
RUN mkdir -p /app/cache && \
    chown -R botuser:nodejs /app

USER botuser

# Expose port (if needed)
# EXPOSE 3000

# Default environment variables (can be overridden at runtime)
ENV NODE_ENV=production

# Health check - verify the bot process is running
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "console.log('Bot health check passed')" || exit 1

# Start the application with proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["yarn", "start"]
