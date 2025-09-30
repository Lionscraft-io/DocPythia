import { GoogleGenAI } from "@google/genai";
import { storage } from "../storage";
import type { ScrapedMessage, DocumentationSection } from "@shared/schema";

export interface AnalysisResult {
  relevant: boolean;
  updateType?: "minor" | "major" | "add" | "delete" | null;
  sectionId?: string | null;
  summary?: string | null;
  suggestedContent?: string | null;
  reasoning?: string;
  proposedSectionTitle?: string | null; // For "add" operations
  proposedSectionLevel?: number | null; // For "add" operations
}

export class MessageAnalyzer {
  private documentationSections: DocumentationSection[] = [];
  private ai: GoogleGenAI;

  constructor() {
    // DON'T DELETE THIS COMMENT - Note that the newest Gemini model series is "gemini-2.5-flash" or "gemini-2.5-pro"
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  }

  async loadDocumentation() {
    this.documentationSections = await storage.getDocumentationSections();
    console.log(`Loaded ${this.documentationSections.length} documentation sections for analysis`);
  }

  async analyzeMessage(message: ScrapedMessage): Promise<AnalysisResult> {
    if (this.documentationSections.length === 0) {
      await this.loadDocumentation();
    }

    const documentationContext = this.documentationSections
      .map(section => `Section ID: ${section.sectionId}\nTitle: ${section.title}\nContent: ${section.content.substring(0, 500)}...`)
      .join("\n\n");

    const prompt = `You are analyzing messages from NEAR Protocol's validator community support channel to determine if they contain information that should update the validator documentation.

Current Documentation Sections:
${documentationContext}

Message to Analyze:
Topic: ${message.topicName || "N/A"}
From: ${message.senderName}
Date: ${message.messageTimestamp}
Content:
${message.content}

Your task:
1. Determine if this message contains valuable information for validator documentation (new troubleshooting tips, configuration changes, best practices, common issues, solutions, etc.)
2. Choose the appropriate action:
   - "minor": Small update or clarification to existing section
   - "major": Significant update to existing section
   - "add": New topic that needs a new documentation section
   - "delete": Information suggesting a section is outdated and should be removed
3. For updates/deletes: identify the section ID
4. For adds: propose a title and hierarchy level (1=main, 2=subsection, 3=sub-subsection)
5. Provide a summary and suggested content

Respond with JSON in this exact format:
{
  "relevant": boolean,
  "updateType": "minor" | "major" | "add" | "delete" | null,
  "sectionId": string | null,
  "summary": string | null,
  "suggestedContent": string | null,
  "reasoning": string,
  "proposedSectionTitle": string | null,
  "proposedSectionLevel": number | null
}`;

    try {
      const systemPrompt = "You are an expert technical writer analyzing community messages for documentation updates. Always respond with valid JSON.";

      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-pro",
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              relevant: { type: "boolean" },
              updateType: { type: "string", enum: ["minor", "major", "add", "delete"], nullable: true },
              sectionId: { type: "string", nullable: true },
              summary: { type: "string", nullable: true },
              suggestedContent: { type: "string", nullable: true },
              reasoning: { type: "string" },
              proposedSectionTitle: { type: "string", nullable: true },
              proposedSectionLevel: { type: "number", nullable: true },
            },
            required: ["relevant", "reasoning"],
          },
        },
        contents: prompt,
      });

      const rawJson = response.text;
      if (!rawJson) {
        throw new Error("Empty response from Gemini");
      }

      const result = JSON.parse(rawJson) as AnalysisResult;
      return result;
    } catch (error: any) {
      console.error("Error analyzing message:", error.message);
      throw new Error(`Failed to analyze message: ${error.message}`);
    }
  }

  async analyzeUnanalyzedMessages(limit: number = 10): Promise<{
    analyzed: number;
    relevant: number;
    updatesCreated: number;
  }> {
    const messages = await storage.getUnanalyzedMessages();
    const toAnalyze = messages.slice(0, limit);
    
    console.log(`Analyzing ${toAnalyze.length} messages...`);
    
    let relevantCount = 0;
    let updatesCreated = 0;

    for (const message of toAnalyze) {
      try {
        console.log(`\nAnalyzing message ${message.messageId}...`);
        const result = await this.analyzeMessage(message);
        
        console.log(`  Relevant: ${result.relevant}`);
        if (result.reasoning) {
          console.log(`  Reasoning: ${result.reasoning}`);
        }

        if (result.relevant && result.updateType && result.summary) {
          relevantCount++;
          
          // Handle different operation types
          if (result.updateType === "add") {
            // Adding a new section - requires proposed title and content
            if (!result.proposedSectionTitle || !result.suggestedContent) {
              console.log(`  ⚠ Warning: "add" operation missing title or content. Skipping.`);
            } else {
              // Generate a section ID from the proposed title
              const proposedSectionId = result.proposedSectionTitle
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
              
              const pendingUpdate = await storage.createPendingUpdate({
                sectionId: proposedSectionId,
                type: "add",
                summary: `Add new section: "${result.proposedSectionTitle}". ${result.summary}`,
                source: `Zulipchat message from ${message.senderName} on ${message.messageTimestamp.toISOString()}`,
                status: "pending", // Always requires manual review
                diffBefore: null,
                diffAfter: result.suggestedContent,
                reviewedBy: null,
              });
              
              updatesCreated++;
              console.log(`  ✓ Created "add" update for new section: ${proposedSectionId}`);
            }
          } else if (result.updateType === "delete") {
            // Deleting an existing section
            if (!result.sectionId) {
              console.log(`  ⚠ Warning: "delete" operation missing sectionId. Skipping.`);
            } else {
              const section = this.documentationSections.find(s => s.sectionId === result.sectionId);
              
              if (!section) {
                console.log(`  ⚠ Warning: Cannot delete non-existent section "${result.sectionId}". Skipping.`);
              } else {
                const pendingUpdate = await storage.createPendingUpdate({
                  sectionId: result.sectionId,
                  type: "delete",
                  summary: `Delete section: "${section.title}". ${result.summary}`,
                  source: `Zulipchat message from ${message.senderName} on ${message.messageTimestamp.toISOString()}`,
                  status: "pending", // Always requires manual review
                  diffBefore: section.content,
                  diffAfter: null,
                  reviewedBy: null,
                });
                
                updatesCreated++;
                console.log(`  ✓ Created "delete" update for section: ${result.sectionId}`);
              }
            }
          } else {
            // Updating existing section (minor or major)
            if (!result.sectionId) {
              console.log(`  ⚠ Warning: Update operation missing sectionId. Skipping.`);
            } else {
              const section = this.documentationSections.find(s => s.sectionId === result.sectionId);
              
              if (!section) {
                console.log(`  ⚠ Warning: AI returned unknown sectionId "${result.sectionId}". Converting to major update for manual review.`);
                result.updateType = "major";
              }
              
              const pendingUpdate = await storage.createPendingUpdate({
                sectionId: section ? result.sectionId : this.documentationSections[0]?.sectionId || "introduction",
                type: result.updateType,
                summary: section ? result.summary : `[TRIAGE] AI suggested unknown section "${result.sectionId}". ${result.summary}`,
                source: `Zulipchat message from ${message.senderName} on ${message.messageTimestamp.toISOString()}`,
                status: result.updateType === "minor" && section ? "auto-applied" : "pending",
                diffBefore: section?.content || null,
                diffAfter: result.suggestedContent || null,
                reviewedBy: result.updateType === "minor" && section ? "AI Auto-Approval" : null,
              });
              
              updatesCreated++;
              console.log(`  ✓ Created ${result.updateType} update for section ${section?.sectionId || "introduction"}`);
              
              // Auto-apply minor updates only if section was valid
              if (result.updateType === "minor" && result.suggestedContent && section) {
                await storage.updateDocumentationSection(result.sectionId, result.suggestedContent);
                
                // Create audit history entry for auto-applied update
                await storage.createUpdateHistory({
                  updateId: pendingUpdate.id,
                  action: "auto-applied",
                  performedBy: "AI Auto-Approval",
                });
                
                console.log(`  ✓ Auto-applied minor update with audit log`);
              }
            }
          }
        }
        
        // Mark as analyzed
        await storage.markMessageAsAnalyzed(message.id);
      } catch (error: any) {
        console.error(`  Error analyzing message ${message.messageId}:`, error.message);
        // Continue with next message
      }
    }

    return {
      analyzed: toAnalyze.length,
      relevant: relevantCount,
      updatesCreated,
    };
  }
}

export function createAnalyzerFromEnv(): MessageAnalyzer | null {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.warn("Gemini API key not found in environment variables");
    return null;
  }
  
  return new MessageAnalyzer();
}
