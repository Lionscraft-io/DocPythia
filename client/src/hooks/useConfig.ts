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

async function fetchConfig(): Promise<AppConfig> {
  const response = await fetch('/api/config');
  if (!response.ok) {
    throw new Error('Failed to fetch configuration');
  }
  return response.json();
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 3,
  });
}
