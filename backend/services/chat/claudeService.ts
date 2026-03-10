/**
 * Claude Service — Anthropic Claude AI integration with tool use
 *
 * Handles the tool-use loop: calls Claude, if it returns tool_use blocks,
 * executes them server-side, feeds results back, repeats until text response.
 */

import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS } from "./toolDefinitions";
import { executeToolCall } from "./toolExecutor";

const MAX_TOOL_ITERATIONS = 5;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

/**
 * Convert session messages to Claude message format.
 */
function formatMessagesForClaude(
  sessionMessages: { role: string; content: string }[]
): ClaudeMessage[] {
  return sessionMessages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      role: (msg.role === "assistant" ? "assistant" : "user") as
        | "user"
        | "assistant",
      content: msg.content,
    }));
}

function extractTextContent(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

interface ToolResult {
  content: string;
  toolsUsed: string[];
  tokensUsed: number;
}

/**
 * Execute the tool-use loop.
 */
async function executeToolLoop(
  messages: ClaudeMessage[],
  systemPrompt: string,
  userId: string
): Promise<ToolResult> {
  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const toolsUsed: string[] = [];
  let totalTokens = 0;
  const currentMessages: Anthropic.MessageParam[] = [...messages];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS as Anthropic.Tool[],
      messages: currentMessages,
    });

    totalTokens +=
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    if (response.stop_reason === "end_turn") {
      const text = extractTextContent(response);
      return { content: text, toolsUsed, tokensUsed: totalTokens };
    }

    if (response.stop_reason === "tool_use") {
      currentMessages.push({
        role: "assistant",
        content: response.content,
      });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolBlock) => {
          toolsUsed.push(toolBlock.name);
          const result = await executeToolCall(
            userId,
            toolBlock.name,
            toolBlock.input as Record<string, unknown>
          );
          return {
            type: "tool_result" as const,
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          };
        })
      );

      currentMessages.push({ role: "user", content: toolResults });
      continue;
    }

    // Unexpected stop reason
    const text = extractTextContent(response);
    if (text) {
      return { content: text, toolsUsed, tokensUsed: totalTokens };
    }
    break;
  }

  return {
    content:
      "Hmm, I got a bit lost in thought there. Could you rephrase that for me?",
    toolsUsed,
    tokensUsed: totalTokens,
  };
}

/**
 * Main entry: generate a Claude response with tool use.
 */
export async function generateClaudeResponse(
  userMessage: string,
  sessionMessages: { role: string; content: string }[],
  systemPrompt: string,
  userId: string
): Promise<ToolResult> {
  const messages = formatMessagesForClaude(sessionMessages);
  messages.push({ role: "user", content: userMessage });
  return executeToolLoop(messages, systemPrompt, userId);
}

/**
 * Streaming version — resolves tools non-streamed, then streams final text.
 */
export async function generateClaudeResponseStream(
  userMessage: string,
  sessionMessages: { role: string; content: string }[],
  systemPrompt: string,
  userId: string,
  onDelta: (text: string) => void,
  onStatus: (status: string) => void
): Promise<ToolResult> {
  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const toolsUsed: string[] = [];
  let totalTokens = 0;

  const messages = formatMessagesForClaude(sessionMessages);
  messages.push({ role: "user", content: userMessage });
  const currentMessages: Anthropic.MessageParam[] = [...messages];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS as Anthropic.Tool[],
      messages: currentMessages,
    });

    let bufferedText = "";
    let isStreaming = false;

    stream.on("text", (text) => {
      bufferedText += text;
      if (isStreaming) {
        onDelta(text);
      }
    });

    const finalMessage = await stream.finalMessage();
    totalTokens +=
      (finalMessage.usage?.input_tokens || 0) +
      (finalMessage.usage?.output_tokens || 0);

    if (
      finalMessage.stop_reason === "end_turn" ||
      i === MAX_TOOL_ITERATIONS - 1
    ) {
      if (bufferedText && !isStreaming) {
        onDelta(bufferedText);
      }
      return { content: bufferedText, toolsUsed, tokensUsed: totalTokens };
    }

    if (finalMessage.stop_reason === "tool_use") {
      currentMessages.push({
        role: "assistant",
        content: finalMessage.content,
      });

      const toolUseBlocks = finalMessage.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      onStatus("Looking up your data...");

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolBlock) => {
          toolsUsed.push(toolBlock.name);
          const result = await executeToolCall(
            userId,
            toolBlock.name,
            toolBlock.input as Record<string, unknown>
          );
          return {
            type: "tool_result" as const,
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          };
        })
      );

      currentMessages.push({ role: "user", content: toolResults });
      isStreaming = true;
      bufferedText = "";
      continue;
    }

    if (bufferedText) {
      onDelta(bufferedText);
      return { content: bufferedText, toolsUsed, tokensUsed: totalTokens };
    }
    break;
  }

  const fallback =
    "Hmm, I got a bit lost in thought there. Could you rephrase that for me?";
  onDelta(fallback);
  return { content: fallback, toolsUsed, tokensUsed: totalTokens };
}
