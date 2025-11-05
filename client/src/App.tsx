import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownWidget } from "@/components/DropdownWidget";
import Documentation from "@/pages/Documentation";
import Admin from "@/pages/Admin";
import AdminLogin from "@/pages/AdminLogin";
import NotFound from "@/pages/not-found";
import { useConfig } from "@/hooks/useConfig";
import { useEffect } from "react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Documentation} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { data: config } = useConfig();

  // Update document title and meta tags when config loads
  useEffect(() => {
    if (config) {
      // Update document title
      document.title = config.project.name;

      // Update meta description
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', config.project.description);
      }

      // Update favicon if provided
      if (config.branding.favicon) {
        const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (favicon) {
          favicon.href = config.branding.favicon;
        } else {
          const newFavicon = document.createElement('link');
          newFavicon.rel = 'icon';
          newFavicon.href = config.branding.favicon;
          document.head.appendChild(newFavicon);
        }
      }
    }
  }, [config]);

  return (
    <>
      <Toaster />
      <Router />
      {config?.widget.enabled && (
        <DropdownWidget
          title={config.widget.title}
          expertId="5"
          domain={import.meta.env.VITE_WIDGET_DOMAIN || "http://localhost:5173"}
          theme={config.widget.theme}
          position={config.widget.position}
        />
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
