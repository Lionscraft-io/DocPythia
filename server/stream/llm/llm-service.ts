/**
 * LLM Service
 * Unified service for LLM requests with model tiering and retry logic
 * Author: Wayne
 * Date: 2025-10-30
 * Reference: /docs/specs/multi-stream-scanner-phase-1.md
 */

import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';
import { LLMModel, LLMRequest, LLMResponse } from '../types.js';
import { llmCache, CachePurpose } from '../../llm/llm-cache.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export class LLMService {
  private genAI: GoogleGenerativeAI;
  private modelCache: Map<LLMModel, GenerativeModel> = new Map();

  // Model tiering configuration
  private static readonly MODEL_MAP: Record<LLMModel, string> = {
    [LLMModel.FLASH]: 'gemini-2.0-flash-exp', // Fast, cheap for classification
    [LLMModel.PRO]: 'gemini-1.5-pro', // Balanced for proposals
    [LLMModel.PRO_2]: 'gemini-exp-1206', // Powerful for final review
  };

  // Default generation configs per model tier
  private static readonly DEFAULT_CONFIGS: Record<LLMModel, Partial<GenerationConfig>> = {
    [LLMModel.FLASH]: {
      temperature: 0.2, // Lower temperature for consistent classification
      maxOutputTokens: 2048,
    },
    [LLMModel.PRO]: {
      temperature: 0.4, // Slightly higher for creative proposals
      maxOutputTokens: 4096,
    },
    [LLMModel.PRO_2]: {
      temperature: 0.3, // Balanced for thorough review
      maxOutputTokens: 4096,
    },
  };

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    this.genAI = new GoogleGenerativeAI(key);
    console.log('LLMService initialized with Gemini API');
  }

  /**
   * Make an LLM request with automatic retry logic
   */
  async request(request: LLMRequest): Promise<LLMResponse> {
    const maxRetries = 3;
    const baseRetryDelay = 2000; // 2 seconds base delay (increased from 1s)

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeRequest(request);
      } catch (error) {
        const isTransient = (error as any).transient === true;
        console.error(`LLM request failed (attempt ${attempt}/${maxRetries}):`, error);
        console.error(`Error type: ${isTransient ? 'TRANSIENT (will retry)' : 'PERMANENT'}`);

        if (attempt < maxRetries) {
          // Use longer delays for transient errors (empty response, malformed JSON)
          const delayMultiplier = isTransient ? 2 : 1;
          const delay = baseRetryDelay * Math.pow(2, attempt - 1) * delayMultiplier;
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        } else {
          throw error;
        }
      }
    }

    throw new Error('LLM request failed after maximum retries');
  }

  /**
   * Make a structured JSON request with schema validation
   */
  async requestJSON<T = any>(
    request: LLMRequest,
    responseSchema: any,
    cachePurpose?: CachePurpose,
    messageId?: number
  ): Promise<{ data: T; response: LLMResponse }> {
    const maxRetries = 3;
    const baseRetryDelay = 2000; // 2 seconds base delay

    const prompt = this.buildPrompt(request);

    // Check cache if purpose is provided
    if (cachePurpose) {
      const cached = llmCache.get(prompt, cachePurpose);
      if (cached) {
        try {
          const data = JSON.parse(cached.response) as T;
          const llmResponse: LLMResponse = {
            content: cached.response,
            modelUsed: cached.model || 'cached',
            tokensUsed: cached.tokensUsed,
            finishReason: 'CACHED',
          };
          return { data, response: llmResponse };
        } catch (error) {
          console.warn('Failed to parse cached response, will regenerate');
        }
      }
    }

    // Retry loop for transient errors
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeRequestJSON(request, responseSchema, cachePurpose, messageId, prompt);
      } catch (error) {
        const isTransient = (error as any).transient === true;
        console.error(`LLM JSON request failed (attempt ${attempt}/${maxRetries}):`, error);
        console.error(`Error type: ${isTransient ? 'TRANSIENT (will retry)' : 'PERMANENT'}`);

        if (attempt < maxRetries && isTransient) {
          // Use longer delays for transient errors (empty response, malformed JSON, API errors)
          const delay = baseRetryDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        } else {
          throw error;
        }
      }
    }

    throw new Error('LLM JSON request failed after maximum retries');
  }

  /**
   * Core JSON request logic (called by requestJSON retry loop)
   */
  private async makeRequestJSON<T = any>(
    request: LLMRequest,
    responseSchema: any,
    cachePurpose: CachePurpose | undefined,
    messageId: number | undefined,
    prompt: string
  ): Promise<{ data: T; response: LLMResponse }> {

    // Convert Zod schema to JSON schema for Gemini API
    const rawJsonSchema = zodToJsonSchema(responseSchema, {
      target: 'openApi3', // Use OpenAPI 3.0 format
      $refStrategy: 'none', // Don't use $ref, inline all definitions
    });

    // Clean the schema to remove fields Gemini doesn't support
    const cleanedSchema = this.cleanSchemaForGemini(rawJsonSchema);

    const model = this.getOrCreateModel(request.model, {
      responseMimeType: 'application/json',
      responseSchema: cleanedSchema,
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
    });

    // Log full prompt
    console.log('\n' + '='.repeat(80));
    console.log('📤 LLM REQUEST');
    console.log('='.repeat(80));
    console.log('Model:', request.model);
    console.log('Temperature:', request.temperature || 'default');
    console.log('Max Tokens:', request.maxTokens || 'default');
    if (request.history && request.history.length > 0) {
      console.log('Conversation History:', request.history.length, 'messages');
    }
    console.log('\n--- SYSTEM PROMPT ---');
    if (request.systemPrompt) {
      console.log(request.systemPrompt);
    } else {
      console.log('(none)');
    }
    console.log('\n--- USER PROMPT ---');
    console.log(request.userPrompt);
    console.log('\n--- RESPONSE SCHEMA ---');
    console.log(JSON.stringify(cleanedSchema, null, 2));
    console.log('='.repeat(80) + '\n');

    let result;
    try {
      // Build conversation for multi-turn request if history is provided
      if (request.history && request.history.length > 0) {
        // Build conversation with history
        const contents = [
          // Add history messages
          ...request.history.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          })),
          // Add current request (system + user prompts combined)
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ];

        result = await model.generateContent({ contents });
      } else {
        // Single-turn request (backward compatible)
        result = await model.generateContent(prompt);
      }
    } catch (apiError) {
      // Catch API errors (rate limiting, network issues, etc.)
      console.error('\n' + '='.repeat(80));
      console.error('❌ GEMINI API ERROR');
      console.error('='.repeat(80));
      console.error('API Error:', apiError);
      console.error('='.repeat(80) + '\n');

      const err = new Error(`Gemini API error: ${(apiError as Error).message}`);
      (err as any).transient = true; // Mark as transient - could be rate limiting or network issue
      throw err;
    }

    try {
      const rawJson = result.response.text();

      // Log full response
      console.log('\n' + '='.repeat(80));
      console.log('📥 LLM RESPONSE');
      console.log('='.repeat(80));
      console.log('Model Used:', LLMService.MODEL_MAP[request.model] || request.model);
      console.log('Tokens Used:', result.response.usageMetadata?.totalTokenCount || 'unknown');
      console.log('Finish Reason:', result.response.candidates?.[0]?.finishReason || 'unknown');
      console.log('\n--- RAW JSON RESPONSE ---');
      console.log(rawJson || '(empty)');
      console.log('='.repeat(80) + '\n');

      if (!rawJson) {
        const err = new Error('Empty response from LLM - possibly rate limited or timeout');
        (err as any).transient = true; // Mark as transient for retry logic
        throw err;
      }

      // Parse and validate JSON
      let data: T;
      try {
        data = JSON.parse(rawJson) as T;
      } catch (parseError) {
        // Log details about malformed JSON for debugging
        console.error('\n' + '='.repeat(80));
        console.error('❌ JSON PARSE ERROR');
        console.error('='.repeat(80));
        console.error('Parse Error:', parseError);
        console.error('Raw JSON (first 1000 chars):', rawJson.substring(0, 1000));
        console.error('Raw JSON (last 200 chars):', rawJson.substring(Math.max(0, rawJson.length - 200)));
        console.error('JSON Length:', rawJson.length);
        console.error('='.repeat(80) + '\n');

        const err = new Error(`Malformed JSON response: ${(parseError as Error).message}`);
        (err as any).transient = true; // Mark as transient for retry logic
        throw err;
      }

      const llmResponse: LLMResponse = {
        content: rawJson,
        modelUsed: LLMService.MODEL_MAP[request.model] || request.model,
        tokensUsed: result.response.usageMetadata?.totalTokenCount,
        finishReason: result.response.candidates?.[0]?.finishReason,
      };

      // Save to cache if purpose is provided
      if (cachePurpose) {
        console.log(`[DEBUG] llm-service.ts: Calling llmCache.set() with purpose: ${cachePurpose}, messageId: ${messageId}`);
        llmCache.set(prompt, rawJson, cachePurpose, {
          model: llmResponse.modelUsed,
          tokensUsed: llmResponse.tokensUsed,
          messageId,
        });
        console.log(`[DEBUG] llm-service.ts: llmCache.set() returned`);
      } else {
        console.log(`[DEBUG] llm-service.ts: No cache purpose provided, skipping cache`);
      }

      return { data, response: llmResponse };
    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('❌ LLM REQUEST ERROR');
      console.error('='.repeat(80));
      console.error('Error:', error);
      console.error('Is Transient:', (error as any).transient || false);
      console.error('='.repeat(80) + '\n');
      throw error;
    }
  }

  /**
   * Make a simple text request
   */
  private async makeRequest(request: LLMRequest): Promise<LLMResponse> {
    const model = this.getOrCreateModel(request.model, {
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
    });

    const prompt = this.buildPrompt(request);

    try {
      const result = await model.generateContent(prompt);
      const content = result.response.text();

      if (!content) {
        throw new Error('Empty response from LLM');
      }

      return {
        content,
        modelUsed: typeof request.model === 'string' ? request.model : LLMService.MODEL_MAP[request.model],
        tokensUsed: result.response.usageMetadata?.totalTokenCount,
        finishReason: result.response.candidates?.[0]?.finishReason,
      };
    } catch (error) {
      console.error('Error in LLM request:', error);
      throw error;
    }
  }

  /**
   * Get or create a model instance with configuration
   */
  private getOrCreateModel(
    modelType: LLMModel | string,
    configOverrides?: Partial<GenerationConfig>
  ): GenerativeModel {
    // If modelType is a string (direct model name), use it directly
    // Otherwise, look it up in the MODEL_MAP
    const modelName = typeof modelType === 'string'
      ? modelType
      : LLMService.MODEL_MAP[modelType];

    if (!modelName) {
      throw new Error(`Model name is empty or undefined. modelType: ${modelType}, typeof: ${typeof modelType}`);
    }

    const defaultConfig = typeof modelType === 'string'
      ? LLMService.DEFAULT_CONFIGS[LLMModel.FLASH] // Use default config for string models
      : LLMService.DEFAULT_CONFIGS[modelType];

    // Merge default config with overrides
    const generationConfig: GenerationConfig = {
      ...defaultConfig,
      ...configOverrides,
    } as GenerationConfig;

    // Create new model instance with config
    // Note: We don't cache models with custom configs to avoid config conflicts
    return this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig,
    });
  }

  /**
   * Build prompt from request
   */
  private buildPrompt(request: LLMRequest): string {
    if (request.systemPrompt) {
      return `${request.systemPrompt}\n\n${request.userPrompt}`;
    }
    return request.userPrompt;
  }

  /**
   * Helper to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get recommended model for task type
   */
  static getRecommendedModel(taskType: 'classification' | 'proposal' | 'review'): LLMModel {
    switch (taskType) {
      case 'classification':
        return LLMModel.FLASH; // Fast, accurate classification
      case 'proposal':
        return LLMModel.PRO; // Balanced for creative proposals
      case 'review':
        return LLMModel.PRO_2; // Thorough final review
      default:
        return LLMModel.PRO; // Safe default
    }
  }

  /**
   * Estimate token count (rough approximation)
   */
  static estimateTokenCount(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Clean JSON schema to remove fields that Gemini API doesn't support
   * Gemini has a more restricted schema format than OpenAPI 3.0
   */
  private cleanSchemaForGemini(schema: any): any {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map(item => this.cleanSchemaForGemini(item));
    }

    const cleaned: any = {};

    for (const [key, value] of Object.entries(schema)) {
      // Skip fields that Gemini doesn't support
      if (key === 'additionalProperties' ||
          key === '$schema' ||
          key === 'definitions' ||
          key === '$ref') {
        continue;
      }

      // Recursively clean nested objects
      cleaned[key] = this.cleanSchemaForGemini(value);
    }

    return cleaned;
  }

  /**
   * Calculate cost estimate (USD)
   */
  static estimateCost(modelType: LLMModel, inputTokens: number, outputTokens: number): number {
    // Pricing as of 2025 (approximate)
    const pricing = {
      [LLMModel.FLASH]: { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000 },
      [LLMModel.PRO]: { input: 1.25 / 1_000_000, output: 5.00 / 1_000_000 },
      [LLMModel.PRO_2]: { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    };

    const rates = pricing[modelType];
    return inputTokens * rates.input + outputTokens * rates.output;
  }
}

// Export singleton instance
export const llmService = new LLMService();
