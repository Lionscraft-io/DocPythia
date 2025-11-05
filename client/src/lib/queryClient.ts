import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

export async function adminApiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const adminToken = sessionStorage.getItem("admin_token");

  // If no token, try without auth first (auth might be disabled)
  const headers: Record<string, string> = {
    ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}),
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // If we get 401/403 and have no token, then auth is required
  if ((res.status === 401 || res.status === 403) && !adminToken) {
    throw new Error("Admin token not found. Please login.");
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
  requiresAuth?: boolean;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, requiresAuth = false }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const headers: Record<string, string> = {};

    if (requiresAuth) {
      const adminToken = sessionStorage.getItem("admin_token");
      // Only add auth header if we have a token (auth might be disabled)
      if (adminToken) {
        headers['Authorization'] = `Bearer ${adminToken}`;
      }
    }

    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    // If we get 401/403 and requiresAuth but no token, then auth is actually required
    if ((res.status === 401 || res.status === 403) && requiresAuth) {
      const adminToken = sessionStorage.getItem("admin_token");
      if (!adminToken) {
        throw new Error("Admin token not found. Please login.");
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
