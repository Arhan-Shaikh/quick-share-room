# DropZone

> Ephemeral, account-free sharing of text snippets and files (up to **10 GB**) via a six-character room code. Optional client-side end-to-end encryption. Auto-expires between 5 minutes and 2 hours. Includes an MCP server so AI assistants can create and retrieve shares directly.

- **Live app:** https://quickshareroom.lovable.app
- **Preview:** https://id-preview--1b35b859-4d7d-4fe4-a5fc-b27a8b75c3ad.lovable.app
- **MCP endpoint:** `https://<project>.supabase.co/functions/v1/mcp` (public, no auth)

Built on **React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui**, with a **Lovable Cloud (Supabase)** backend — Postgres + Row-Level Security, private Storage, and Deno Edge Functions.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Feature matrix](#feature-matrix)
3. [Architecture](#architecture)
4. [Folder layout](#folder-layout)
5. [Data model](#data-model)
6. [Create-share flow](#create-share-flow)
7. [Retrieve-share flow](#retrieve-share-flow)
8. [End-to-end encryption](#end-to-end-encryption)
9. [Edge Functions](#edge-functions)
10. [MCP server](#mcp-server)
11. [Frontend, design system & SEO](#frontend-design-system--seo)
12. [Security posture](#security-posture)
13. [Local development](#local-development)
14. [Deployment](#deployment)
15. [API reference](#api-reference)
16. [Method-by-method reference](#method-by-method-reference)
17. [Roadmap](#roadmap)
18. [License](#license)

---

## What it does

DropZone is a "paste-and-go" service for moving a text snippet or a set of files from one device (or one person) to another without creating an account:

1. Sender pastes text or drops files, picks an expiry (5 min – 2 h) and — optionally — turns on E2E encryption.
2. DropZone stores the payload and returns a **6-character room code** (plus a QR code, plus a longer token if encryption is on).
3. Recipient enters the code on the same page and gets the text or downloads the files.
4. When the clock runs out, the row disappears from every query and the storage objects are unreachable.

Two payload paths coexist:

- **Inline path** — small text or small (≤ ~3.5 MB total) encrypted file bundles are stored as a base64 string in the `content` column of `public.shared_items`. This is the only path that supports end-to-end encryption, because the ciphertext lives inside a row that no signed URL can bypass.
- **Storage path** — anything else (any single file, any multi-file share > 3.5 MB) is uploaded via **resumable tus** to a private Supabase Storage bucket and referenced from the row by object path. Downloads are gated by a signed-URL edge function.

---

## Feature matrix

| Feature | Path | Notes |
| --- | --- | --- |
| Text share | inline | Optional E2E encryption |
| Single-file share | storage | Up to 10 GB, resumable |
| Multi-file share | storage | Per-file paths + metadata |
| E2E encrypted text | inline | AES-GCM-128, key in URL fragment of token |
| E2E encrypted files | inline | Only when total ≤ 3.5 MB |
| QR code | – | Encodes the full token (room code + key if encrypted) |
| Auto expiry | DB trigger + query filter | 5 min, 15 min, 30 min, 1 h, 2 h |
| Download all | client | Fires per-file signed URL fetches |
| MCP server | edge function | `create_text_share`, `retrieve_share` |

---

## Architecture

```text
                        ┌──────────────────────────────────────┐
                        │              Browser (SPA)           │
                        │  React 18 + Vite 5 + Tailwind        │
                        │  ┌────────────┐  ┌────────────────┐  │
                        │  │ShareCreator│  │ShareRetriever  │  │
                        │  └─────┬──────┘  └────────┬───────┘  │
                        │        │ crypto.ts       │           │
                        │        │ sharing.ts      │           │
                        └────────┼─────────────────┼───────────┘
                                 │                 │
     inline path (≤ ~3.5 MB) ────┤                 │
     (INSERT via PostgREST + RLS)│                 │ retrieve
                                 │                 │ (invoke edge fn)
                                 ▼                 ▼
     Storage path ──────► ┌────────────────────────────────────┐
     (tus resumable       │        Lovable Cloud (Supabase)     │
      upload direct       │                                     │
      to Storage)         │  Postgres              Storage      │
                          │  ┌──────────────┐   ┌────────────┐  │
                          │  │shared_items  │   │shared-files│  │
                          │  │  + RLS       │   │  (private) │  │
                          │  │  + trigger   │   └─────▲──────┘  │
                          │  └──────▲───────┘         │         │
                          │         │                 │         │
                          │  Edge Functions (Deno)    │         │
                          │  ┌──────┴────────┐  ┌─────┴─────┐   │
                          │  │  get-share    │  │ get-share │   │
                          │  │  (row lookup) │  │  -file    │   │
                          │  └───────────────┘  │ (signs URL)│  │
                          │  ┌───────────────┐  └───────────┘   │
                          │  │      mcp      │◄── AI assistants │
                          │  │ (MCP server)  │   (ChatGPT etc.) │
                          │  └───────────────┘                  │
                          └─────────────────────────────────────┘
```

Rules of the road:

- The browser only ever inserts into `shared_items` (governed by RLS) and uploads to Storage (governed by bucket policies).
- The browser **never** reads rows or storage objects directly. Every read goes through an edge function that (a) checks the row hasn't expired, and (b) — for storage — mints a short-lived signed URL for exactly one object.
- Encryption is purely client-side. The server holds ciphertext + IV; the AES key travels in the second half of the share token, never in a request body.

---

## Folder layout

```text
.
├── index.html                        # Static <head>: SEO, JSON-LD, favicon
├── public/
│   ├── robots.txt                    # Sitemap directive
│   ├── sitemap.xml                   # Single URL entry
│   └── llms.txt                      # Machine-readable app summary for LLMs
├── src/
│   ├── App.tsx                       # Router + providers
│   ├── main.tsx                      # HelmetProvider + React root
│   ├── index.css                     # Design tokens (dark, terminal green)
│   ├── pages/
│   │   ├── Index.tsx                 # Home: <main>, H1, Creator + Retriever
│   │   └── NotFound.tsx              # 404 with noindex Helmet
│   ├── components/
│   │   ├── ShareCreator.tsx          # Upload / paste / encrypt UI
│   │   ├── ShareRetriever.tsx       # Code entry, decrypt, download UI
│   │   └── NavLink.tsx
│   ├── lib/
│   │   ├── sharing.ts                # Core create/retrieve logic (client)
│   │   ├── crypto.ts                 # AES-GCM Web Crypto wrapper
│   │   └── utils.ts
│   ├── lib/mcp/
│   │   ├── index.ts                  # defineMcp() entry
│   │   └── tools/
│   │       ├── create-text-share.ts
│   │       └── retrieve-share.ts
│   └── integrations/supabase/        # AUTO-GEN — do not edit
├── supabase/
│   ├── functions/
│   │   ├── get-share/index.ts        # Row lookup (service role)
│   │   ├── get-share-file/index.ts   # Signed URL minter
│   │   └── mcp/index.ts              # AUTO-GEN by @lovable.dev/mcp-js
│   ├── migrations/                    # SQL migrations (schema + RLS + GRANTs)
│   └── config.toml                    # AUTO-GEN
└── .lovable/mcp/manifest.json         # MCP tool catalog for the connector UI
```

---

## Data model

### `public.shared_items`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | uuid PK | – |
| `code` | text (6 chars, uppercase alphanumeric) | Public room code |
| `type` | text (`text` \| `file`) | Payload shape |
| `content` | text | Text body, base64 ciphertext, or a small JSON marker (`{"storage":true,"count":N}`) for the storage path |
| `encrypted` | bool | True when `content` is AES-GCM ciphertext |
| `file_name` | text | Original name, or `multi:N` for a bundle |
| `file_type` | text | MIME, or the sentinel `application/x-multi-file` (inline bundle) / `application/x-storage-share` (storage bundle) |
| `storage_paths` | text[] | Object keys in `shared-files` bucket (storage path only) |
| `file_names`, `file_types`, `file_sizes` | text[] / text[] / int8[] | Per-file metadata for storage bundles |
| `created_at` | timestamptz | – |
| `expires_at` | timestamptz | Enforced by trigger: `now() < expires_at ≤ now() + 2h` |

### Trigger

```sql
CREATE FUNCTION public.validate_shared_item_expiry() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at must be in the future';
  END IF;
  IF NEW.expires_at > now() + interval '2 hours' THEN
    RAISE EXCEPTION 'expires_at cannot exceed 2 hours from now';
  END IF;
  IF NEW.type NOT IN ('text','file') THEN
    RAISE EXCEPTION 'invalid type';
  END IF;
  RETURN NEW;
END;
$$;
```

### RLS + GRANTs

- `GRANT SELECT, INSERT ON public.shared_items TO anon, authenticated` — required for the browser to POST a new share.
- `GRANT ALL ON public.shared_items TO service_role` — used by the edge functions.
- Policy: **anyone can INSERT** (accountless sharing) but SELECT is intentionally handled by edge functions using the service role, so callers can never enumerate other rows by code or list the table.

### Storage bucket `shared-files`

- **Private.** No public URL.
- Object keys look like `<CODE>/<index>-<8-byte-random-hex>-<sanitised-filename>`. The random suffix makes enumeration by code+index useless.
- Uploads use the `tus` resumable protocol over `POST /storage/v1/upload/resumable` with 6 MB chunks.
- Downloads are only possible via `get-share-file`, which validates the row is not expired and that the requested `path` is in that row's `storage_paths` array before minting a 10-minute signed URL.

---

## Create-share flow

Everything lives in [`src/lib/sharing.ts`](src/lib/sharing.ts) and is wired up by [`src/components/ShareCreator.tsx`](src/components/ShareCreator.tsx).

1. **Room code** is generated client-side from a Crockford-ish alphabet that excludes `I`, `O`, `0`, `1` to avoid ambiguous characters:

   ```ts
   const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
   ```

2. **Text**
   - Optionally AES-GCM-encrypt via `crypto.ts`.
   - Insert row (`type='text'`, `content=<plaintext|ciphertext>`, `encrypted=<bool>`).
   - Return `CODE` (plain) or `CODE-<base64url-key>` (encrypted).

3. **Files** — routing depends on size and whether encryption was requested:

   ```text
   encrypted && total ≤ 3.5 MB   → inline (base64 in `content`)
   otherwise                     → storage (tus resumable upload)
   ```

   **Inline files** are read with `FileReader.readAsDataURL`, wrapped in a JSON array `[ { name, type, dataUrl }, ... ]`, AES-GCM-encrypted, and inserted. `file_type` is set to `application/x-multi-file` for bundles.

   **Storage files** are uploaded one by one with `tus-js-client` (6 MB chunks, retries at 0/1s/3s/5s/10s). Progress from each `onProgress` callback is aggregated across all files and reported to the UI as a single 0..1 fraction. After all uploads succeed a single row is inserted with `content='{"storage":true,"count":N}'` and the parallel arrays `storage_paths[]`, `file_names[]`, `file_types[]`, `file_sizes[]`.

4. **Result** is displayed as: the 6-char room code, a QR code encoding the full token, a copy button, and — for encrypted shares — the full `CODE-KEY` token.

---

## Retrieve-share flow

Driven by [`src/components/ShareRetriever.tsx`](src/components/ShareRetriever.tsx):

1. User types either a plain `CODE` or a full `CODE-KEY` token.
2. If the input contains a dash, it is treated as a full token and `retrieveShare` is called directly.
3. Otherwise the client calls `checkShareEncryption` (which hits `get-share` with `checkOnly: true`). If the share exists but is encrypted, the UI prompts for the decryption key and then re-calls `retrieveShare` with `CODE-KEY`.
4. `retrieveShare`:
   - Invokes the `get-share` edge function with the normalised uppercase code.
   - Server returns the row if `expires_at > now()`, otherwise `{ item: null }`.
   - For storage rows it resolves signed URLs by calling `get-share-file` once per `storage_paths[i]` in parallel.
   - For inline encrypted rows it calls `decrypt(ciphertext, key)` and parses the JSON envelope for files.
5. UI renders the text (with copy button) or a list of files with per-file download buttons and a "Download all" fanout.

Signed URLs are cross-origin, so the download anchor sets `target="_blank"` when using `f.url` to avoid the browser navigating away from the app.

---

## End-to-end encryption

`src/lib/crypto.ts` is a thin wrapper around the browser's Web Crypto API:

- **Algorithm:** AES-GCM, 128-bit key, 12-byte random IV.
- **Payload layout:** `base64url( IV ‖ ciphertext )`, stored in `shared_items.content`.
- **Key transport:** the raw key is exported (`raw` format), base64url-encoded, and appended to the room code as `CODE-<key>`. This mimics the "fragment key" pattern used by services like Firefox Send — the server never sees the key because it lives after the `-` that the client splits on before sending anything to the server.
- **Trust boundary:** the server (edge function + database) sees only ciphertext + IV. A leak of the DB row is not enough to read the payload; you also need the key that only ever left the sender's browser as part of the token they handed to the recipient.

For files, the plaintext being encrypted is a JSON array of `{name, type, dataUrl}` objects, so the file names and MIME types are also encrypted.

---

## Edge Functions

All three functions live under `supabase/functions/` and run on Deno.

### `get-share`

- Accepts `{ code, checkOnly? }`.
- Validates the code matches `/^[A-Z0-9]{6}$/`.
- Uses the **service role** to look up the row by `code` filtered by `expires_at > now()`.
- `checkOnly: true` → returns `{ found, encrypted, type }` (no ciphertext, no metadata).
- Full call → returns the full row (or `{ item: null }`).

The service role is used deliberately — the RLS policy blocks anonymous SELECT so that clients cannot enumerate the table; the edge function is the single reader and it applies its own filter (`code = ? AND expires_at > now()`).

### `get-share-file`

- Accepts `{ code, path }`.
- Validates both. Looks up the row, requires the row to be un-expired, and requires that `path` is a member of `storage_paths`.
- Calls `supabase.storage.from('shared-files').createSignedUrl(path, 600)` — a 10-minute signed URL.
- Returns `{ url }`.

This is the only entry point that can produce a URL for the private bucket. Without a valid room code you can't guess a path (random 8-byte suffix per object), and without the row you can't sign.

### `mcp`

Auto-generated by the `@lovable.dev/mcp-js` Vite plugin from `src/lib/mcp/index.ts` and its tool files. Do not hand-edit — the plugin refuses to overwrite user-authored versions. It implements MCP Streamable HTTP and dispatches to the two tools below.

---

## MCP server

`src/lib/mcp/index.ts` defines a public (no-auth) MCP server named **DropZone MCP**:

- **`create_text_share`** — creates an ephemeral text share. Args: `{ text, expiryMinutes? }`. Returns the room code and expiry.
- **`retrieve_share`** — fetches a share by 6-char room code via the `get-share` function. Returns text for plain shares, or a hint to use the DropZone app for encrypted/file shares (since decryption/downloads are client-only).

The tool metadata is mirrored to `.lovable/mcp/manifest.json`, which powers the "Add to Lovable / ChatGPT / Claude / Cursor" connector card. Because the tools only read/write ephemeral, code-addressed data with no per-user surface, public access is intentional and captured in the security memory.

To connect from a client, point it at:

```
https://<supabase-project>.supabase.co/functions/v1/mcp
```

---

## Frontend, design system & SEO

### Routing

- `src/App.tsx` sets up `BrowserRouter`, TanStack Query, Toaster, Tooltip provider.
- Two routes: `/` (`Index`) and `*` (`NotFound`).

### Design system

- Terminal-inspired dark theme, JetBrains Mono headings, green accent (`hsl(142, 70%, 50%)`).
- All colors/gradients/shadows are semantic tokens defined in `src/index.css` and consumed via Tailwind classes (`bg-primary`, `text-primary-foreground`, `border-border`, `shadow-[var(--terminal-glow-strong)]`, …). No hardcoded hex values in components.
- shadcn/ui components live under `src/components/ui/` and inherit these tokens.

### SEO

- `index.html` ships a real title, meta description, canonical, Open Graph and Twitter Card tags, plus a `WebApplication` JSON-LD block.
- `react-helmet-async` (v2, pinned to stay on React 18) is mounted via `HelmetProvider` in `main.tsx` and used per-route (e.g. `NotFound` sets `robots: noindex`).
- `public/sitemap.xml`, `public/robots.txt` (with `Sitemap:` directive) and `public/llms.txt` are all shipped.

### Accessibility

- Single `<h1>` in a `<main>` landmark on the home page.
- Every icon-only button (copy, remove file) has an `aria-label`; the icons themselves are `aria-hidden`.
- Focus rings use `focus:ring-primary`.

---

## Security posture

Captured in `mem://security` and enforced in code:

- **No anonymous reads** on `shared_items`. Every read goes through an edge function that filters by `expires_at`.
- **Private storage bucket.** Signed URLs are the only download path and expire after 10 minutes.
- **Server-enforced expiry**, both by the DB trigger (writes) and by the query filter (reads).
- **No service-role key in client code.** The service role only exists inside the Deno edge functions.
- **E2E ciphertext + client-side key.** The server cannot decrypt E2E shares.
- **Public MCP is intentional and scoped.** It exposes only `create_text_share` (write-only, returns a fresh code) and `retrieve_share` (read by explicit code). It cannot list, enumerate or dump.
- Random per-object suffix defeats path enumeration attempts against Storage.

Accepted risks: anyone with a room code can retrieve a non-encrypted share; anyone with a full token can retrieve an encrypted share. This is the whole product.

---

## Local development

```bash
bun install       # or npm install / pnpm install
bun dev           # Vite dev server on :8080
```

Environment variables are injected automatically by Lovable Cloud and land in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

**Do not edit** `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, or `supabase/config.toml` — they are regenerated by tooling.

Edge functions can be run locally with the Supabase CLI:

```bash
supabase functions serve get-share --no-verify-jwt
supabase functions serve get-share-file --no-verify-jwt
supabase functions serve mcp --no-verify-jwt
```

Database changes go into a new file under `supabase/migrations/`. Every `CREATE TABLE public.*` migration **must** include explicit `GRANT` statements — Supabase does not grant default privileges on `public`.

---

## Deployment

Publish from Lovable. Migrations run and edge functions are redeployed on publish. Any change to the MCP entry file or its tools regenerates `supabase/functions/mcp/index.ts` at build time; the function must be redeployed for the change to be live.

- Preview: `https://id-preview--<uuid>.lovable.app`
- Production: `https://quickshareroom.lovable.app`

---

## API reference

### `POST /functions/v1/get-share`

Request:
```json
{ "code": "AB3D7H", "checkOnly": false }
```

Response (`checkOnly: false`):
```json
{
  "item": {
    "id": "…", "code": "AB3D7H", "type": "file",
    "content": "{\"storage\":true,\"count\":2}",
    "encrypted": false,
    "file_name": "multi:2",
    "file_type": "application/x-storage-share",
    "storage_paths": ["AB3D7H/0-…-report.pdf", "AB3D7H/1-…-video.mp4"],
    "file_names": ["report.pdf", "video.mp4"],
    "file_types": ["application/pdf", "video/mp4"],
    "file_sizes": [1048576, 734003200],
    "created_at": "...", "expires_at": "..."
  }
}
```

Response (`checkOnly: true`):
```json
{ "found": true, "encrypted": false, "type": "file" }
```

### `POST /functions/v1/get-share-file`

Request:
```json
{ "code": "AB3D7H", "path": "AB3D7H/0-…-report.pdf" }
```

Response:
```json
{ "url": "https://…/storage/v1/object/sign/shared-files/AB3D7H/0-…-report.pdf?token=…" }
```

### MCP tools

`create_text_share`:
```json
{ "text": "hello world", "expiryMinutes": 15 }
→ { "roomCode": "AB3D7H", "expiresAt": "...", "expiresInMinutes": 15 }
```

`retrieve_share`:
```json
{ "roomCode": "AB3D7H" }
→ { "roomCode": "AB3D7H", "type": "text", "text": "hello world", "expiresAt": "..." }
```

---

## Method-by-method reference

### `src/lib/sharing.ts`

| Function | Signature | Purpose |
| --- | --- | --- |
| `generateCode()` | `() => string` | 6 chars from a no-ambiguous-glyphs alphabet. |
| `readFileAsDataUrl(file)` | `(File) => Promise<string>` | `FileReader.readAsDataURL` wrapper for the inline path. |
| `uploadFileToStorage(file, code, i, onProgress)` | tus upload | Resumable upload with 6 MB chunks; returns the storage path. |
| `createTextShare(text, opts)` | `(string, CreateShareOptions) => Promise<{token, encrypted}>` | Text branch. Encrypts if `opts.encrypted`. |
| `createFileShare(file, opts)` | shortcut | Calls `createMultiFileShare([file], opts)`. |
| `createMultiFileShare(files, opts)` | files branch | Picks inline vs storage path, uploads, inserts the row. |
| `shouldGoInline(files, encrypted)` | internal | True only when encryption is on AND total ≤ 3.5 MB. |
| `fetchSignedUrl(code, path)` | internal | Wraps `get-share-file` invoke. |
| `retrieveShare(token)` | `(string) => Promise<SharedItem \| null>` | Splits `CODE-KEY`, invokes `get-share`, decrypts / resolves signed URLs. |
| `checkShareEncryption(code)` | `(string) => Promise<{found, encrypted}>` | Cheap probe with `checkOnly: true`. |
| `getTimeRemaining(item)` | `(SharedItem) => string` | Formats `"Xm Ys"` / `"Expired"`. |
| `formatBytes(n)` | `(number) => string` | Human-readable size (B / KB / MB / GB). |
| `EXPIRY_OPTIONS`, `MAX_FILE_SIZE`, `MAX_INLINE_FILE_BYTES` | constants | 5 min – 2 h, 10 GB, ~3.5 MB. |

### `src/lib/crypto.ts`

| Function | Purpose |
| --- | --- |
| `generateKey()` | Fresh AES-GCM-128 `CryptoKey`. |
| `exportKey(key)` | Raw key → base64url string embedded in the token. |
| `importKey(str)` | Reverse of `exportKey`, for `decrypt`-only use. |
| `encrypt(plaintext)` | Returns `{ ciphertext, keyString }`. IV is random 12 bytes, prepended to ciphertext before base64url. |
| `decrypt(ciphertext, keyString)` | Peels the IV back off, decrypts, returns plaintext. |
| `toBase64Url` / `fromBase64Url` | URL-safe base64 helpers (no `+`, `/`, `=`). |

### `src/lib/mcp/tools/`

| Tool | Behavior |
| --- | --- |
| `create_text_share.ts` | Inserts directly into `shared_items` using the publishable key (RLS-governed). Returns the room code. |
| `retrieve_share.ts` | Calls the `get-share` edge function. Returns text for plain shares, or metadata + a hint for file/encrypted shares. |

### Edge functions

| File | Deno handler |
| --- | --- |
| `supabase/functions/get-share/index.ts` | `Deno.serve` handler for the row lookup. Service-role client, filters by `expires_at`. |
| `supabase/functions/get-share-file/index.ts` | `Deno.serve` handler that validates the path belongs to a valid row and returns a 10-minute signed URL. |
| `supabase/functions/mcp/index.ts` | Auto-generated `Deno.serve(createSupabaseHandler(mcp))` that serves the MCP protocol. |

---

## Roadmap

- Optional password-gate on top of E2E (PBKDF2-derived key).
- Server-side scheduled cleanup of expired storage objects (currently rely on bucket lifecycle).
- Recipient-side "burn after reading" (delete row on first successful retrieve).
- Rate limiting on `get-share` per IP to slow down brute-force enumeration of the 6-char code space.

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

MIT License

Copyright (c) 2026 Arhan Shaikh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
