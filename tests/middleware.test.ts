/**
 * Middleware Tests
 * Tests for instance and admin auth middleware
 * Owner: Wayne
 * Date: 2025-12-23
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { hashPasswordSync } from '../server/auth/password.js';

// Mock dependencies
vi.mock('../server/config/instance-loader.js', () => ({
  loadInstanceConfig: vi.fn(),
  InstanceConfigLoader: {
    getAvailableInstances: vi.fn(),
    has: vi.fn(),
    get: vi.fn(),
    load: vi.fn(),
  },
}));

vi.mock('../server/db/instance-db.js', () => ({
  getInstanceDb: vi.fn(),
}));

import { InstanceConfigLoader, loadInstanceConfig } from '../server/config/instance-loader.js';
import { getInstanceDb } from '../server/db/instance-db.js';
import {
  instanceMiddleware,
  requireInstance,
  getInstanceInfo,
} from '../server/middleware/instance.js';
import { multiInstanceAdminAuth } from '../server/middleware/multi-instance-admin-auth.js';

// Helper to create mock request/response/next
function createMockReqResNext() {
  const req: Partial<Request> = {
    params: {},
    headers: {},
    url: '/test',
    path: '/test',
  };
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next: NextFunction = vi.fn();

  return { req: req as Request, res: res as Response, next };
}

describe('Instance Middleware', () => {
  const mockConfig = {
    project: { name: 'Test Project' },
    branding: { logo: 'logo.png' },
    features: { enabled: true },
    widget: { enabled: true },
  };

  const mockDb = { $connect: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_ADMIN_AUTH;
  });

  describe('instanceMiddleware', () => {
    it('should skip when no instance in params', () => {
      const { req, res, next } = createMockReqResNext();

      instanceMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith('route');
    });

    it('should skip for unrecognized instance', () => {
      const { req, res, next } = createMockReqResNext();
      req.params = { instance: 'unknown' };
      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'projecta',
        'projectb',
      ]);

      instanceMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith('route');
    });

    it('should attach instance context for recognized instance', () => {
      const { req, res, next } = createMockReqResNext();
      req.params = { instance: 'test' };

      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'test',
      ]);
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
      vi.mocked(InstanceConfigLoader.get).mockReturnValue(mockConfig as any);
      vi.mocked(getInstanceDb).mockReturnValue(mockDb as any);

      instanceMiddleware(req, res, next);

      expect(req.instance).toBeDefined();
      expect(req.instance?.id).toBe('test');
      expect(req.instance?.config).toBe(mockConfig);
      expect(req.instance?.db).toBe(mockDb);
      expect(next).toHaveBeenCalledWith();
    });

    it('should load config if not cached', () => {
      const { req, res, next } = createMockReqResNext();
      req.params = { instance: 'test' };

      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'test',
      ]);
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(false);
      vi.mocked(loadInstanceConfig).mockReturnValue(mockConfig as any);
      vi.mocked(getInstanceDb).mockReturnValue(mockDb as any);

      instanceMiddleware(req, res, next);

      expect(loadInstanceConfig).toHaveBeenCalledWith('test');
      expect(next).toHaveBeenCalledWith();
    });

    it('should return 404 when config load fails', () => {
      const { req, res, next } = createMockReqResNext();
      req.params = { instance: 'test' };

      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'test',
      ]);
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(false);
      vi.mocked(loadInstanceConfig).mockImplementation(() => {
        throw new Error('Config not found');
      });

      instanceMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Instance not found',
        })
      );
    });

    it('should handle lowercase instance ID', () => {
      const { req, res, next } = createMockReqResNext();
      req.params = { instance: 'TEST' };

      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'test',
      ]);
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
      vi.mocked(InstanceConfigLoader.get).mockReturnValue(mockConfig as any);
      vi.mocked(getInstanceDb).mockReturnValue(mockDb as any);

      instanceMiddleware(req, res, next);

      expect(req.instance?.id).toBe('test');
    });
  });

  describe('requireInstance', () => {
    it('should call next when instance exists', () => {
      const { req, res, next } = createMockReqResNext();
      req.instance = { id: 'test', config: mockConfig as any, db: mockDb as any };

      requireInstance(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 when no instance', () => {
      const { req, res, next } = createMockReqResNext();

      requireInstance(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'No instance context',
        })
      );
    });
  });

  describe('getInstanceInfo', () => {
    it('should return instance info', () => {
      const { req, res } = createMockReqResNext();
      req.instance = { id: 'test', config: mockConfig as any, db: mockDb as any };

      getInstanceInfo(req, res);

      expect(res.json).toHaveBeenCalledWith({
        instanceId: 'test',
        project: mockConfig.project,
        branding: mockConfig.branding,
        features: mockConfig.features,
        widget: mockConfig.widget,
      });
    });

    it('should return 400 when no instance', () => {
      const { req, res } = createMockReqResNext();

      getInstanceInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});

describe('Multi-Instance Admin Auth Middleware', () => {
  const testPassword = 'adminPassword123';
  const testPasswordHash = hashPasswordSync(testPassword);

  const mockConfig = {
    admin: {
      passwordHash: testPasswordHash,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_ADMIN_AUTH;
  });

  it('should skip auth when DISABLE_ADMIN_AUTH is true', () => {
    process.env.DISABLE_ADMIN_AUTH = 'true';
    const { req, res, next } = createMockReqResNext();

    multiInstanceAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 401 when no authorization header', () => {
    const { req, res, next } = createMockReqResNext();

    multiInstanceAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized: Missing or invalid token',
    });
  });

  it('should return 401 when authorization header is not Bearer', () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: 'Basic token123' };

    multiInstanceAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should authenticate valid token', () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: `Bearer ${testPassword}` };

    vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
      'test',
    ]);
    vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
    vi.mocked(InstanceConfigLoader.get).mockReturnValue(mockConfig as any);

    multiInstanceAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).adminInstance).toBe('test');
  });

  it('should return 403 for invalid token', () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: 'Bearer wrongPassword' };

    vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
      'test',
    ]);
    vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
    vi.mocked(InstanceConfigLoader.get).mockReturnValue(mockConfig as any);

    multiInstanceAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden: Invalid admin token',
    });
  });

  it('should try all instances until match found', () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: `Bearer ${testPassword}` };

    const wrongConfig = {
      admin: { passwordHash: hashPasswordSync('wrong') },
    };

    vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
      'wrong1',
      'correct',
    ]);
    vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
    vi.mocked(InstanceConfigLoader.get).mockImplementation((id: string) => {
      if (id === 'correct') return mockConfig as any;
      return wrongConfig as any;
    });

    multiInstanceAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).adminInstance).toBe('correct');
  });

  it('should load config if not cached', () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: `Bearer ${testPassword}` };

    vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
      'test',
    ]);
    vi.mocked(InstanceConfigLoader.has).mockReturnValue(false);
    vi.mocked(InstanceConfigLoader.load).mockReturnValue(mockConfig as any);

    multiInstanceAdminAuth(req, res, next);

    expect(InstanceConfigLoader.load).toHaveBeenCalledWith('test');
    expect(next).toHaveBeenCalled();
  });

  it('should continue to next instance on config error', () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: `Bearer ${testPassword}` };

    vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
      'broken',
      'working',
    ]);
    vi.mocked(InstanceConfigLoader.has).mockReturnValue(false);
    vi.mocked(InstanceConfigLoader.load).mockImplementation((id: string) => {
      if (id === 'broken') throw new Error('Config error');
      return mockConfig as any;
    });

    multiInstanceAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).adminInstance).toBe('working');
  });
});
