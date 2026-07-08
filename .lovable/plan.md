
# Plan: Comprehensive README.md for DropZone

Replace the placeholder `README.md` with a detailed, GitHub-flavored document covering what the app is, how it works end-to-end, and every subsystem in the codebase.

## Structure

1. **Header** — project name (DropZone), tagline, live URLs (preview + published), tech-stack badges (React 18, Vite 5, TypeScript, Tailwind, shadcn/ui, Lovable Cloud/Supabase, Deno Edge Functions).
2. **What it does** — ephemeral, account-free sharing of text and files (up to 10 GB) via a 6-character room code, 5 min–2 h auto-expiry, optional client-side E2E encryption, MCP server for AI assistants.
3. **Feature matrix** — text share, single/multi file share, encrypted share, QR code, expiry timer, download-all, MCP tools.
4. **Architecture overview** — ASCII diagram showing browser → Supabase (DB + Storage + Edge Functions) → MCP endpoint, and the two data paths (inline ≤3.5 MB vs. Storage >3.5 MB).
5. **Tech stack & folder layout** — annotated tree of `src/`, `supabase/`, `public/`, `.lovable/`.
6. **Data model** — `public.shared_items` columns, `validate_shared_item_expiry` trigger function, RLS policies (anonymous insert, non-expired read), `shared-files` private storage bucket, GRANTs.
7. **Sharing flow – create** — `ShareCreator.tsx` UX, code generation (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` alphabet, 6 chars), size branching:
   - Text or blob ≤3.5 MB → optional AES-GCM encrypt → base64 → `shared_items.content`.
   - Blob >3.5 MB → `tus-js-client` resumable upload to `shared-files` bucket → paths saved to `storage_paths[]`.
   - Multi-file metadata (`file_names`, `file_sizes`, `file_types`).
8. **Sharing flow – retrieve** — `ShareRetriever.tsx` states (input, key entry, decrypted view), `checkShareEncryption` probe, `retrieveShare` via `get-share` edge function, per-file signed URLs via `get-share-file` (10-min TTL), download / download-all.
9. **Encryption details** (`src/lib/crypto.ts`) — AES-128-GCM, random IV, key exported as base64 and appended to the room code as `CODE-KEY`; server never sees the key; decryption fully client-side.
10. **Edge Functions** —
    - `get-share`: validates code, returns non-expired row, strips storage details.
    - `get-share-file`: validates code + path ownership, mints signed URL from private bucket.
    - `mcp`: auto-generated Deno bundle from `src/lib/mcp/`, serves MCP Streamable HTTP.
11. **MCP server** — public (no-auth) DropZone MCP, tools `create_text_share` and `retrieve_share`, manifest at `.lovable/mcp/manifest.json`, endpoint `/functions/v1/mcp`. How to connect from ChatGPT / Claude / Cursor.
12. **Frontend details** — routing (`App.tsx`, `Index`, `NotFound`), design system (terminal-inspired dark theme, JetBrains Mono, green accent tokens in `index.css`), `react-helmet-async` for per-route SEO, accessibility notes (H1, `<main>`, aria-labels on icon buttons).
13. **SEO & metadata** — `index.html` (title, description, canonical, og/twitter, JSON-LD WebApplication), `sitemap.xml`, `robots.txt`, `llms.txt`, per-page `Helmet`.
14. **Security posture** — RLS-only anonymous inserts, storage bucket is private (signed URLs only), MCP is intentionally public (only exposes ephemeral shares by explicit code), no service-role key in client code, expiry enforced by DB trigger and edge function.
15. **Local development** — `bun install`, `bun dev`, env vars auto-injected by Lovable Cloud (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`), running edge functions locally with `supabase functions serve`, migrations under `supabase/migrations/`.
16. **Deployment** — Lovable publish flow, published URL, edge functions redeploy on migration/MCP changes.
17. **API reference** — request/response shapes for `get-share`, `get-share-file`, and the two MCP tools with example JSON.
18. **Method-by-method reference** — table listing every exported function in `src/lib/sharing.ts` (`createShare`, `createMultiFileShare`, `retrieveShare`, `checkShareEncryption`, `getTimeRemaining`, `formatBytes`), `src/lib/crypto.ts` (`generateKey`, `encrypt`, `decrypt`, `exportKey`, `importKey`), MCP tool handlers, and each edge function's exported handler, with signature + purpose.
19. **Roadmap / ideas** and **License** placeholder.

## Files touched

- `README.md` — full rewrite (single file, ~600–800 lines of markdown).

No code, schema, or config changes.
