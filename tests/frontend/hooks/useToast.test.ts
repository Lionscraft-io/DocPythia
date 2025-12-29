/**
 * useToast Hook Tests
 * Owner: Wayne
 */

import { describe, it, expect } from 'vitest';
import { reducer } from '../../../client/src/hooks/use-toast';

describe('useToast reducer', () => {
  const initialState = { toasts: [] };

  describe('ADD_TOAST', () => {
    it('should add a toast to empty state', () => {
      const newToast = { id: '1', title: 'Test Toast', open: true };
      const result = reducer(initialState, {
        type: 'ADD_TOAST',
        toast: newToast,
      });

      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0]).toEqual(newToast);
    });

    it('should add toast to beginning of list', () => {
      const existingToast = { id: '1', title: 'First', open: true };
      const newToast = { id: '2', title: 'Second', open: true };
      const stateWithToast = { toasts: [existingToast] };

      const result = reducer(stateWithToast, {
        type: 'ADD_TOAST',
        toast: newToast,
      });

      expect(result.toasts[0].id).toBe('2');
    });

    it('should limit toasts to TOAST_LIMIT', () => {
      const existingToast = { id: '1', title: 'First', open: true };
      const newToast = { id: '2', title: 'Second', open: true };
      const stateWithToast = { toasts: [existingToast] };

      const result = reducer(stateWithToast, {
        type: 'ADD_TOAST',
        toast: newToast,
      });

      // TOAST_LIMIT is 1, so only the new toast should remain
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe('2');
    });
  });

  describe('UPDATE_TOAST', () => {
    it('should update an existing toast', () => {
      const existingToast = { id: '1', title: 'Original', open: true };
      const stateWithToast = { toasts: [existingToast] };

      const result = reducer(stateWithToast, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated' },
      });

      expect(result.toasts[0].title).toBe('Updated');
      expect(result.toasts[0].open).toBe(true); // Should preserve other properties
    });

    it('should not update non-matching toast', () => {
      const existingToast = { id: '1', title: 'Original', open: true };
      const stateWithToast = { toasts: [existingToast] };

      const result = reducer(stateWithToast, {
        type: 'UPDATE_TOAST',
        toast: { id: '2', title: 'Updated' },
      });

      expect(result.toasts[0].title).toBe('Original');
    });
  });

  describe('DISMISS_TOAST', () => {
    it('should set open to false for specific toast', () => {
      const toast1 = { id: '1', title: 'First', open: true };
      const toast2 = { id: '2', title: 'Second', open: true };
      const stateWithToasts = { toasts: [toast1, toast2] };

      const result = reducer(stateWithToasts, {
        type: 'DISMISS_TOAST',
        toastId: '1',
      });

      expect(result.toasts.find(t => t.id === '1')?.open).toBe(false);
      expect(result.toasts.find(t => t.id === '2')?.open).toBe(true);
    });

    it('should dismiss all toasts when no toastId provided', () => {
      const toast1 = { id: '1', title: 'First', open: true };
      const stateWithToasts = { toasts: [toast1] };

      const result = reducer(stateWithToasts, {
        type: 'DISMISS_TOAST',
      });

      expect(result.toasts.every(t => t.open === false)).toBe(true);
    });
  });

  describe('REMOVE_TOAST', () => {
    it('should remove specific toast', () => {
      const toast1 = { id: '1', title: 'First', open: true };
      const toast2 = { id: '2', title: 'Second', open: true };
      const stateWithToasts = { toasts: [toast1, toast2] };

      const result = reducer(stateWithToasts, {
        type: 'REMOVE_TOAST',
        toastId: '1',
      });

      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe('2');
    });

    it('should remove all toasts when no toastId provided', () => {
      const toast1 = { id: '1', title: 'First', open: true };
      const stateWithToasts = { toasts: [toast1] };

      const result = reducer(stateWithToasts, {
        type: 'REMOVE_TOAST',
      });

      expect(result.toasts).toHaveLength(0);
    });
  });
});
