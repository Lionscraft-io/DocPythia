/**
 * Auth Routes Unit Tests
 * Tests for authentication API endpoints
 * Owner: Wayne
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

// Mock dependencies
vi.mock('../server/auth/multi-instance-auth.js', () => ({
  authenticateAnyInstance: vi.fn(),
  authenticateInstance: vi.fn(),
}));

vi.mock('../server/config/instance-loader.js', () => ({
  InstanceConfigLoader: {
    getAvailableInstances: vi.fn(),
  },
}));

// Import mocked modules
import { authenticateAnyInstance, authenticateInstance } from '../server/auth/multi-instance-auth.js';
import { InstanceConfigLoader } from '../server/config/instance-loader.js';
import authRouter from '../server/routes/auth-routes.js';

const mockedAuthenticateAnyInstance = vi.mocked(authenticateAnyInstance);
const mockedAuthenticateInstance = vi.mocked(authenticateInstance);
const mockedGetAvailableInstances = vi.mocked(InstanceConfigLoader.getAvailableInstances);

describe('Auth Routes', () => {
  let app: Express;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.DISABLE_ADMIN_AUTH;

    // Create fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 if password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Password is required',
      });
    });

    it('should return success when auth is disabled', async () => {
      process.env.DISABLE_ADMIN_AUTH = 'true';
      mockedGetAvailableInstances.mockReturnValue(['projecta', 'test']);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'any-password' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        instanceId: 'projecta',
        message: 'Authentication disabled (development mode)',
      });
    });

    it('should return success for valid password', async () => {
      mockedAuthenticateAnyInstance.mockResolvedValue({
        success: true,
        instanceId: 'projecta',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'correct-password' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        instanceId: 'projecta',
        redirectUrl: '/projecta/admin',
      });
      expect(mockedAuthenticateAnyInstance).toHaveBeenCalledWith('correct-password');
    });

    it('should return 401 for invalid password', async () => {
      mockedAuthenticateAnyInstance.mockResolvedValue({
        success: false,
        error: 'Invalid password',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'wrong-password' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid password',
      });
    });

    it('should return 401 with default error when no error message provided', async () => {
      mockedAuthenticateAnyInstance.mockResolvedValue({
        success: false,
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'wrong-password' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid password',
      });
    });

    it('should return 500 on authentication error', async () => {
      mockedAuthenticateAnyInstance.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'test-password' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Internal server error',
      });
    });
  });

  describe('GET /api/auth/instances', () => {
    it('should return available instances', async () => {
      mockedGetAvailableInstances.mockReturnValue(['projecta', 'test', 'demo']);

      const response = await request(app).get('/api/auth/instances');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        instances: ['projecta', 'test', 'demo'],
      });
    });

    it('should return empty array when no instances', async () => {
      mockedGetAvailableInstances.mockReturnValue([]);

      const response = await request(app).get('/api/auth/instances');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        instances: [],
      });
    });

    it('should return 500 on error', async () => {
      mockedGetAvailableInstances.mockImplementation(() => {
        throw new Error('Config error');
      });

      const response = await request(app).get('/api/auth/instances');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to get instances',
      });
    });
  });

  describe('POST /api/auth/verify', () => {
    it('should return 400 if password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({ instanceId: 'projecta' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Password and instanceId are required',
      });
    });

    it('should return 400 if instanceId is missing', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({ password: 'test-password' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Password and instanceId are required',
      });
    });

    it('should return success when auth is disabled', async () => {
      process.env.DISABLE_ADMIN_AUTH = 'true';

      const response = await request(app)
        .post('/api/auth/verify')
        .send({ password: 'any-password', instanceId: 'projecta' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockedAuthenticateInstance).not.toHaveBeenCalled();
    });

    it('should return success for valid credentials', async () => {
      mockedAuthenticateInstance.mockReturnValue(true);

      const response = await request(app)
        .post('/api/auth/verify')
        .send({ password: 'correct-password', instanceId: 'projecta' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockedAuthenticateInstance).toHaveBeenCalledWith('correct-password', 'projecta');
    });

    it('should return 401 for invalid credentials', async () => {
      mockedAuthenticateInstance.mockReturnValue(false);

      const response = await request(app)
        .post('/api/auth/verify')
        .send({ password: 'wrong-password', instanceId: 'projecta' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid credentials',
      });
    });

    it('should return 500 on verification error', async () => {
      mockedAuthenticateInstance.mockImplementation(() => {
        throw new Error('Verification error');
      });

      const response = await request(app)
        .post('/api/auth/verify')
        .send({ password: 'test-password', instanceId: 'projecta' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Internal server error',
      });
    });
  });
});
