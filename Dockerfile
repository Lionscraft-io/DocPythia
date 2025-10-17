# Multi-stage build for optimal production image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Set production environment for build
ENV NODE_ENV=production

# Add build argument for domain (defaults to App Runner domain)
ARG WIDGET_DOMAIN=https://euk5cmmqyr.eu-central-1.awsapprunner.com
ENV VITE_WIDGET_DOMAIN=$WIDGET_DOMAIN

# Build the application (use production vite config, then esbuild with config)
RUN npx tailwindcss -i ./client/src/index.css -o ./client/src/output.css --minify && \
    npx vite build --config vite.config.production.ts && \
    node esbuild.config.js

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy server scripts for potential runtime initialization
COPY server ./server
COPY shared ./shared

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app

USER nextjs

# Expose the port that App Runner expects
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV WIDGET_DOMAIN=https://euk5cmmqyr.eu-central-1.awsapprunner.com

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Start the application
CMD ["node", "dist/index.js"]