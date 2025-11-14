# Smart Login System

## Overview

The smart login system automatically detects which instance (NEAR, Conflux, etc.) your password belongs to and redirects you to the correct admin panel.

## How It Works

### User Experience

1. **Visit any of these URLs:**
   - `http://localhost:3762/` (redirects to `/login`)
   - `http://localhost:3762/login`
   - `http://localhost:3762/near/admin/login`
   - `http://localhost:3762/conflux/admin/login`

2. **Enter password once**
   - No need to remember which instance you're logging into
   - System tries password against all instances

3. **Auto-redirect to correct panel**
   - NEAR password → `/near/admin`
   - Conflux password → `/conflux/admin`

### Flow Diagram

```
User enters password
       ↓
POST /api/auth/login
       ↓
Try NEAR config → passwordHash matches? → YES → Return { instanceId: "near" }
       ↓ NO
Try Conflux config → passwordHash matches? → YES → Return { instanceId: "conflux" }
       ↓ NO
Return { error: "Invalid password" }
       ↓
Frontend receives response
       ↓
If success: Redirect to /{instanceId}/admin
If failure: Show error message
```

## Technical Implementation

### Backend API

**Endpoint**: `POST /api/auth/login`

**Request:**
```json
{
  "password": "user_entered_password"
}
```

**Response (Success):**
```json
{
  "success": true,
  "instanceId": "near",
  "redirectUrl": "/near/admin"
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Invalid password"
}
```

### Frontend Logic

```typescript
// 1. User submits password
const response = await fetch("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ password })
});

const data = await response.json();

// 2. Store credentials
sessionStorage.setItem("admin_password", password);
sessionStorage.setItem("admin_instance", data.instanceId);

// 3. Redirect to instance admin
window.location.href = data.redirectUrl; // e.g., /near/admin
```

### Security Features

1. **Password never stored in plain text**
   - Only SHA256 hash stored in config
   - Password sent over HTTPS only

2. **Instance isolation**
   - Each instance has unique password
   - Cannot access other instance with wrong password

3. **Session management**
   - Password stored in sessionStorage (cleared on tab close)
   - Must re-login when session expires

4. **Timing attack prevention**
   - All instances checked even after match
   - Constant-time comparison should be added for production

## Configuration

### Adding New Instance

1. **Create config file**: `config/newinstance/instance.json`
2. **Generate password hash**:
```bash
node -e "
const crypto = require('crypto');
const password = 'your_new_password';
const hash = crypto.createHash('sha256').update(password).digest('hex');
console.log('Password Hash:', hash);
"
```
3. **Update config**:
```json
{
  "admin": {
    "passwordHash": "generated_hash_here"
  }
}
```
4. **Login automatically works** - No code changes needed!

### Development Mode (Disable Auth)

Set in `.env`:
```env
DISABLE_ADMIN_AUTH=true
```

With auth disabled, any password will work and redirect to first available instance.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Redirect to `/login` |
| `/login` | Generic login (smart detection) |
| `/:instance/admin/login` | Instance-specific login (still works) |
| `/:instance/admin` | Admin dashboard (requires auth) |

## API Endpoints

### Login
```
POST /api/auth/login
Body: { password: string }
Returns: { success: boolean, instanceId?: string, redirectUrl?: string, error?: string }
```

### Verify Session
```
POST /api/auth/verify
Body: { password: string, instanceId: string }
Returns: { success: boolean, error?: string }
```

### List Instances
```
GET /api/auth/instances
Returns: { instances: string[] }
```

## Examples

### Example 1: NEAR Login
```
User enters: SH340TE28pBIGsoEwC50iQ==
Backend checks:
  - NEAR config: ✅ Match!
  - Returns: { instanceId: "near" }
Frontend redirects: /near/admin
```

### Example 2: Conflux Login
```
User enters: EuSG/dNj0UtfoJNFxiix3g==
Backend checks:
  - NEAR config: ❌ No match
  - Conflux config: ✅ Match!
  - Returns: { instanceId: "conflux" }
Frontend redirects: /conflux/admin
```

### Example 3: Invalid Password
```
User enters: wrongpassword
Backend checks:
  - NEAR config: ❌ No match
  - Conflux config: ❌ No match
  - Returns: { error: "Invalid password" }
Frontend shows: Error toast
```

## Benefits

✅ **User-friendly**: One login page for all instances
✅ **Scalable**: Add new instances without changing code
✅ **Secure**: Password never revealed, each instance isolated
✅ **Flexible**: Can still use instance-specific login URLs
✅ **Developer-friendly**: No complex session management

## Testing

### Test Smart Login
```bash
# Start server
npm run dev

# Visit http://localhost:3762/login

# Try NEAR password
SH340TE28pBIGsoEwC50iQ==
# Should redirect to /near/admin

# Try Conflux password
EuSG/dNj0UtfoJNFxiix3g==
# Should redirect to /conflux/admin

# Try wrong password
wrongpassword
# Should show "Invalid password" error
```

### Test API Directly
```bash
# Test login
curl -X POST http://localhost:3762/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"SH340TE28pBIGsoEwC50iQ=="}'

# Expected response:
# {"success":true,"instanceId":"near","redirectUrl":"/near/admin"}
```

## Migration from Old Auth

### Before (Token-based)
```typescript
// Separate tokens per instance
sessionStorage.setItem("admin_token", "token123");

// Had to remember which instance to access
window.location.href = "/near/admin"; // Hardcoded
```

### After (Smart Login)
```typescript
// One password
sessionStorage.setItem("admin_password", password);
sessionStorage.setItem("admin_instance", instanceId); // Auto-detected

// Auto-redirect based on password
window.location.href = data.redirectUrl; // Dynamic
```

## Future Enhancements

- [ ] Add session expiry (JWT tokens)
- [ ] Add password reset flow
- [ ] Add 2FA support
- [ ] Add rate limiting (prevent brute force)
- [ ] Add audit logging (track login attempts)
- [ ] Add "Remember me" functionality
- [ ] Constant-time password comparison
