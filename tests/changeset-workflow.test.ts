/**
 * Unit Tests: Changeset Workflow
 * Tests for proposal status management, editing, and conversation state transitions
 * Author: Wayne
 * Date: 2025-11-04
 * Reference: /docs/specs/admin-changeset-workflow.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import express from 'express';
import { registerAdminStreamRoutes } from '../server/stream/routes/admin-routes';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

// Mock admin auth middleware
const mockAdminAuth = (req: any, res: any, next: any) => {
  req.user = { id: 'admin', role: 'admin' };
  next();
};

// Register routes with mock auth
registerAdminStreamRoutes(app, mockAdminAuth);

describe('Changeset Workflow', () => {
  let conversationId: string;
  let proposal1Id: number;
  let proposal2Id: number;
  let proposal3Id: number;

  beforeEach(async () => {
    // Create test conversation and proposals
    conversationId = `test-conv-${Date.now()}`;

    // Create stream config (required for foreign key)
    await prisma.streamConfig.upsert({
      where: { streamId: 'test-stream' },
      update: {},
      create: {
        streamId: 'test-stream',
        adapterType: 'test',
        enabled: true,
        config: {},
      },
    });

    // Create test messages
    const message1 = await prisma.unifiedMessage.create({
      data: {
        streamId: 'test-stream',
        messageId: `msg-${Date.now()}-1`,
        author: 'test-user',
        content: 'Test message 1',
        timestamp: new Date(),
        channel: 'test-channel',
        processingStatus: 'COMPLETED',
        metadata: {},
        rawData: {},
      },
    });

    const message2 = await prisma.unifiedMessage.create({
      data: {
        streamId: 'test-stream',
        messageId: `msg-${Date.now()}-2`,
        author: 'test-user',
        content: 'Test message 2',
        timestamp: new Date(),
        channel: 'test-channel',
        processingStatus: 'COMPLETED',
        metadata: {},
        rawData: {},
      },
    });

    // Create classifications
    await prisma.messageClassification.create({
      data: {
        messageId: message1.id,
        category: 'feature-request',
        conversationId,
        docValueReason: 'Test reason',
        batchId: 'test-batch',
      },
    });

    await prisma.messageClassification.create({
      data: {
        messageId: message2.id,
        category: 'feature-request',
        conversationId,
        docValueReason: 'Test reason',
        batchId: 'test-batch',
      },
    });

    // Create proposals
    const p1 = await prisma.docProposal.create({
      data: {
        conversationId,
        batchId: 'test-batch',
        page: 'test-page.md',
        updateType: 'INSERT',
        section: 'Test Section',
        suggestedText: 'Original test text 1',
        reasoning: 'Test reasoning',
        status: 'pending',
        modelUsed: 'test-model',
      },
    });
    proposal1Id = p1.id;

    const p2 = await prisma.docProposal.create({
      data: {
        conversationId,
        batchId: 'test-batch',
        page: 'test-page.md',
        updateType: 'UPDATE',
        section: 'Test Section 2',
        suggestedText: 'Original test text 2',
        reasoning: 'Test reasoning',
        status: 'pending',
        modelUsed: 'test-model',
      },
    });
    proposal2Id = p2.id;

    const p3 = await prisma.docProposal.create({
      data: {
        conversationId,
        batchId: 'test-batch',
        page: 'test-page.md',
        updateType: 'DELETE',
        section: 'Test Section 3',
        suggestedText: 'Original test text 3',
        reasoning: 'Test reasoning',
        status: 'pending',
        modelUsed: 'test-model',
      },
    });
    proposal3Id = p3.id;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.docProposal.deleteMany({
      where: { conversationId },
    });
    await prisma.messageClassification.deleteMany({
      where: { conversationId },
    });
    await prisma.unifiedMessage.deleteMany({
      where: { streamId: 'test-stream' },
    });
    await prisma.streamConfig.deleteMany({
      where: { streamId: 'test-stream' },
    });
  });

  describe('Proposal Status Management', () => {
    it('should change proposal status to approved', async () => {
      const response = await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({
          status: 'approved',
          reviewedBy: 'test-admin',
        });

      expect(response.status).toBe(200);
      expect(response.body.proposal.status).toBe('approved');
      expect(response.body.proposal.adminApproved).toBe(true);
      expect(response.body.proposal.adminReviewedBy).toBe('test-admin');
      expect(response.body.proposal.adminReviewedAt).toBeTruthy();
    });

    it('should change proposal status to ignored', async () => {
      const response = await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({
          status: 'ignored',
          reviewedBy: 'test-admin',
        });

      expect(response.status).toBe(200);
      expect(response.body.proposal.status).toBe('ignored');
      expect(response.body.proposal.adminApproved).toBe(false);
    });

    it('should reset proposal status to pending', async () => {
      // First approve it
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({
          status: 'approved',
          reviewedBy: 'test-admin',
        });

      // Then reset it
      const response = await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({
          status: 'pending',
          reviewedBy: 'test-admin',
        });

      expect(response.status).toBe(200);
      expect(response.body.proposal.status).toBe('pending');
      expect(response.body.proposal.adminReviewedAt).toBeNull();
      expect(response.body.proposal.adminReviewedBy).toBeNull();
    });
  });

  describe('Conversation Status Calculation', () => {
    it('should return pending status when at least one proposal is pending', async () => {
      // Approve first proposal
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      // Leave second pending, ignore third
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal3Id}/status`)
        .send({ status: 'ignored', reviewedBy: 'test-admin' });

      const response = await request(app)
        .post(`/api/admin/stream/proposals/${proposal2Id}/status`)
        .send({ status: 'pending', reviewedBy: 'test-admin' });

      expect(response.body.conversationStatus).toBe('pending');
    });

    it('should return changeset status when all processed and at least one approved', async () => {
      // Approve first two proposals
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal2Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      // Ignore third proposal
      const response = await request(app)
        .post(`/api/admin/stream/proposals/${proposal3Id}/status`)
        .send({ status: 'ignored', reviewedBy: 'test-admin' });

      expect(response.body.conversationStatus).toBe('changeset');
    });

    it('should return discarded status when all proposals ignored', async () => {
      // Ignore all proposals
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'ignored', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal2Id}/status`)
        .send({ status: 'ignored', reviewedBy: 'test-admin' });

      const response = await request(app)
        .post(`/api/admin/stream/proposals/${proposal3Id}/status`)
        .send({ status: 'ignored', reviewedBy: 'test-admin' });

      expect(response.body.conversationStatus).toBe('discarded');
    });
  });

  describe('Proposal Text Editing', () => {
    it('should update proposal text', async () => {
      const newText = 'Updated proposal text with new content';

      const response = await request(app)
        .patch(`/api/admin/stream/proposals/${proposal1Id}`)
        .send({
          suggestedText: newText,
          editedBy: 'test-admin',
        });

      expect(response.status).toBe(200);
      expect(response.body.proposal.editedText).toBe(newText);
      expect(response.body.proposal.editedBy).toBe('test-admin');
      expect(response.body.proposal.editedAt).toBeTruthy();

      // Verify in database
      const updated = await prisma.docProposal.findUnique({
        where: { id: proposal1Id },
      });
      expect(updated?.editedText).toBe(newText);
    });

    it('should reject text exceeding 10,000 characters', async () => {
      const longText = 'a'.repeat(10001);

      const response = await request(app)
        .patch(`/api/admin/stream/proposals/${proposal1Id}`)
        .send({
          suggestedText: longText,
          editedBy: 'test-admin',
        });

      expect(response.status).toBe(500); // Zod validation errors return 500
    });

    it('should preserve original suggestedText when editing', async () => {
      const originalText = 'Original test text 1';
      const newText = 'Updated text';

      await request(app)
        .patch(`/api/admin/stream/proposals/${proposal1Id}`)
        .send({
          suggestedText: newText,
          editedBy: 'test-admin',
        });

      const proposal = await prisma.docProposal.findUnique({
        where: { id: proposal1Id },
      });

      expect(proposal?.suggestedText).toBe(originalText);
      expect(proposal?.editedText).toBe(newText);
    });
  });

  describe('Conversation Filtering by Status', () => {
    it('should filter conversations by pending status', async () => {
      const response = await request(app)
        .get('/api/admin/stream/conversations')
        .query({ status: 'pending', page: 1, limit: 10 });

      expect(response.status).toBe(200);
      const convIds = response.body.data.map((c: any) => c.conversation_id);
      expect(convIds).toContain(conversationId);
    });

    it('should filter conversations by changeset status', async () => {
      // Approve all proposals
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal2Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal3Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      const response = await request(app)
        .get('/api/admin/stream/conversations')
        .query({ status: 'changeset', page: 1, limit: 10 });

      expect(response.status).toBe(200);
      const convIds = response.body.data.map((c: any) => c.conversation_id);
      expect(convIds).toContain(conversationId);
    });

    it('should filter conversations by discarded status', async () => {
      // Ignore all proposals
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'ignored', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal2Id}/status`)
        .send({ status: 'ignored', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal3Id}/status`)
        .send({ status: 'ignored', reviewedBy: 'test-admin' });

      const response = await request(app)
        .get('/api/admin/stream/conversations')
        .query({ status: 'discarded', page: 1, limit: 10 });

      expect(response.status).toBe(200);
      const convIds = response.body.data.map((c: any) => c.conversation_id);
      expect(convIds).toContain(conversationId);
    });

    it('should not return conversation in wrong status filter', async () => {
      // Conversation is pending by default
      const response = await request(app)
        .get('/api/admin/stream/conversations')
        .query({ status: 'changeset', page: 1, limit: 10 });

      expect(response.status).toBe(200);
      const convIds = response.body.data.map((c: any) => c.conversation_id);
      expect(convIds).not.toContain(conversationId);
    });
  });

  describe('Workflow Transitions', () => {
    it('should move conversation from pending to changeset', async () => {
      // Initially in pending
      let response = await request(app)
        .get('/api/admin/stream/conversations')
        .query({ status: 'pending', page: 1, limit: 10 });
      let convIds = response.body.data.map((c: any) => c.conversation_id);
      expect(convIds).toContain(conversationId);

      // Approve all proposals
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal2Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal3Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      // Should now be in changeset
      response = await request(app)
        .get('/api/admin/stream/conversations')
        .query({ status: 'changeset', page: 1, limit: 10 });
      convIds = response.body.data.map((c: any) => c.conversation_id);
      expect(convIds).toContain(conversationId);

      // Should not be in pending anymore
      response = await request(app)
        .get('/api/admin/stream/conversations')
        .query({ status: 'pending', page: 1, limit: 10 });
      convIds = response.body.data.map((c: any) => c.conversation_id);
      expect(convIds).not.toContain(conversationId);
    });

    it('should move conversation from changeset back to pending', async () => {
      // Approve all proposals (move to changeset)
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal2Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal3Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      // Reset one proposal (move back to pending)
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'pending', reviewedBy: 'test-admin' });

      // Should be back in pending
      const response = await request(app)
        .get('/api/admin/stream/conversations')
        .query({ status: 'pending', page: 1, limit: 10 });
      const convIds = response.body.data.map((c: any) => c.conversation_id);
      expect(convIds).toContain(conversationId);
    });
  });

  describe('Edge Cases', () => {
    it('should handle non-existent proposal ID', async () => {
      const response = await request(app)
        .post('/api/admin/stream/proposals/999999/status')
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      expect(response.status).toBe(500);
    });

    it('should reject invalid status value', async () => {
      const response = await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'invalid', reviewedBy: 'test-admin' });

      expect(response.status).toBe(500); // Zod validation errors return 500
    });

    it('should handle conversation with mixed status proposals', async () => {
      // Approve one, ignore one, keep one pending
      await request(app)
        .post(`/api/admin/stream/proposals/${proposal1Id}/status`)
        .send({ status: 'approved', reviewedBy: 'test-admin' });

      await request(app)
        .post(`/api/admin/stream/proposals/${proposal2Id}/status`)
        .send({ status: 'ignored', reviewedBy: 'test-admin' });

      // proposal3 stays pending

      // Should be in pending (has pending proposal)
      const response = await request(app)
        .get('/api/admin/stream/conversations')
        .query({ status: 'pending', page: 1, limit: 10 });
      const convIds = response.body.data.map((c: any) => c.conversation_id);
      expect(convIds).toContain(conversationId);
    });
  });
});
