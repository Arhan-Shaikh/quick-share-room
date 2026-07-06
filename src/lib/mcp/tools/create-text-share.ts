import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += CHARS[Math.floor(Math.random() * CHARS.length)];
  return c;
}

export default defineTool({
  name: "create_text_share",
  title: "Create text share",
  description:
    "Create an ephemeral text share on DropZone. Returns a 6-character room code that anyone can use to retrieve the text before it expires.",
  inputSchema: {
    text: z.string().min(1).describe("The text content to share."),
    expiryMinutes: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .optional()
      .describe("Minutes until the share expires. Defaults to 15."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ text, expiryMinutes }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const code = generateCode();
    const minutes = expiryMinutes ?? 15;
    const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();

    const { error } = await supabase.from("shared_items").insert({
      code,
      type: "text",
      content: text,
      encrypted: false,
      expires_at: expiresAt,
    });

    if (error) {
      return { content: [{ type: "text", text: `Failed to create share: ${error.message}` }], isError: true };
    }

    return {
      content: [
        { type: "text", text: `Room code: ${code} (expires in ${minutes} minutes)` },
      ],
      structuredContent: { roomCode: code, expiresAt, expiresInMinutes: minutes },
    };
  },
});
