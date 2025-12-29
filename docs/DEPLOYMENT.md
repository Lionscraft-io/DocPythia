# Deployment Guide

This guide covers various deployment options for DocsAI.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Docker Deployment](#docker-deployment)
- [Manual Deployment](#manual-deployment)
- [Cloud Deployments](#cloud-deployments)
- [Production Checklist](#production-checklist)

## Prerequisites

### Required Services

- **PostgreSQL 15+** with pgvector extension
- **Node.js 20+** (for manual deployment)
- **Docker** (for containerized deployment)

### Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `ADMIN_TOKEN` | Yes | Secure admin authentication token |
| `NODE_ENV` | No | Set to `production` |
| `PORT` | No | Server port (default: 8080) |
| `WIDGET_DOMAIN` | No | Domain for embedded widget |

## Docker Deployment

### Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/docsai.git
cd docsai

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# Start with Docker Compose
docker-compose up -d
```

### Custom Build

```bash
# Build image
docker build -t docsai:latest .

# Run container
docker run -d \
  --name docsai \
  -p 3762:8080 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e GEMINI_API_KEY="your-api-key" \
  -e ADMIN_TOKEN="your-secure-token" \
  docsai:latest
```

### Docker Compose Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  db:
    image: pgvector/pgvector:pg15
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: docsai
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    image: docsai:latest
    restart: always
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/docsai
      NODE_ENV: production
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      ADMIN_TOKEN: ${ADMIN_TOKEN}
    depends_on:
      db:
        condition: service_healthy

volumes:
  postgres_data:
```

## Manual Deployment

### Setup

```bash
# Install dependencies
npm ci --only=production

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Build application
npm run build

# Start server
npm start
```

### Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/index.js --name docsai

# Configure startup
pm2 startup
pm2 save
```

### Systemd Service

Create `/etc/systemd/system/docsai.service`:

```ini
[Unit]
Description=DocsAI Application
After=network.target postgresql.service

[Service]
Type=simple
User=docsai
WorkingDirectory=/opt/docsai
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/docsai/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable docsai
sudo systemctl start docsai
```

## Cloud Deployments

### AWS App Runner

1. Push Docker image to ECR:
   ```bash
   aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
   docker tag docsai:latest <account>.dkr.ecr.<region>.amazonaws.com/docsai:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/docsai:latest
   ```

2. Create App Runner service pointing to ECR image

3. Configure environment variables in App Runner console

### AWS ECS

See [AWS ECS documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/getting-started.html) for container orchestration.

### Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialize
railway login
railway init

# Deploy
railway up
```

### Render

1. Connect your repository to Render
2. Create a new Web Service
3. Configure environment variables
4. Deploy

### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch application
fly launch

# Set secrets
fly secrets set DATABASE_URL="..." GEMINI_API_KEY="..."

# Deploy
fly deploy
```

## Reverse Proxy

### Nginx

```nginx
server {
    listen 80;
    server_name docsai.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name docsai.example.com;

    ssl_certificate /etc/letsencrypt/live/docsai.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/docsai.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Caddy

```
docsai.example.com {
    reverse_proxy localhost:8080
}
```

## Production Checklist

### Security

- [ ] Strong, unique `ADMIN_TOKEN` configured
- [ ] Database credentials are secure and not default
- [ ] HTTPS enabled with valid certificate
- [ ] CORS configured for your domain only
- [ ] API keys stored securely (secrets manager recommended)
- [ ] Rate limiting configured

### Database

- [ ] PostgreSQL with pgvector extension installed
- [ ] Regular automated backups configured
- [ ] Connection pooling configured (for high traffic)
- [ ] Migrations applied: `npx prisma migrate deploy`

### Monitoring

- [ ] Health check endpoint monitored (`/api/health`)
- [ ] Error logging configured
- [ ] Application metrics collection
- [ ] Alerting for critical issues

### Performance

- [ ] Appropriate instance sizing
- [ ] Auto-scaling configured (if applicable)
- [ ] CDN for static assets (optional)
- [ ] Database indexes optimized

### Operations

- [ ] Backup and restore procedures documented
- [ ] Rollback procedure documented
- [ ] Log retention policy configured
- [ ] Incident response plan ready

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify pgvector extension
psql -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### Application Startup Issues

```bash
# Check logs
docker logs docsai
# or
journalctl -u docsai -f

# Verify environment variables
docker exec docsai env | grep -E "DATABASE|GEMINI|ADMIN"
```

### Health Check

```bash
curl http://localhost:8080/api/health
```

Expected response:
```json
{"status": "ok", "timestamp": "..."}
```
