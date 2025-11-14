/**
 * Instance-Aware Configuration Loader
 * Supports multi-tenant configuration with per-instance databases
 * Author: Wayne (2025-11-13)
 */

import fs from 'fs';
import path from 'path';
import { defaultConfig } from './defaults';
import { InstanceConfigSchema } from './schemas';
import type { InstanceConfig, ResolvedConfig } from './types';

export class InstanceConfigLoader {
  private static instances: Map<string, ResolvedConfig> = new Map();

  /**
   * Load configuration for a specific instance
   * @param instanceId - Instance identifier (e.g., "near", "conflux")
   */
  static load(instanceId: string): ResolvedConfig {
    // Return cached config if available
    const cached = this.instances.get(instanceId);
    if (cached) {
      return cached;
    }

    console.log(`🔧 Loading configuration for instance: ${instanceId}`);

    // Layer 1: Start with defaults
    let config: InstanceConfig = JSON.parse(JSON.stringify(defaultConfig));
    const source = {
      file: false,
      env: false,
      defaults: true,
    };

    // Layer 2: Override with instance-specific file
    const fileConfig = this.loadFromFile(instanceId);
    if (fileConfig) {
      config = this.deepMerge(config, fileConfig);
      source.file = true;
      console.log(`✓ Loaded configuration from config/${instanceId}/instance.json`);
    } else {
      console.log(`ℹ No config file found for instance "${instanceId}", using defaults`);
    }

    // Layer 3: Override with environment variables (instance-specific)
    const envConfig = this.loadFromEnv(instanceId);
    if (envConfig) {
      config = this.deepMerge(config, envConfig);
      source.env = true;
      console.log('✓ Applied environment variable overrides');
    }

    // Validate final configuration
    try {
      const validated = InstanceConfigSchema.parse(config);
      const resolvedConfig: ResolvedConfig = {
        ...validated,
        _source: source,
      };

      // Cache the configuration
      this.instances.set(instanceId, resolvedConfig);

      console.log(`✅ Configuration loaded for ${instanceId}: ${resolvedConfig.project.name}`);
      console.log(`   Database: ${resolvedConfig.database.name}`);
      console.log(`   Documentation: ${resolvedConfig.documentation.gitUrl}`);

      return resolvedConfig;
    } catch (error) {
      console.error(`❌ Configuration validation failed for instance "${instanceId}":`, error);
      throw new Error(`Invalid configuration for instance "${instanceId}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get configuration for instance (must be loaded first)
   */
  static get(instanceId: string): ResolvedConfig {
    const config = this.instances.get(instanceId);
    if (!config) {
      throw new Error(`Configuration not loaded for instance "${instanceId}". Call load() first.`);
    }
    return config;
  }

  /**
   * Check if instance configuration exists
   */
  static has(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

  /**
   * Reload configuration for instance (clears cache)
   */
  static reload(instanceId: string): ResolvedConfig {
    this.instances.delete(instanceId);
    return this.load(instanceId);
  }

  /**
   * Get list of available instances
   */
  static getAvailableInstances(): string[] {
    const configDir = path.join(process.cwd(), 'config');
    if (!fs.existsSync(configDir)) {
      return [];
    }

    const entries = fs.readdirSync(configDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  }

  /**
   * Load configuration from instance-specific file
   */
  private static loadFromFile(instanceId: string): Partial<InstanceConfig> | null {
    const configPath = path.join(process.cwd(), 'config', instanceId, 'instance.json');

    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`⚠️  Failed to parse config file for "${instanceId}":`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Load instance-specific environment variables
   */
  private static loadFromEnv(instanceId: string): Partial<InstanceConfig> | null {
    const env = process.env;
    const envPrefix = instanceId.toUpperCase();
    const envConfig: Partial<InstanceConfig> = {};

    // Instance-specific env vars have format: NEAR_PROJECT_NAME, CONFLUX_PROJECT_NAME, etc.
    // But we also support non-prefixed for backward compatibility

    // Database config
    const dbName = env[`${envPrefix}_DATABASE_NAME`] || env.DATABASE_NAME;
    if (dbName) {
      envConfig.database = { name: dbName };
    }

    // Project config
    if (env[`${envPrefix}_PROJECT_NAME`] || env.PROJECT_NAME) {
      envConfig.project = {
        ...(env[`${envPrefix}_PROJECT_NAME`] && { name: env[`${envPrefix}_PROJECT_NAME`] }),
        ...(env[`${envPrefix}_PROJECT_SHORT_NAME`] && { shortName: env[`${envPrefix}_PROJECT_SHORT_NAME`] }),
        ...(env[`${envPrefix}_PROJECT_DESCRIPTION`] && { description: env[`${envPrefix}_PROJECT_DESCRIPTION`] }),
      } as any;
    }

    return Object.keys(envConfig).length > 0 ? envConfig : null;
  }

  /**
   * Deep merge two objects
   */
  private static deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (sourceValue === undefined) {
        continue;
      }

      if (
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        result[key] = this.deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue as any;
      }
    }

    return result;
  }
}

// Export convenience functions
export function loadInstanceConfig(instanceId: string): ResolvedConfig {
  return InstanceConfigLoader.load(instanceId);
}

export function getInstanceConfig(instanceId: string): ResolvedConfig {
  return InstanceConfigLoader.get(instanceId);
}
