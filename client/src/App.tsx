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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <DropdownWidget
          title="AI Assistant"
          expertId="5"
          domain={import.meta.env.VITE_WIDGET_DOMAIN || "http://localhost:5173"}
          theme="light"
          position="top-right"
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
