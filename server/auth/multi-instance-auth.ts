/**
 * Multi-Instance Authentication
 * Tries password against all instances and redirects to correct one
 * Author: Wayne (2025-11-13)
 */

import { verifyPasswordSync } from './password';
import { InstanceConfigLoader } from '../config/instance-loader';

export interface AuthResult {
  success: boolean;
  instanceId?: string;
  error?: string;
}

/**
 * Try password against all available instances
 * Returns the matching instance ID or null
 */
export async function authenticateAnyInstance(password: string): Promise<AuthResult> {
  // Get all available instances
  const availableInstances = InstanceConfigLoader.getAvailableInstances();

  if (availableInstances.length === 0) {
    return {
      success: false,
      error: 'No instances configured'
    };
  }

  // Try password against each instance
  for (const instanceId of availableInstances) {
    try {
      // Load instance config
      const config = InstanceConfigLoader.has(instanceId)
        ? InstanceConfigLoader.get(instanceId)
        : InstanceConfigLoader.load(instanceId);

      // Check if password matches (using sync version for middleware compatibility)
      if (verifyPasswordSync(password, config.admin.passwordHash)) {
        return {
          success: true,
          instanceId
        };
      }
    } catch (error) {
      console.warn(`Failed to check auth for instance "${instanceId}":`, error);
      // Continue to next instance
    }
  }

  // No match found
  return {
    success: false,
    error: 'Invalid password'
  };
}

/**
 * Authenticate for specific instance
 */
export function authenticateInstance(password: string, instanceId: string): boolean {
  try {
    const config = InstanceConfigLoader.has(instanceId)
      ? InstanceConfigLoader.get(instanceId)
      : InstanceConfigLoader.load(instanceId);

    return verifyPasswordSync(password, config.admin.passwordHash);
  } catch (error) {
    console.error(`Authentication failed for instance "${instanceId}":`, error);
    return false;
  }
}
