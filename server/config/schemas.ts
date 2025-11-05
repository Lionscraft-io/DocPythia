// Zod validation schemas for instance configuration
// Multi-instance configuration system - Wayne (2025-10-29)

import { z } from 'zod';

export const ProjectConfigSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  shortName: z.string().min(1, 'Short name is required').regex(/^[a-z0-9-]+$/, 'Short name must be lowercase alphanumeric with hyphens'),
  description: z.string().min(1, 'Description is required'),
  domain: z.string().optional(),
  supportEmail: z.string().email().optional(),
});

export const BrandingConfigSchema = z.object({
  logo: z.string().url('Logo must be a valid URL'),
  favicon: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a valid hex color'),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  darkModePrimaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  projectUrl: z.string().url('Project URL must be valid'),
});

export const DocumentationConfigSchema = z.object({
  gitUrl: z.string().url('Git URL must be valid'),
  branch: z.string().min(1, 'Branch is required'),
  gitUsername: z.string().optional(),
  gitToken: z.string().optional(),
  docsPath: z.string().optional(),
});

export const ZulipConfigSchema = z.object({
  enabled: z.boolean(),
  site: z.string().url().optional(),
  botEmail: z.string().email().optional(),
  apiKey: z.string().optional(),
  channel: z.string().optional(),
}).refine(
  (data) => {
    if (data.enabled) {
      return data.site && data.botEmail && data.apiKey && data.channel;
    }
    return true;
  },
  {
    message: 'When Zulip is enabled, site, botEmail, apiKey, and channel are required',
  }
);

export const TelegramConfigSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string().optional(),
  channelId: z.string().optional(),
}).refine(
  (data) => {
    if (data.enabled) {
      return data.botToken && data.channelId;
    }
    return true;
  },
  {
    message: 'When Telegram is enabled, botToken and channelId are required',
  }
);

export const DiscordConfigSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string().optional(),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
}).refine(
  (data) => {
    if (data.enabled) {
      return data.botToken && data.guildId && data.channelId;
    }
    return true;
  },
  {
    message: 'When Discord is enabled, botToken, guildId, and channelId are required',
  }
);

export const CommunityConfigSchema = z.object({
  zulip: ZulipConfigSchema.optional(),
  telegram: TelegramConfigSchema.optional(),
  discord: DiscordConfigSchema.optional(),
});

export const WidgetConfigSchema = z.object({
  enabled: z.boolean(),
  title: z.string().min(1, 'Widget title is required'),
  welcomeMessage: z.string().min(1, 'Welcome message is required'),
  suggestedQuestions: z.array(z.string()).min(1, 'At least one suggested question is required'),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  theme: z.enum(['light', 'dark', 'auto']),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const FeatureFlagsSchema = z.object({
  ragEnabled: z.boolean(),
  schedulerEnabled: z.boolean(),
  chatEnabled: z.boolean(),
  analyticsEnabled: z.boolean(),
  versionHistoryEnabled: z.boolean(),
});

export const AdminConfigSchema = z.object({
  token: z.string().min(8, 'Admin token must be at least 8 characters'),
  allowedOrigins: z.array(z.string()).optional(),
});

export const InstanceConfigSchema = z.object({
  project: ProjectConfigSchema,
  branding: BrandingConfigSchema,
  documentation: DocumentationConfigSchema,
  community: CommunityConfigSchema,
  widget: WidgetConfigSchema,
  features: FeatureFlagsSchema,
  admin: AdminConfigSchema,
});
