# 🤖 NearDocs AI Widget System

A complete dropdown widget system with iframe support for embedding NearDocs AI assistance on any website.

## 🚀 Quick Start

### Simple Integration (Auto-init)
```html
<script src="https://experthub.lionscraft.io/widget.js"></script>
<div data-neardocs-widget data-expert-id="default" data-theme="light"></div>
```

### Manual Integration
```html
<script src="https://experthub.lionscraft.io/widget.js"></script>
<script>
  NearDocsWidget.init({
    expertId: 'default',
    theme: 'light',
    position: 'bottom-right',
    title: 'NEAR Help'
  });
</script>
```

### Direct Iframe Embedding
```html
<iframe
  src="https://experthub.lionscraft.io/widget/default?theme=light&embedded=true"
  width="350"
  height="500"
  frameborder="0"
  title="NearDocs AI Widget"
></iframe>
```

## 📋 API Endpoints

### Widget Endpoints
- `GET /widget/:expertId` - Serves widget iframe HTML
- `GET /widget.js` - Serves widget JavaScript library
- `GET /widget-demo` - Interactive demo page

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `expertId` | string | `'default'` | Expert/assistant identifier |
| `theme` | string | `'light'` | Widget theme (`'light'` or `'dark'`) |
| `position` | string | `'bottom-right'` | Widget position on page |
| `title` | string | `'NearDocs AI'` | Widget title/header text |

### Position Options
- `bottom-right` - Bottom right corner (default)
- `bottom-left` - Bottom left corner
- `top-right` - Top right corner
- `top-left` - Top left corner

## 🎨 Themes

### Light Theme
- Clean white background
- Blue accent colors
- Optimized for light websites

### Dark Theme
- Dark gray/black background
- High contrast text
- Optimized for dark websites

## 🔧 Environment Configuration

### Docker Build Arguments
```bash
docker build --build-arg WIDGET_DOMAIN=https://your-domain.com .
```

### Environment Variables
```bash
WIDGET_DOMAIN=https://experthub.lionscraft.io  # Production domain
WIDGET_DOMAIN=http://localhost:5173              # Local development
```

### Local Development
```bash
# Frontend (Vite dev server)
WIDGET_DOMAIN=http://localhost:5173

# Backend proxy setup in vite.config.ts handles API routing
```

### Production Deployment
```bash
# AWS App Runner / Production
WIDGET_DOMAIN=https://experthub.lionscraft.io
```

## 🛡️ Security Features

- **Iframe Sandboxing** - Secure isolation from parent page
- **CORS Protection** - Origin validation for postMessage
- **CSP Headers** - Content Security Policy protection
- **X-Frame-Options** - Prevents embedding in unauthorized sites
- **Message Validation** - Only accepts messages from configured domain

## 💬 Inter-frame Communication

The widget uses `postMessage` for secure communication:

### Widget → Parent Messages
```javascript
// Widget loaded successfully
{ type: 'WIDGET_LOADED', expertId: 'default' }

// Widget requests to close
{ type: 'WIDGET_CLOSE' }

// Widget requests resize (future)
{ type: 'WIDGET_RESIZE', height: 600 }
```

### Parent → Widget Messages
```javascript
// Close widget programmatically
window.postMessage({ type: 'WIDGET_CLOSE' }, '*');
```

## 🎯 Integration Examples

### React Component
```jsx
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // Load widget script
    const script = document.createElement('script');
    script.src = 'https://experthub.lionscraft.io/widget.js';
    script.onload = () => {
      window.NearDocsWidget.init({
        expertId: 'default',
        theme: 'light',
        position: 'bottom-right'
      });
    };
    document.head.appendChild(script);
  }, []);

  return <div>Your React App</div>;
}
```

### Vue.js Component
```vue
<template>
  <div>Your Vue App</div>
</template>

<script>
export default {
  mounted() {
    const script = document.createElement('script');
    script.src = 'https://experthub.lionscraft.io/widget.js';
    script.onload = () => {
      window.NearDocsWidget.init({
        expertId: 'default',
        theme: 'dark',
        position: 'bottom-left'
      });
    };
    document.head.appendChild(script);
  }
}
</script>
```

### WordPress
```php
// Add to functions.php or widget
function add_neardocs_widget() {
    ?>
    <script src="https://experthub.lionscraft.io/widget.js"></script>
    <div data-neardocs-widget data-theme="light" data-position="bottom-right"></div>
    <?php
}
add_action('wp_footer', 'add_neardocs_widget');
```

## 🧪 Testing

### Demo Page
Visit `/widget-demo` to see the widget in action with different configurations:

```
https://experthub.lionscraft.io/widget-demo
```

### Local Testing
```bash
# Start development server
npm run dev

# Visit demo page
http://localhost:5173/widget-demo
```

## 📱 Mobile Responsiveness

The widget automatically adapts to mobile devices:
- Responsive sizing on smaller screens
- Touch-friendly interface
- Optimized for mobile browsers
- Maintains functionality across devices

## 🔍 Browser Support

- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Edge 79+
- ✅ Mobile browsers

## 🚀 Performance

- **Lazy Loading** - Iframe content loads only when widget opens
- **Caching** - Static assets cached for 24 hours
- **Minimal Bundle** - Lightweight JavaScript library
- **CDN Ready** - Optimized for CDN delivery

## 📞 Support

For widget integration support:
1. Check the demo page for examples
2. Review browser console for error messages
3. Verify domain configuration matches deployment
4. Ensure CORS settings allow your domain

## 🔄 Updates

The widget system supports seamless updates:
- JavaScript library updates automatically
- No changes needed to embedded code
- Backward compatibility maintained
- Version-specific endpoints available if needed