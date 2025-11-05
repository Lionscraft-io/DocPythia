// Default configuration (NEAR Protocol)
// Multi-instance configuration system - Wayne (2025-10-29)

import type { InstanceConfig } from './types';

export const defaultConfig: InstanceConfig = {
  project: {
    name: 'NearDocs AI',
    shortName: 'near',
    description: 'AI-powered documentation assistant for NEAR Protocol',
    domain: 'neardocs.ai',
    supportEmail: 'support@neardocs.ai',
  },

  branding: {
    logo: 'https://near.org/wp-content/themes/near-19/assets/img/logo.svg',
    favicon: 'https://near.org/wp-content/themes/near-19/assets/img/favicon.ico',
    primaryColor: '#00EC97',
    secondaryColor: '#000000',
    accentColor: '#0072CE',
    darkModePrimaryColor: '#00EC97',
    projectUrl: 'https://near.org',
  },

  documentation: {
    gitUrl: 'https://github.com/near/docs',
    branch: 'main',
    docsPath: '',
  },

  community: {
    zulip: {
      enabled: false,
      site: 'https://near.zulipchat.com',
      channel: 'community-support',
    },
    telegram: {
      enabled: false,
    },
    discord: {
      enabled: false,
    },
  },

  widget: {
    enabled: true,
    title: 'NEAR Assistant',
    welcomeMessage: 'Hello! I\'m your NEAR Protocol documentation assistant. How can I help you today?',
    suggestedQuestions: [
      'How do I set up a validator node?',
      'What are the hardware requirements for RPC nodes?',
      'How do I stake NEAR tokens?',
      'What is sharding in NEAR?',
    ],
    position: 'bottom-right',
    theme: 'auto',
  },

  features: {
    ragEnabled: false,
    schedulerEnabled: false,
    chatEnabled: true,
    analyticsEnabled: false,
    versionHistoryEnabled: true,
  },

  admin: {
    token: 'change_me_in_production',
    allowedOrigins: ['http://localhost:3762', 'http://localhost:5173'],
  },
};
