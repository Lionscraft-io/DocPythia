import { useQuery } from '@tanstack/react-query';

export interface ProjectConfig {
  name: string;
  shortName: string;
  description: string;
  domain?: string;
  supportEmail?: string;
}

export interface BrandingConfig {
  logo: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  darkModePrimaryColor?: string;
  projectUrl: string;
}

export interface WidgetConfig {
  enabled: boolean;
  title: string;
  welcomeMessage: string;
  suggestedQuestions: string[];
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  theme: 'light' | 'dark' | 'auto';
  primaryColor?: string;
}

export interface FeatureFlags {
  chatEnabled: boolean;
  versionHistoryEnabled: boolean;
}

export interface RepositoryConfig {
  targetRepo: string;
  sourceRepo: string;
  baseBranch: string;
}

export interface AppConfig {
  project: ProjectConfig;
  branding: BrandingConfig;
  widget: WidgetConfig;
  features: FeatureFlags;
  repository: RepositoryConfig;
}

/**
 * Get the instance ID from the current URL path
 * e.g., /near/admin -> "near", /admin -> null
 */
function getInstanceFromPath(): string | null {
  const path = window.location.pathname;
  // Match /:instance/... pattern (but not /admin, /api, etc.)
  const match = path.match(/^\/([a-zA-Z0-9_-]+)\//);
  if (match) {
    const potentialInstance = match[1];
    // Exclude known non-instance routes
    const nonInstanceRoutes = ['api', 'admin', 'docs', 'assets', 'static'];
    if (!nonInstanceRoutes.includes(potentialInstance)) {
      return potentialInstance;
    }
  }
  return null;
}

async function fetchConfig(): Promise<AppConfig> {
  // Determine the correct config endpoint based on current URL
  const instance = getInstanceFromPath();
  const configUrl = instance ? `/${instance}/api/config` : '/api/config';

  const response = await fetch(configUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch configuration');
  }
  return response.json();
}

export function useConfig() {
  const instance = getInstanceFromPath();
  return useQuery({
    queryKey: ['config', instance], // Include instance in key for proper caching per-instance
    queryFn: fetchConfig,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 3,
  });
}
