# Admin Password Setup Guide

## Overview

The system uses multi-instance authentication where each instance (e.g., projecta, projectb) has its own admin password stored as a SHA256 hash in the instance configuration file.

## Current Passwords

**IMPORTANT:** These are development passwords and should be changed before production deployment.

- **Project A Instance**: `projecta123`
- **Project B Instance**: `projectb123`

## How Authentication Works

1. User enters password at `/login` (generic) or `/{instance}/admin/login` (instance-specific)
2. Backend tries the password against all configured instances
3. If match found, returns `instanceId` and `redirectUrl` (e.g., `/projecta/admin`)
4. Frontend stores `admin_token` (the password) in sessionStorage
5. All admin API calls include `Authorization: Bearer {token}` header
6. Backend validates token against instance-specific password hashes

## Changing Passwords

### Method 1: Using Node.js

```bash
# Generate new password hash
node -e "console.log(require('crypto').createHash('sha256').update('your-new-password').digest('hex'))"

# Copy the hash and update the config file
```

### Method 2: Manual Update

1. Edit `config/{instance}/instance.json`
2. Update the `admin.passwordHash` field with your SHA256 hash
3. Restart the server to reload configurations

Example:
```json
{
  "admin": {
    "passwordHash": "40fa27bcb2dbdc73264c1e7ace54f229a0d95a25ee765a3c06b512592c23528e",
    "allowedOrigins": ["http://localhost:3762", "http://localhost:5173"]
  }
}
```

## Security Notes

1. **Never commit real passwords** to version control
2. Use strong, unique passwords for each instance
3. Password hashes are SHA256 (64 hex characters)
4. Set `DISABLE_ADMIN_AUTH=false` in production (default)
5. For development only: `DISABLE_ADMIN_AUTH=true` bypasses authentication

## Session Storage

After successful login, these items are stored in browser sessionStorage:

- `admin_token` - The password (used for API authentication)
- `admin_password` - Duplicate of admin_token (legacy)
- `admin_instance` - The instance ID (e.g., "projecta", "projectb")

## Logout

Access `/logout` to clear session and redirect to login page.

## Troubleshooting

### Login fails with "Invalid password"
1. Verify password hash in `config/{instance}/instance.json` matches your password
2. Restart server after config changes (configs are cached)
3. Check browser console for network errors

### API returns 401 Unauthorized
1. Check that `admin_token` exists in sessionStorage
2. Verify token matches one of the instance password hashes
3. Check server logs for authentication errors

### Redirect to wrong URL
1. Clear browser sessionStorage and try again
2. Verify `redirectUrl` in login response
3. Check that instance config files are properly formatted
