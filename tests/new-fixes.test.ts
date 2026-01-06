// Test the new fixes for RocksDB and <br/> in tables

import { MarkdownFormattingPostProcessor } from '../server/pipeline/utils/post-processors/MarkdownFormattingPostProcessor.js';
import { HtmlToMarkdownPostProcessor } from '../server/pipeline/utils/post-processors/HtmlToMarkdownPostProcessor.js';
import { describe, it, expect } from 'vitest';

describe('New Post-Processor Fixes', () => {
  const mdProcessor = new MarkdownFormattingPostProcessor();
  const htmlProcessor = new HtmlToMarkdownPostProcessor();
  const context = { isMarkdown: true, originalText: '', filePath: 'test.md' };

  describe('RocksDB protection', () => {
    it('should preserve RocksDB in headers', () => {
      const input = '### RocksDB Log File Management for NEAR Nodes';
      const result = mdProcessor.process(input, context);
      expect(result.text).toContain('RocksDB');
      expect(result.text).not.toContain('Rocks DB');
    });

    it('should preserve other compound words', () => {
      const input = '### Using PostgreSQL with JavaScript on MacOS';
      const result = mdProcessor.process(input, context);
      expect(result.text).toContain('PostgreSQL');
      expect(result.text).toContain('JavaScript');
      expect(result.text).toContain('MacOS');
    });
  });

  describe('<br/> handling in tables', () => {
    it('should preserve <br/> in table rows', () => {
      const input = '| NO_SYNCED_BLOCKS | Description | • Wait <br/>• Send request |';
      const result = htmlProcessor.process(input, context);
      expect(result.text).toContain('<br/>');
    });

    it('should convert <br/> to newline outside tables', () => {
      const input = 'First line<br/>Second line';
      const result = htmlProcessor.process(input, context);
      expect(result.text).toContain('\n');
      expect(result.text).not.toContain('<br/>');
    });
  });
});
