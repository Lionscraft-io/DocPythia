import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function Logout() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Clear all session storage
    sessionStorage.removeItem("admin_password");
    sessionStorage.removeItem("admin_instance");
    sessionStorage.removeItem("admin_token");
    sessionStorage.clear();

    // Clear all cached queries
    queryClient.clear();

    // Redirect to login page
    setTimeout(() => {
      setLocation("/login");
    }, 100);
  }, [setLocation, queryClient]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Logging out...</h2>
        <p className="text-gray-600">Redirecting to login page...</p>
      </div>
    </div>
  );
}
