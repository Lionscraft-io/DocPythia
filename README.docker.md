# DocsAI - Docker Setup

Run DocsAI with its own isolated PostgreSQL database using Docker Compose.

## Quick Start

### 1. Configure Environment

```bash
# Copy the example environment file
cp .env.docker .env.local

# Edit .env.local with your settings (optional - defaults work for local dev)
nano .env.local
```

### 2. Start the Application

```bash
# Build and start (production mode)
docker-compose --env-file .env.local up -d

# View logs
docker-compose logs -f app

# Check status
docker-compose ps
```

### 3. Access the Application

- **Main app**: http://localhost:3762
- **Admin panel**: http://localhost:3762/admin
- **Health check**: http://localhost:3762/api/health
- **API docs**: http://localhost:3762/api/docs

### 4. Stop the Application

```bash
# Stop services
docker-compose down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose down -v
```

## Port Configuration

The app runs on **port 3762** by default. To use a different port:

```bash
# In .env.local
APP_PORT=8080  # Change to your preferred port
```

Or override when running:

```bash
APP_PORT=8080 docker-compose up -d
```

## Database Access

The PostgreSQL database is isolated within Docker. To access it:

```bash
# Connect to database
docker-compose exec db psql -U docsai -d docsai

# Or from host (if DB_PORT is exposed in docker-compose.dev.yml)
psql -h localhost -p 5433 -U docsai -d docsai
```

**Default credentials:**
- User: `docsai`
- Password: Set via `POSTGRES_PASSWORD` environment variable (default: `changeme`)
- Database: `docsai`

## Development Mode

For development with hot reload:

```bash
# Use both compose files
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# This will:
# - Mount source code for live updates
# - Run npm run dev
# - Expose database on port 5433
```

## Volumes

Data is persisted in Docker volumes:

```bash
# List volumes
docker volume ls | grep docsai

# Inspect volume
docker volume inspect lionscraft-docsaiai_docsai_db_data

# Backup database
docker-compose exec db pg_dump -U docsai docsai > backup.sql

# Restore database
docker-compose exec -T db psql -U docsai docsai < backup.sql
```

## Troubleshooting

### Port already in use

```bash
# Change APP_PORT in .env.local
APP_PORT=3763  # or any available port
```

### Database connection issues

```bash
# Check database health
docker-compose exec db pg_isready -U docsai

# View database logs
docker-compose logs db

# Restart database
docker-compose restart db
```

### Application won't start

```bash
# View application logs
docker-compose logs app

# Rebuild application
docker-compose build --no-cache app
docker-compose up -d app
```

### Reset everything

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Rebuild from scratch
docker-compose build --no-cache
docker-compose up -d
```

## Configuration Options

Edit `.env.local` to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | 3762 | Port to expose the app on host |
| `ADMIN_TOKEN` | (required) | Admin panel access token |
| `SCHEDULER_ENABLED` | false | Enable automated scraping/analysis |
| `ZULIP_BOT_EMAIL` | - | Zulip bot email for scraping |
| `ZULIP_API_KEY` | - | Zulip API key |
| `GOOGLE_AI_API_KEY` | - | Google Gemini API for analysis |

## Production Deployment

For production, ensure:

1. Change database password in `docker-compose.yml`
2. Set strong `ADMIN_TOKEN` in `.env.local`
3. Configure real API keys for Zulip and Gemini
4. Enable HTTPS reverse proxy (nginx/traefik)
5. Set up proper backup strategy

```bash
# Production with custom env file
docker-compose --env-file .env.production up -d
```

## Multi-App Isolation

This setup is isolated from your other apps:
- ✅ Separate PostgreSQL instance (no conflicts)
- ✅ Dedicated Docker network
- ✅ Custom port (3762, configurable)
- ✅ Named volumes for data persistence
- ✅ Independent lifecycle management
