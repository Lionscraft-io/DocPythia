# Multi-Instance Configuration Guide

This application supports multi-tenant operation with instance-specific databases and configurations.

## Architecture Overview

The multi-instance system allows you to run multiple blockchain documentation sites from a single deployment, each with:
- **Separate databases** (different database names, same server)
- **Independent configuration** (branding, docs repos, features)
- **URL-based routing** (e.g., `/near/admin`, `/conflux/api`)

## URL Structure

All URLs must include an instance prefix:

```
/{instanceId}/{route}
```

**Examples:**
- `http://localhost:3762/near/admin` - NEAR instance admin panel
- `http://localhost:3762/conflux/admin` - Conflux instance admin panel
- `http://localhost:3762/near/api/admin/stream/conversations` - NEAR API endpoint
- `http://localhost:3762/conflux/api/admin/stream/conversations` - Conflux API endpoint

## Configuration Structure

Instance configurations are stored in:
```
config/
├── near/
│   └── instance.json
├── conflux/
│   └── instance.json
└── {other-instances}/
    └── instance.json
```

### Instance Configuration File

Each `instance.json` must include:

**⚠️ Security Note**: Each instance has its own admin password stored as a SHA256 hash in the config.

```json
{
  "project": {
    "name": "Your Project Name",
    "shortName": "projectid",
    "description": "Project description",
    "domain": "yourdomain.com",
    "supportEmail": "support@yourdomain.com"
  },
  "branding": {
    "logo": "https://...",
    "favicon": "https://...",
    "primaryColor": "#hex",
    "projectUrl": "https://..."
  },
  "documentation": {
    "gitUrl": "https://github.com/org/docs",
    "branch": "main",
    "docsPath": ""
  },
  "database": {
    "name": "your_database_name"
  },
  "community": { ... },
  "widget": { ... },
  "features": { ... },
  "admin": {
    "passwordHash": "sha256_hash_of_admin_password",
    "allowedOrigins": ["http://localhost:3762"]
  }
}
```

## Database Setup

### 1. Create Separate Databases

For each instance, create a database on your PostgreSQL server:

```sql
CREATE DATABASE neardocs;
CREATE DATABASE confluxdocs;
-- Add more as needed
```

### 2. Configure DATABASE_URL

Set your base database URL in `.env`:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/default
```

The application will automatically replace the database name based on the instance configuration.

### 3. Run Migrations for Each Database

You need to run Prisma migrations for each instance database:

```bash
# For NEAR instance
DATABASE_URL=postgresql://username:password@localhost:5432/neardocs npx prisma migrate deploy

# For Conflux instance
DATABASE_URL=postgresql://username:password@localhost:5432/confluxdocs npx prisma migrate deploy
```

## Adding a New Instance

1. **Create configuration directory:**
   ```bash
   mkdir config/myinstance
   ```

2. **Create `config/myinstance/instance.json`:**
   Copy an existing instance config and modify it for your new instance.

3. **Create database:**
   ```sql
   CREATE DATABASE myinstancedb;
   ```

4. **Run migrations:**
   ```bash
   DATABASE_URL=postgresql://username:password@localhost:5432/myinstancedb npx prisma migrate deploy
   ```

5. **Access your instance:**
   ```
   http://localhost:3762/myinstance/admin
   ```

## Environment Variables

### Instance-Specific Overrides

You can override configuration values using environment variables with instance prefixes:

```env
# Override for NEAR instance
NEAR_PROJECT_NAME="Custom NEAR Name"
NEAR_DATABASE_NAME="custom_neardocs"

# Override for Conflux instance
CONFLUX_PROJECT_NAME="Custom Conflux Name"
CONFLUX_DATABASE_NAME="custom_confluxdocs"

# Generic overrides (apply to all instances without specific override)
PROJECT_NAME="Default Name"
DATABASE_NAME="default_db"
```

## Frontend Routing

The frontend must include the instance ID in all routes:

```typescript
// Redirect to instance-specific login
<Route path="/">
  <Redirect to="/near/admin/login" />
</Route>

// Instance-aware routes
<Route path="/:instance/admin/login" component={AdminLogin} />
<Route path="/:instance/admin" component={Admin} />
```

## API Client Configuration

Update your API client to include the instance prefix:

```typescript
// In queryClient.ts or similar
const instanceId = getInstanceFromUrl(); // Extract from window.location.pathname
const apiUrl = `/${instanceId}/api${endpoint}`;
```

## Backend Integration

The instance middleware automatically:
1. Extracts the instance ID from the URL
2. Loads the instance configuration
3. Connects to the instance-specific database
4. Attaches context to `req.instance`

### Accessing Instance Context in Routes

```typescript
import { Request, Response } from 'express';

app.get('/api/some-endpoint', async (req: Request, res: Response) => {
  // Access instance context
  const { id, config, db } = req.instance!;

  // Use instance-specific database
  const data = await db.myModel.findMany();

  // Use instance configuration
  const projectName = config.project.name;

  res.json({ data, projectName });
});
```

## Troubleshooting

### Instance not found
- Ensure `config/{instanceId}/instance.json` exists
- Check file permissions
- Verify JSON is valid

### Database connection failed
- Confirm database exists: `psql -l | grep dbname`
- Check DATABASE_URL is correct
- Verify migrations ran: `psql -d dbname -c "\dt"`

### URL routing issues
- Ensure middleware is applied before routes
- Check that frontend includes instance prefix in all API calls
- Verify routes don't have hardcoded paths

## Migration from Single-Instance

If migrating from a single-instance setup:

1. **Move your config:**
   ```bash
   mkdir config/near
   mv config/instance.json config/near/instance.json
   ```

2. **Add database name to config:**
   ```json
   {
     ...
     "database": {
       "name": "neardocs"
     }
   }
   ```

3. **Update frontend routes:**
   Add `/near` prefix to all routes and API calls

4. **Update bookmarks/documentation:**
   Update all URLs to include `/near` prefix

## Performance Considerations

- **Database connections**: Each instance maintains its own connection pool
- **Config caching**: Configurations are cached after first load
- **Route performance**: URL parsing adds minimal overhead (~1ms)

## Security Notes

- **Per-instance passwords**: Each instance has its own admin password (hashed with SHA256)
- **Database isolation**: Complete tenant separation with separate databases
- **CORS configuration**: Origins can be configured per instance
- **Password storage**: Never stored in plain text, only SHA256 hashes
- **No shared credentials**: NEAR and Conflux have completely separate authentication

### Changing Admin Password

```bash
# Generate new password hash
node -e "
const crypto = require('crypto');
const password = 'your_new_password';
const hash = crypto.createHash('sha256').update(password).digest('hex');
console.log('New Password Hash:', hash);
"

# Update config/your-instance/instance.json
{
  "admin": {
    "passwordHash": "paste_generated_hash_here"
  }
}
```

## Support

For issues or questions, see:
- [GitHub Issues](https://github.com/yourusername/yourrepo/issues)
- [Documentation](./README.md)
