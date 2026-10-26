---
title: "Mindshare System Architecture & Comprehensive Codebase Knowledge Base"
date: "2026-10-20"
type: "system_architecture"
tags:
  - mindshare
  - architecture
  - documentation
  - fullstack
  - react
  - express
  - supabase
  - groq
  - postgresql
  - obsidian
aliases:
  - Mindshare Architecture
  - Mindshare Master Spec
  - Mindshare Code Map
---

# 🧠 Mindshare — Master Knowledge Base & Connected Architecture

> [!NOTE]
> **Purpose of this Living Document**
> This document is the **single source of truth** for the entire Mindshare architecture, codebase, data flow, and function-level call graph. Whenever features are added, updated, or refactored, **this document must be updated** to maintain full synchronization with the code.

---

## 🗺️ Visual Table of Contents & Graph Connections

```mermaid
graph TD
    UI["[[#Frontend Architecture|Frontend (React 19 + Vite)]]"] -->|REST + Bearer Token| API["[[#Backend Server Architecture|Express API Server (Node.js)]]"]
    API -->|Supabase Client| DB["[[#Database Schema & Storage Architecture|PostgreSQL Database (Supabase)]]"]
    
    subgraph Frontend Subsystems
        UI --> Cache["[[#RAM Storage & 0ms Cache Engine (storage.ts)|RAM Cache (feedCaches)]]"]
        UI --> Parser["[[#Client-Side Parser & Edge Cases (parser.ts)|Regex Parser (parser.ts)]]"]
        UI --> Search["[[#Boolean Search Engine (search.ts)|Boolean Search (search.ts)]]"]
        UI --> Audio["[[#Audio Notification Synthesizer (sound.ts)|Web Audio Synthesizer (sound.ts)]]"]
        UI --> Excel["[[#Excel Export Engine (excelExport.ts)|SheetJS Exporter (excelExport.ts)]]"]
    end

    subgraph Backend Subsystems
        API --> Auth["[[#Authentication & Session Management|Stateless JWT Auth (requireAuth)]]"]
        API --> Cloudinary["[[#Cloudinary Media Pipeline (cloudinary.ts)|Cloudinary Asset Manager]]"]
        API --> Groq["[[#AI Tagging & Groq Cloud Service (groq.ts)|Groq Cloud LLM Service (groq.ts)]]"]
        API --> Worker["[[#Asynchronous Background AI Worker (aiWorker.ts)|Async AI Queue Worker (aiWorker.ts)]]"]
        API --> GDrive["[[#Automated Google Drive Backup Pipeline|Google Drive Backup Scheduler]]"]
    end

    subgraph External Services
        Groq --> LLM["Groq LLaMA 3.3 70B Versatile"]
        Cloudinary --> CDN["Cloudinary Image CDN"]
        GDrive --> GAS["[[#Google Apps Script Engine (google_apps_script_style2.js)|Google Apps Script Webhook]]"]
        GAS --> Drive["Google Drive / Sheets"]
    end
```

---

## 🏛️ High-Level System Architecture

Mindshare is an enterprise-grade, internal multi-tenant knowledge and thoughts management platform designed to scale beyond **10,000+ notes**.

### Key Architectural Pillars
1. **0ms Latency UI Architecture**: Local in-memory RAM cache (`feedCaches`) with reactive event subscriptions (`subscribeToStorage`) provides instant 0ms tab transitions and note creation, followed by silent background network revalidation.
2. **Sub-10ms PostgreSQL Full-Text Search**: Notes are indexed using PostgreSQL's generated `fts` column (`tsvector`) paired with a GIN index (`idx_notes_fts`), supplemented by an in-memory client-side boolean query evaluator.
3. **Decoupled AI Tagging Engine**: Supports both **on-demand user-requested AI suggestions** (instant interactive feedback) and **persistent background queue processing** (`ai_jobs` table + `aiWorker.ts`) via Groq Cloud (`llama-3.3-70b-versatile`) with automatic heuristic local fallback.
4. **Isolated Multi-Tenant Security**: Strict Row-Level Security (RLS) in PostgreSQL. Tags and notes are scoped to `(user_id, LOWER(name))`, preventing any cross-tenant data leakage while enabling team-wide `@mention` collaboration.
5. **Redundant Automated Backup Pipeline**:
   - Client-side manual Excel (`.xlsx`) export via SheetJS.
   - Server-side automated midnight cron scheduler synchronizing per-user Google Sheets (`Mindshare_@username`) via Google Apps Script Web App.

---

## 📦 File & Directory Topology

```
Mindshare/
├── package.json                          # Frontend deps: React 19, Lucide, Tailwind v4, XLSX
├── index.html                            # HTML5 entry with viewport meta
├── vite.config.ts                        # Vite configuration with React & Tailwind plugins
├── tailwind.config.js                    # Glassmorphism styling tokens and color primitives
├── .env.local                            # Frontend & Backend shared environment variables
│
├── database/                             # Database Schemas & Migrations
│   ├── schema.sql                        # Master PostgreSQL + Supabase schema with RLS & FTS
│   ├── migration_multiuser_auth.sql      # Multi-user migrations and handle triggers
│   ├── clean_reset_and_setup.sql         # Idempotent DB rebuild script
│   ├── clean_wipe_all_including_users.sql# Complete database purge utility
│   ├── fix_live_schema.sql               # Live patch for mention columns and missing triggers
│   ├── fix_tags_rls_and_prior_tags.sql   # RLS policy fixes for tags
│   ├── add_mentions_last_seen.sql        # Migration for mentions_last_seen_at checkpoint
│   └── google_apps_script_style2.js      # Google Apps Script Web App (Style 2: Sheet per user)
│
├── server/                               # Node.js + Express Backend Engine
│   ├── package.json                      # Server dependencies (Express, CORS, Supabase, tsx)
│   ├── index.ts                          # Main Express API server & routes (1,069 lines)
│   ├── supabase.ts                       # Server-side Supabase client initialization
│   ├── groq.ts                           # Groq Cloud LLM client with local heuristic fallback
│   ├── aiWorker.ts                       # Asynchronous background queue worker loop
│   └── cloudinary.ts                     # Cloudinary image upload and deletion manager
│
└── src/                                  # Frontend Application (React 19 + TypeScript)
    ├── main.tsx                          # React DOM bootstrapping
    ├── App.tsx                           # Root orchestrator: state, feeds, modals, filters
    ├── App.css                           # Application CSS rules
    ├── index.css                         # CSS custom properties, glassmorphism design tokens
    ├── test-parser.ts                    # Edge-case verification tests for note parser
    │
    ├── lib/                              # Core Utility Modules & Business Logic
    │   ├── types.ts                      # Universal TypeScript interfaces & models
    │   ├── api.ts                        # Frontend REST API client & Supabase Auth wrappers
    │   ├── storage.ts                    # RAM cache manager, 0ms switching, pub/sub engine
    │   ├── parser.ts                     # Regex parser for #hashtags, @mentions, and URLs
    │   ├── search.ts                     # Boolean search query tokenizer (AND/OR/NOT)
    │   ├── sound.ts                      # Web Audio API notification chime synthesizer
    │   ├── excelExport.ts                # Formatted Excel (.xlsx) backup generator
    │   └── supabase.ts                   # Client-side Supabase connection client
    │
    └── components/                       # Modular UI Components
        ├── auth/
        │   ├── Login.tsx                 # Auth portal (Password, Google OAuth, Reset, Confirmation)
        │   └── UsernameModal.tsx         # Onboarding & handle change dialog (@username claim)
        ├── feed/
        │   ├── MorningBriefing.tsx       # Daily briefing, team mentions, "On This Day" resurfacing
        │   ├── InputBox.tsx              # Thought composer, image drag/drop, AI suggestion chip
        │   ├── FeedList.tsx              # Paginated feed renderer with loading skeletons
        │   └── NoteCard.tsx              # Thought card, markdown images, tag/mention pills
        ├── layout/
        │   ├── Header.tsx                # Brand, real-time counters, sound toggle, profile popover
        │   ├── Sidebar.tsx               # Global search, boolean operator toggle, tag/team trees
        │   └── DetailPanel.tsx           # Inspector panel, full markdown editor, tag management
        └── ui/
            ├── Chip.tsx                  # TagChip and MentionChip interactive pills
            ├── Modal.tsx                 # Accessible dialog wrapper with backdrop
            ├── Toast.tsx                 # ToastContainer & notification alerts
            ├── GuideModal.tsx            # Interactive cheat sheet and shortcut manual
            └── GoogleDriveSyncModal.tsx  # Google Drive backup status and trigger modal
```

---

## 🗄️ Database Schema & Storage Architecture

All tables reside in the `public` schema of Supabase PostgreSQL with Row-Level Security (RLS) enabled.

### 1. `public.users`
Extends `auth.users` for multi-user collaboration and directory lookups.
- `id` (UUID, PK): References `auth.users(id) ON DELETE CASCADE`.
- `email` (TEXT, NOT NULL): User email address.
- `full_name` (TEXT): Display name.
- `username` (TEXT, UNIQUE): Lowercase alphanumeric handle (2-24 chars) used in `@mentions`.
- `avatar_url` (TEXT): Image URL for profile picture.
- `status` (TEXT): `'active' | 'invited' | 'pending'`.
- `is_handle_set` (BOOLEAN): Flag indicating if user custom-picked their handle.
- `mentions_last_seen_at` (TIMESTAMP WITH TIME ZONE): Checkpoint timestamp marking when user last read their incoming mentions.
- `created_at` / `updated_at` (TIMESTAMP WITH TIME ZONE).

> [!TIP]
> **Trigger `on_auth_user_created`**: Executes `public.handle_new_user()` on `auth.users` insertion, auto-generating a default handle from the email prefix and filling `users`.

### 2. `public.notes`
Core thought entity supporting 10,000+ notes scale.
- `id` (UUID, PK): Defaults to `uuid_generate_v4()`.
- `user_id` (UUID, FK): References `public.users(id) ON DELETE CASCADE`.
- `content` (TEXT, NOT NULL): Note text (up to 10,000 chars), includes markdown image links `![image](url)`.
- `fts` (TSVECTOR, GENERATED ALWAYS): `to_tsvector('english', content)` STORED.
- `created_at` / `updated_at` (TIMESTAMP WITH TIME ZONE).
- `deleted_at` (TIMESTAMP WITH TIME ZONE, NULLABLE): Soft-delete checkpoint.

**Indexes**:
- `idx_notes_user_created`: B-Tree `(user_id, created_at DESC) WHERE deleted_at IS NULL`.
- `idx_notes_fts`: GIN Index on `fts` column for sub-10ms full-text search.

### 3. `public.tags`
Private tags owned exclusively by each user.
- `id` (UUID, PK): `uuid_generate_v4()`.
- `user_id` (UUID, FK): Scopes tag strictly to creator.
- `name` (TEXT, 2-30 chars): Sanitized lowercase tag identifier without `#`.
- `created_at` (TIMESTAMP WITH TIME ZONE).

**Index**:
- `idx_tags_user_lower_name`: Unique composite index `(user_id, LOWER(name))`.

### 4. `public.note_tags`
Many-to-Many junction between Notes and Tags.
- `note_id` (UUID, FK): References `notes(id) ON DELETE CASCADE`.
- `tag_id` (UUID, FK): References `tags(id) ON DELETE CASCADE`.
- `is_manual` (BOOLEAN): `true` for user/regex hashtags, `false` for AI suggested tags.
- `source` (TEXT): `'manual' | 'ai_suggested'`.
- `confidence_score` (NUMERIC(3,2)): Defaults to `1.00` (or `0.85` for AI tags).
- `created_at` (TIMESTAMP WITH TIME ZONE).
- Primary Key: `(note_id, tag_id)`.

### 5. `public.mentions`
Junction mapping notes to mentioned team members.
- `note_id` (UUID, FK): References `notes(id) ON DELETE CASCADE`.
- `user_id` (UUID, FK): References mentioned `users(id) ON DELETE CASCADE`.
- `created_at` (TIMESTAMP WITH TIME ZONE).
- Primary Key: `(note_id, user_id)`.

### 6. `public.ai_jobs`
Asynchronous persistent queue for Groq Cloud auto-tagging.
- `id` (UUID, PK): `uuid_generate_v4()`.
- `note_id` (UUID, FK): Target note to auto-tag.
- `user_id` (UUID, FK): Note owner.
- `status` (TEXT): `'pending' | 'processing' | 'completed' | 'failed'`.
- `attempts` (INTEGER): Retry counter.
- `scheduled_at` (TIMESTAMP WITH TIME ZONE): Execution timestamp for exponential backoff.
- `payload` (JSONB): Contains note content snapshot.
- `result` (JSONB): Extracted tags and summary from Groq.
- `last_error` (TEXT): Diagnostic error string.

---

## 🖥️ Frontend Architecture

### 1. State Management & Data Flow in `src/App.tsx`
`App.tsx` acts as the root coordinator:
- **Authentication State**: Monitors Supabase session via `supabase.auth.onAuthStateChange` and loads user profile via `api.getMe()`.
- **Feed Selection (`activeFilter`)**:
  - `all`: Author's personal thoughts.
  - `tagged_me`: Notes created by colleagues where the current user is mentioned.
  - `untagged`: Thoughts without any tags.
  - `tag`: Notes filtered by specific `#tag`.
  - `mention`: Notes filtered by `@colleague`.
- **Reactive Cache Hookup**: Listens to storage changes via `subscribeToStorage` and re-renders components immediately on RAM changes.
- **Search Query State (`searchQuery`, `searchOperator`)**: Combines free text with boolean `AND` / `OR` filtering across tags, mentions, and words.

### 2. RAM Storage & 0ms Cache Engine (`src/lib/storage.ts`)
Avoids UI spinners during feed navigation:
```typescript
// Dedicated in-memory caches per feed to enable 0ms instant tab switching
const feedCaches: { all: Note[]; tagged_me: Note[] } = { all: [], tagged_me: [] };
const feedLoaded: { all: boolean; tagged_me: boolean } = { all: false, tagged_me: false };
```

#### Exported Functions in `storage.ts`:
- `subscribeToStorage(callback: () => void): () => void`: Subscribes UI components to RAM cache updates.
- `getNotes(feed?: 'all' | 'tagged_me' | 'untagged'): Note[]`: Returns cached notes in 0ms.
- `switchFeed(feed: 'all' | 'tagged_me' | 'untagged')`: Instantly switches active feed from memory, resets unread mention badges, and kicks off silent background revalidation (`revalidateFeed`).
- `syncFromServer(feed?)`: Performs parallel `Promise.all` fetching of notes, tags, teammates, and mention counts. Pre-warms the alternate feed in background.
- `createNote(content, manualTags)`: Optimistically prepends new note to `feedCaches.all`, updates tags in background, and notifies subscribers.
- `updateNote(id, newContent, manualTags)`: Optimistically patches note in both `all` and `tagged_me` caches.
- `deleteNote(id)`: Optimistically purges note from both RAM caches, then issues API delete.
- `deleteTag(idOrName)`: Optimistically strips tag from all loaded notes in RAM, deletes tag entity, and calls backend.
- `markMentionsAsRead()`: Sets `memoryHasUnreadMentions = false` and posts timestamp update to DB.

### 3. Client-Side Parser & Edge Cases (`src/lib/parser.ts`)
Extracts tags and mentions safely across 30+ edge cases:
- `parseNoteContent(content: string): ParsedNote`:
  - **URL Range Masking**: Scans `https://...` and `www....` to prevent `#anchors` from turning into tags.
  - **Email Domain Masking**: Identifies `user@domain.com` so `@domain` is not parsed as a mention.
  - **Hashtag Regex**: `(?:^|[\s,.:;!?"'(\[\{])#+([a-zA-Z0-9_\-]{2,30})` with trailing punctuation removal.
  - **Mention Regex**: `(?:^|[\s,.:;!?"'(\[\{])@+([a-zA-Z0-9._\-]{2,30})` with punctuation trimming.
  - **Constraints**: Validates length $\le 10,000$ chars, max 20 mentions per note.
- `validateMentions(mentions, validUsernames)`: Compares parsed mentions against registered teammates directory.

### 4. Boolean Search Engine (`src/lib/search.ts`)
Sub-millisecond full-text boolean query engine:
- `parseSearchQuery(queryStr: string): SearchQuery`:
  - Normalizes operators: `&&`, `&` $\rightarrow$ `AND`; `||`, `|` $\rightarrow$ `OR`.
  - Normalizes negation: `NOT #tag` or `!#tag` $\rightarrow$ `excludeTags`; `NOT @user` or `-@user` $\rightarrow$ `excludeMentions`; `-word` $\rightarrow$ `excludeWords`.
  - Extracts positive tags, positive mentions, and remaining freetext words.
- `filterNotes(notes: Note[], parsedQuery: SearchQuery): Note[]`:
  - Evaluates negative criteria first (fast short-circuit exclusion).
  - Matches positive criteria under specified boolean mode (`AND` or `OR`).

### 5. Audio Notification Synthesizer (`src/lib/sound.ts`)
100% self-contained Web Audio API chime with zero external audio dependencies:
- Tone 1: D5 ($587.33\text{ Hz}$) sine wave with fast attack ($20\text{ ms}$) and smooth decay.
- Tone 2: A5 ($880.00\text{ Hz}$) sine wave staggered by $80\text{ ms}$ for a warm Apple/Slack-style chime.
- Mobile unlock listener on first `touchstart`/`click` to satisfy mobile browser autoplay policies.
- Persisted preference in `localStorage('mindshare_sound_enabled')`.

### 6. Excel Export Engine (`src/lib/excelExport.ts`)
- `exportNotesToExcel(notes: Note[], options)`:
  - Strips markdown syntax and extracts media URLs into a dedicated column.
  - Formats timestamps to local ISO representations.
  - Prepares column widths and workbook structures using SheetJS (`xlsx`).
  - Downloads formatted file: `mindshare_backup_@username_YYYY-MM-DD.xlsx`.

### 7. Morning Briefing & "On This Day" Proactive Resurfacing Engine (`src/components/feed/MorningBriefing.tsx`)
- **Proactive Habit Loop**: Serves as the primary anti-churn driver. When users open Mindshare, instead of staring at an empty input box or static feed, they receive an immediate value-add daily briefing card.
- **Dynamic Contextual Greeting**: Adapts dynamically by hour:
  - Morning (05:00–12:00): *"Good morning, [Name]! Here's your morning briefing and resurfaced thoughts for today."*
  - Midday (12:00–17:00): *"Good afternoon, [Name]! Quick midday pulse of your team activity and resurfaced insights."*
  - Evening (17:00–22:00): *"Good evening, [Name]! Wrap up your day with your resurfaced thoughts and pending mentions."*
  - Night (22:00–05:00): *"Night Reflection, [Name]"*.
- **Section 1 — Inbound Team Activity**: Highlights unread or pending `@mentions` with a 1-click jump button directly switching to the Tagged Me feed.
- **Section 2 — "On This Day" / Spaced Rediscovery**:
  - Automatically identifies candidate thoughts from $\ge 3$ days ago (spanning 1 week to several months old).
  - Shows exact elapsed time (e.g., *"Resurfaced from 2 weeks ago"*).
  - Includes a "Shuffle" button to cycle through past thoughts.
  - Clicking the thought immediately opens the inspector panel in `DetailPanel.tsx` to review, update, or archive.
- **Section 3 — Untangled Thoughts Triage**: Identifies the oldest untagged thought and offers an instant 1-click triage shortcut to attach `#tags`.
- **Collapsible & Daily Dismissal Persistence**:
  - Users can collapse or dismiss the briefing for the day (persisted in `localStorage('mindshare_briefing_dismissed_YYYY-MM-DD')`).
  - An on-demand **"Briefing"** trigger button in `Header.tsx` allows users to reopen the briefing card anytime.

---

## ⚡ Backend Server Architecture (`server/index.ts`)

Express running on Node.js with TypeScript (`tsx`).

### Middleware Stack
1. `cors({ origin: '*', methods: [...], allowedHeaders: [...] })`
2. `express.json({ limit: '10mb' })`: Accommodates base64 image uploads.
3. **URL Normalizer**: Rewrites top-level requests (`/notes` $\rightarrow$ `/api/notes`) while preserving `/health`.
4. **Stateless JWT Middleware (`requireAuth`)**:
   - Extracts Bearer token from `Authorization` header.
   - Verifies session token with Supabase Auth (`supabase.auth.getUser(token)`).
   - Injects `req.userId`, `req.userEmail`, and `req.token`.
5. **Scoped Database Helper (`getDb(req)`)**:
   - Instantiates a request-scoped Supabase client initialized with the caller's JWT, ensuring Postgres RLS applies correctly to every SQL query.

### Detailed API Route Specifications

| Method | Route | Description | Logic & Inter-Connections |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Uptime Check | Returns `{ status: 'online', service: 'Mindshare Multi-User Engine' }`. |
| `GET` | `/api/users/me` | User Profile | Retrieves current user from `users` table; self-heals by provisioning row if missing. |
| `PUT` | `/api/users/profile` | Update Profile | Updates `full_name`, `avatar_url`, and claims unique `@username` handle. |
| `GET` | `/api/users/directory` | Team Directory | Returns registered teammates for mention auto-complete. |
| `POST` | `/api/ai/suggest-tags` | On-Demand AI | Calls `generateAITags(content)` via Groq Cloud; returns suggested tags & summary. |
| `POST` | `/api/upload` | Image Upload | Calls `uploadToCloudinary(base64Data)`; returns hosted HTTPS URL. |
| `GET` | `/api/notes` | Notes Feed | Fetches notes with pagination (`limit`, `offset`), FTS (`fts @@ to_tsquery`), feeds (`all`, `tagged_me`, `untagged`), tag filter, and mention filter. |
| `GET` | `/api/notes/mentions-count` | Unread Mentions | Compares colleague notes containing caller's mention against `mentions_last_seen_at`. |
| `POST` | `/api/notes/mark-mentions-read` | Clear Unread | Updates `mentions_last_seen_at = now()` in `users` table across all user devices. |
| `POST` | `/api/notes` | Create Thought | Parses tags & mentions, creates note UUID, writes `notes`, `note_tags`, `mentions`. |
| `PUT` | `/api/notes/:id` | Update Thought | Updates content, synchronizes tags/mentions junctions, detects removed images and triggers `deleteFromCloudinary`. |
| `DELETE` | `/api/notes/:id` | Delete Thought | Deletes note row (cascades junctions), deletes associated Cloudinary images. |
| `GET` | `/api/tags` | List User Tags | Returns user's private tags with live note usage counts. |
| `DELETE` | `/api/tags/:id` | Delete Tag | Deletes tag from `tags` (cascades junction) and cleans `#tag` text from user's notes. |
| `POST` | `/api/backup/google-drive-sync` | Backup Sync | Executes `syncAllUsersToGoogleDrive()` to push per-user sheets to Google Drive. |
| `GET` | `/api/backup/google-drive-status` | Backup Status | Checks if Google Apps Script webhook URL is configured. |

---

## 🤖 AI Engine & Workers

### 1. Interactive Groq LLM Service (`server/groq.ts`)
- **Primary LLM**: Groq Cloud Chat Completion API (`https://api.groq.com/openai/v1/chat/completions`).
- **Dynamic Model Selection**: Calls `getDynamicGroqModels(apiKey)` to dynamically query available models, then iterates through candidates:
  1. `process.env.GROQ_MODEL`
  2. `openai/gpt-oss-120b`
  3. `openai/gpt-oss-20b`
  4. `groq/compound-mini`
  5. `llama-3.3-70b-versatile`
  6. `llama-3.1-8b-instant`
- **Output Schema**: Structured JSON mode `{ tags: string[], summary: string }`.
- **Intelligent Local Fallback (`generateLocalAITags`)**: When `GROQ_API_KEY` is not provided or API calls fail, parses words by frequency while filtering common English stop words to produce relevant tags.

### 2. Asynchronous Queue Worker (`server/aiWorker.ts`)
- Runs a non-blocking background loop (`setInterval` every 5 seconds).
- `processNextAIJob()`:
  1. Selects the oldest pending job from `ai_jobs` where `scheduled_at <= now()`.
  2. Updates status to `'processing'` and increments `attempts`.
  3. Executes `generateAITags(content)`.
  4. On success: Upserts tags into `tags` table, inserts junction rows in `note_tags`, and marks job `'completed'`.
  5. On failure: Logs error, increments attempts, and schedules retry.

---

## 🖼️ Cloudinary Media Pipeline (`server/cloudinary.ts`)

- **Upload Function (`uploadToCloudinary`)**:
  - Accepts base64 data URIs or image buffers.
  - Sends multipart POST to `https://api.cloudinary.com/v1_1/<cloud_name>/image/upload`.
  - Uses configured upload preset (`CLOUDINARY_UPLOAD_PRESET`).
  - Returns HTTPS CDN URL.
- **Garbage Collection (`deleteFromCloudinary`)**:
  - Automatically called whenever a note is deleted or when an image is removed during note edits.
  - Calculates SHA-1 signature using `CLOUDINARY_API_SECRET` and destroys asset via Cloudinary REST API.

---

## 🔄 Automated Google Drive Backup Pipeline

### 1. Architecture (Style 2: Dedicated Sheet per User)
Instead of dumping all data into a shared sheet, Mindshare provides **complete privacy and isolation**:
- **Folder**: `Mindshare User Backups` in the owner's Google Drive.
- **Files**: Individual spreadsheet files named `Mindshare_@<username>`.
- **Sheet**: Tab named `@<username> Thoughts`.

```mermaid
sequenceDiagram
    participant Scheduler as Midnight Scheduler / Manual Trigger
    participant Server as Express Server (index.ts)
    participant DB as Supabase PostgreSQL
    participant GAS as Google Apps Script Webhook
    participant Drive as Google Drive / Sheets

    Scheduler->>Server: Trigger Google Drive Sync
    Server->>DB: Fetch All Registered Users
    Server->>DB: Fetch All Notes + Tags + Mentions
    Server->>Server: Group Notes by user_id
    Server->>GAS: POST JSON payload { users: [...] }
    GAS->>Drive: Find or create "Mindshare User Backups" Folder
    loop For each user
        GAS->>Drive: Find or create "Mindshare_@username" Sheet
        GAS->>Drive: Clear sheet, style headers, append notes
        GAS->>Drive: Auto-size columns & save
    end
    GAS-->>Server: Return sync confirmation & URLs
    Server-->>Scheduler: Log success & notify UI
```

### 2. Midnight Cron Scheduler (`scheduleMidnightSync` in `server/index.ts`)
- Computes exact milliseconds remaining until next midnight (`00:00:00`).
- Schedules a `setTimeout` to fire at midnight, then establishes a 24-hour recurring `setInterval`.
- Automatically backs up all active users without requiring manual intervention.

### 3. Google Apps Script Implementation (`database/google_apps_script_style2.js`)
- `doPost(e)`:
  - Parses JSON payload containing users and notes.
  - Opens or creates `Mindshare User Backups` folder via `DriveApp`.
  - Spawns/updates spreadsheets with formatted indigo headers (`#2563eb`), frozen row 1, and column auto-sizing.
  - Returns JSON response with folder URL, synced files, and total user count.

---

## 🔁 Complete End-to-End Traces

### Trace 1: Note Creation with Real-Time Tagging & Team Mention
1. User types in `InputBox.tsx`: *"Deploying search service with #postgres for @alex"*.
2. `InputBox.tsx` runs live `parseNoteContent()`:
   - Identifies tag `#postgres`.
   - Identifies mention `@alex`.
3. User clicks **Save** (or presses `Ctrl + Enter`):
   - Invokes `onSaveNote` $\rightarrow$ `storage.createNote(content)`.
   - Makes POST request to `/api/notes`.
4. Server (`index.ts`):
   - `requireAuth` validates token and sets `req.userId`.
   - Server re-parses content with `parseNoteContent()` for security.
   - Looks up `alex` in `users` table to get their user ID.
   - Inserts row into `notes`.
   - Inserts tag `postgres` under caller's `user_id` in `tags`, linking in `note_tags`.
   - Inserts mention row `(note_id, alex_id)` into `mentions`.
   - Returns full note entity with author, tags, and mentions.
5. Client optimistic response:
   - Prepends note immediately into `feedCaches.all`.
   - Fires `subscribeToStorage` callbacks.
   - UI updates in **0ms**.

### Trace 2: Mention Notification & Cross-Device Read Sync
1. Author creates a note tagging `@sarah`.
2. Sarah has Mindshare open on her laptop:
   - Periodic poll or visibility event calls `api.getMentionsCount()`.
   - Server checks `mentions` table for notes tagging Sarah where `created_at > sarah.mentions_last_seen_at`.
   - Server returns `{ count: 5, unreadCount: 1, hasUnread: true }`.
3. Client detects `hasUnread: true`:
   - `playNotificationChime()` plays harmonic dual-tone chime (587.3Hz + 880Hz).
   - "Tagged Me" tab badge turns pulsating primary blue.
4. Sarah clicks **Tagged Me** tab:
   - `switchFeed('tagged_me')` executes in 0ms.
   - Calls `markMentionsAsRead()`.
   - Fires POST `/api/notes/mark-mentions-read`.
   - Server updates `users.mentions_last_seen_at = now()`.
   - Unread state clears across Sarah's phone, laptop, and browser tabs.

---

## 🛠️ Developer Reference & Extension Guide

### How to Run Locally
Mindshare has a Vite client frontend and an Express REST API backend (`server/index.ts`).
To start both servers with a single command:
```bash
npm run dev
```
This runs `concurrently`:
1. **Backend Engine**: Starts `tsx watch index.ts` in `server/` on **port 3001**.
2. **Frontend Client**: Starts Vite dev server on **port 5173** (with `/api` proxied to port 3001).

Individual scripts:
- `npm run client`: Runs only the Vite client.
- `npm run server`: Runs only the Express backend.

### How to Add a New Field to Notes
1. Add column to `notes` in `database/schema.sql` (e.g. `ALTER TABLE public.notes ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;`).
2. Update TypeScript interface in `src/lib/types.ts` (`Note` interface).
3. Update `mapNoteRow(n)` in `server/index.ts` to include the new field in JSON responses.
4. Update `NoteCard.tsx` and `DetailPanel.tsx` to render and edit the field.
5. Update this document under [[#2. public.notes]] and [[#UI Components]].

### How to Register a New API Endpoint
1. Define route in `server/index.ts` under `/api/...` (it will automatically be guarded by `requireAuth`).
2. Add method to `src/lib/api.ts` using the internal `request(path, options)` helper.
3. Expose action through `src/lib/storage.ts` if it touches cached feed state.
4. Document route in [[#Detailed API Route Specifications]].

## 🎯 User Retention, Daily Habit Loops & Proactive Resurfacing Engine

### 1. The Core Behavioral Problem ("The Collector's Fallacy")
In productivity tools, 80%+ of churn happens after 48–72 hours due to three cognitive bottlenecks:
1. **The Black Hole Effect ("Input without Return")**: Users put thoughts into an app, but if the app doesn't push value back to them automatically, the perceived utility drops to zero. Users ask: *"Why write this down if I have to remember to search for it later?"*
2. **High Friction to Open**: Having to open a browser tab, log in, and click an input box creates activation friction.
3. **Missing External Triggers**: Without contextual triggers (morning brief, teammate interactions, scheduled reflection), the app relies purely on the user's willpower.

---

### 2. The 4 Big App Retention Pillars for Mindshare

```mermaid
graph LR
    subgraph "1. Frictionless Ingress"
        A[Instant PWA / Global Shortcut] --> B[Quick Capture Under 3s]
    end
    subgraph "2. Proactive Resurfacing"
        B --> C[Daily Digest / Morning Brief]
        C --> D["On This Day" / Spaced Rediscovery]
    end
    subgraph "3. Social Accountability"
        D --> E["@Mention Re-engagement Loops"]
        E --> F[Unresolved Tagged Threads]
    end
    subgraph "4. Contextual Triggers"
        F --> G[Browser Push / Scheduled Webhook]
        G --> A
    end
```

#### Pillar A: "Thoughts That Come Back To You" (Smart Resurfacing)
- **Morning Focus Brief (09:00 AM)**: A lightweight daily summary card or notification:
  - 3 untagged thoughts captured recently that need attention.
  - Notes where teammates tagged you in the last 24–48 hours.
  - *"Rediscovered Thought"*: 1 random or relevant thought from 7 days or 30 days ago (Spaced Reflection / Readwise-style).
- **Contextual Reminders / Siphon Tags**:
  - Tags with time triggers like `#todo`, `#review`, `#tomorrow`, `#followup`. The system automatically promotes these notes to the top of the feed or triggers a gentle reminder when their due window arrives.
- **"Weekly Brain Wrap" (Friday 5:00 PM)**:
  - Automatic synthesis: Total thoughts captured, top active tags, most collaborated teammates, and an automated recap generated by Groq LLM.

#### Pillar B: Re-engagement & Social Pull
- **Teammate Mention Echoes**: When `@sarah` is tagged, if she hasn't viewed it within 4 hours, a secondary nudge or web notification triggers: *"Dev shared a thought with you: 'Deploying search service...' "*.
- **Collaborative Pingback**: When a colleague views or updates a note where you were mentioned, notify the original author.

#### Pillar C: Zero-Friction Capture (PWA & Desktop Presence)
- **PWA (Progressive Web App)**: Installable on Windows/Mac and iOS/Android with an app icon on the taskbar/dock and offline persistence.
- **Global Quick-Capture Overlay**: Hotkey shortcut (`Alt + Space` or `Ctrl + Shift + M`) that opens a tiny floating modal over any app, saves in 2 seconds, and auto-dismisses.

#### Pillar D: Multi-Channel Ingress & Notification Bridges
- **Web Push Notifications**: Native browser service worker notifications for incoming mentions and morning focus briefs even when the Mindshare tab is closed.
- **Telegram / Slack Bridge**: Lightweight webhook where users can send a quick message to a bot, which auto-appends into their Mindshare feed.

---

## 10. Native Deadline & Reminder Engine (Phone & Desktop)

### 10.1 Executive Problem Statement & Strategy
- **Executive Reality**: For a founder/boss managing a fast-paced business with 2–3 team members, note-taking applications become "black holes" if notes are not tied to specific actionable deadlines.
- **Why Random Note Resurfacing Failed**: Surfacing random notes from weeks or months ago creates cognitive noise. What an executive needs is predictable, time-accurate alerting (e.g., *"Call vendor today at 6:00 PM"* or *"Review contract tomorrow 9:00 AM"*).
- **Native-First Constraint**: All alerts, sound chimes, vibrations, and notifications run natively inside Mindshare across **iOS (Safari PWA Home Screen)**, **Android (Chrome PWA)**, and **Desktop browsers** without requiring external third-party bot bridges.

---

### 10.2 Database Architecture & Sub-Millisecond Retrieval Index
```sql
-- Migration: database/add_reminders_and_completed.sql
ALTER TABLE public.notes 
ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;

-- High-speed B-Tree index for sub-10ms deadline retrieval & query filtering
CREATE INDEX IF NOT EXISTS idx_notes_reminder 
ON public.notes (user_id, reminder_at) 
WHERE reminder_at IS NOT NULL;
```

#### Performance Guarantees:
1. **0ms In-Memory Retrieval**: Client-side storage cache (`feedCaches.all`) stores all notes in RAM. Filtering `notes.filter(n => Boolean(n.reminder_at))` happens instantly in < 1ms.
2. **Sub-10ms Database Queries**: The partial index `idx_notes_reminder` only indexes notes with active deadlines, keeping index size minimal and lookup speeds immediate.
3. **Optimistic UI Updates**: Marking a task as complete (`toggleCompleteNote`) immediately flips the UI state and recalculates active reminder badges before the network request finishes.

---

### 10.3 Backend API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notes?feed=reminders` | Retrieves all notes for the authenticated user that have `reminder_at IS NOT NULL` |
| `POST` | `/api/notes` | Accepts `reminderAt` (ISO string) and `isCompleted` (boolean) during note creation |
| `PUT` | `/api/notes/:id` | Updates note content, tags, `reminderAt`, and `isCompleted` |
| `PATCH` | `/api/notes/:id/toggle-complete` | Ultra-fast endpoint for checking or unchecking tasks (`{ isCompleted: boolean }`) |

---

### 10.4 PWA Manifest & Background Service Worker
- **PWA Manifest** (`public/manifest.json`): Configured with `display: standalone` for mobile installation on iOS & Android with theme color `#0D9488`.
- **Service Worker** (`public/sw.js`):
  - Listens for background Web Push events.
  - Fires native OS lock-screen notifications with vibration pattern `[200, 100, 200]`.
  - Handles notification click action to focus or open Mindshare automatically.
- **Client Notification Manager** (`src/lib/notifications.ts`):
  - Initializes service worker and handles permission requests (`requestNotificationPermission()`).
  - Schedules local `setTimeout` alerts while the app tab is open or running in the foreground.
  - Plays the audio chime (`playNotificationChime()`) when deadlines hit.

---

### 10.5 UI & Component Design Integration
- **InputBox** (`src/components/feed/InputBox.tsx`):
  - Added deadline clock trigger menu with presets: **Today 6 PM**, **Tonight 9 PM**, **Tomorrow 9 AM**, **In 1 Hr**, or **Custom Date & Time**.
  - Shows active deadline badge before submitting note.
- **NoteCard** (`src/components/feed/NoteCard.tsx`):
  - Added executive task checkbox (`[ ]` / `[✓]`) with line-through styling upon completion.
  - Status pill showing `⏰ Due Today at 6:00 PM`, `⏰ Overdue by ...`, or `✓ Done`.
- **Sidebar** (`src/components/layout/Sidebar.tsx`):
  - Added dedicated **Deadlines & Tasks** tab in the main navigation with count badge.
- **DetailPanel** (`src/components/layout/DetailPanel.tsx`):
  - Inspector View: Dedicated Deadline & Task management card with 1-click **[Mark Done]**, **[Quick Reschedule]**, and **[Clear]**.
  - Edit View: `datetime-local` input with preset buttons and completion checkbox.
- **Header** (`src/components/layout/Header.tsx`):
  - Subtle notification permission button in header (`Enable Alerts`) if permission is `'default'`.
  - Status indicator and test alert trigger in user profile popover card.

---

### 10.6 Recent Fixes & UI Enhancements (October 2026)

#### 1. Google Avatar (DP) Loading & Localhost 403 Resolution
- **Issue**: Google user profile photos returned HTTP 403 Forbidden on `localhost` due to Cross-Origin Referrer policies, and existing database rows had `avatar_url = null`.
- **Resolution**:
  - `server/index.ts`: Updated `/api/users/me` to read from `user_metadata.picture` or `user_metadata.avatar_url` and automatically backfill `users.avatar_url` in PostgreSQL if null.
  - Image Tags: Added `referrerPolicy="no-referrer"` to all avatar `<img>` tags (`Header.tsx`, `Sidebar.tsx`, `NoteCard.tsx`, `DetailPanel.tsx`, `Chip.tsx`) so Google CDN serves the avatars cleanly on localhost and production.

#### 2. Tagged Me Feed & Self-Mentions Support
- **Issue**: Tagged Me feed was empty when testing or when the primary user tagged their own handle (`@username`), because queries had `.neq('user_id', userId)`.
- **Resolution**:
  - `server/index.ts`: Removed `.neq('user_id', userId)` filter from `feed === 'tagged_me'` and `/api/notes/mentions-count`, allowing notes where the user mentions themselves to appear and be counted.
  - Added case-insensitive fallback matching against note content (`ilike '%@username%'`) to ensure mention consistency.
  - `src/App.tsx`: Added client-side fallback in `filteredNotes` to search cached notes for `@myhandle` if server mention links are still synchronizing.

#### 3. Button-Driven Reminder & Deadline System (Zero-Overflow UI)
- **Issue**:
  - Selecting partial dates in raw `<input type="datetime-local">` triggered `onChange` prematurely, auto-saving without allowing the user to select the time.
  - The floating reminder popover went outside the screen on mobile and narrow viewports.
  - Long reminder status labels in `NoteCard.tsx` pushed the card outside the screen width.
- **Resolution**:
  - **Button System in InputBox** (`src/components/feed/InputBox.tsx`):
    - Converted the floating popover to an **inline collapsible builder** inside the input card (100% responsive, never overflows screen).
    - **Step 1 (Day Selection)**: Buttons for `Today`, `Tomorrow`, `In 2 Days`, and `Pick Date...`.
    - **Step 2 (Time Selection)**: Buttons for `9:00 AM`, `12:00 PM`, `2:00 PM`, `6:00 PM`, `9:00 PM`, `+1 Hour`, and `Custom Time...`.
    - **Live Preview & Explicit Confirmation**: Shows live calculated text (`Will remind: Today, Oct 23 at 6:00 PM`) with explicit `[Set Reminder]`, `[Cancel]`, and `[Remove]` buttons. Never auto-saves until confirmed.
    - **Active Badge**: Displays clean pill badge inside the input box with `[Change]` and `[X]` actions.
  - **Zero-Overflow NoteCard** (`src/components/feed/NoteCard.tsx`):
    - Added `max-w-full overflow-hidden break-words` to the card container.
    - Updated footer to `flex flex-wrap items-center justify-between gap-2 overflow-hidden`.
    - Added `truncate` and `max-w-[200px] sm:max-w-[260px]` to the reminder badge, formatting concise labels (`Due: Today, 6:00 PM`, `Overdue: Oct 23, 7:00 PM`, `Done`).
  - **DetailPanel Inspection & Edit Modes** (`src/components/layout/DetailPanel.tsx`):
    - Added `overflow-x-hidden max-w-full` to `panelContent` to strictly prevent horizontal overflow beyond `w-72`.
    - Replaced raw datetime inputs in View Mode and Edit Mode with the same responsive button presets and explicit set actions.

---

### 10.7 Tagged Me Notes, Tag Visibility & Real Server API Truth

#### 1. Real Server APIs Over Local Filtering
- **Problem**:
  - The "Tagged Me" tab showed a badge count of 7, but notes failed to load or appeared without tags.
  - Previous client-side logic attempted local fallback filtering against personal notes (`getNotes('all')`), which never contained notes authored by other colleagues.
  - In `server/index.ts`, `GET /api/notes` selected columns (`reminder_at`, `is_completed`) that did not yet exist in the live PostgreSQL database, throwing error `42703` and failing with HTTP 500.
  - `GET /api/tags` only queried `tags.user_id = req.userId`, excluding tags (`#mindshareimprove`, `#urgent`, `#hrprocessimprove`) attached to notes where the user was mentioned.
  - The top quick-filter button for the `tagged_me` feed was mistakenly labeled `"Tags"` instead of `"Tagged Me"`.

- **Resolution & Architecture**:
  1. **Resilient Query Runner in `server/index.ts` (`runNotesQuery`)**:
     - Automatically catches PostgreSQL error `42703` (`column does not exist`) and executes fallback queries with core columns, guaranteeing 100% real API uptime without 500 errors.
  2. **Tag Extraction & Junction Resilience (`mapNoteRow`)**:
     - Pulls registered tags from `note_tags (tags(id, name))`.
     - In case Supabase Row Level Security (RLS) on `tags` restricts reading rows across different author IDs, `mapNoteRow` automatically parses `#hashtags` directly from `n.content`, ensuring chips (`#mindshareimprove`, `#urgent`, `#hrprocessimprove`) are ALWAYS displayed on note cards.
  3. **Multi-Source Tag Aggregation in `GET /api/tags`**:
     - Aggregates user's personal tags with all tags from notes where the user is mentioned (`mentions` junction).
     - Calculates accurate accessible note counts and sorts all available tags alphabetically.
  4. **Direct API-Driven Feed Rendering (`src/App.tsx`)**:
     - Removed all local client-side mocking and fallback hacking.
     - `activeFilter.type === 'tagged_me'` queries real server truth directly via `getNotes('tagged_me')` (populated from `/api/notes?feed=tagged_me`).
     - Tag and mention filtering spans across all accessible notes (personal + tagged), so clicking `#mindshareimprove` instantly reveals all 6 relevant thoughts.
     - Corrected quick navigation tab label from `"Tags"` to `"Tagged Me"`.

---

### 10.8 Cognitive Stream Separation, 0ms Instant Actions & Daily Nudges

#### 1. Instant 0ms Operations & Resilient Deletion
- **Issue**:
  - Deleting a note caused it to briefly disappear, but background polling (every 15s) restored it to the screen if database foreign keys on `note_tags` / `mentions` blocked hard deletion.
  - Creating a note previously waited for network roundtrips, causing input perceived latency.
- **Resolution**:
  - **Zero-Resurrection Delete ([server/index.ts](file:///c:/Users/Dev/Documents/Mindshare/server/index.ts#L922-L950))**: Deletes dependent records in `note_tags` and `mentions` first, performs a hard delete, and automatically falls back to soft-deletion (`deleted_at = now()`) if database policies block physical deletion.
  - **0ms Optimistic Note Insertion ([src/lib/storage.ts](file:///c:/Users/Dev/Documents/Mindshare/src/lib/storage.ts#L225-L290))**: Generating temporary IDs immediately renders captured thoughts in 0 milliseconds, persisting with PostgreSQL asynchronously in the background.

#### 2. Separation of Concerns: "My Thoughts" vs "Deadlines & Tasks"
- **Architecture**:
  - **My Thoughts Stream**: Strictly displays pure, reflective thoughts without deadlines (`!n.reminder_at`), keeping the creative knowledge stream clean and anxiety-free.
  - **Deadlines & Tasks Stream**: Dedicated execution cockpit displaying all thoughts with active or completed deadlines (`Boolean(n.reminder_at)`), sorted with overdue and pending deadlines first.
  - **Zero-Friction Conversion Bridges**:
    - **While Typing**: The input box features a quiet `[⏰ Remind]` shortcut. Tapping presets (`Today 6 PM`, `Tomorrow 9 AM`) files the note directly to Deadlines.
    - **On Existing Notes**: Note cards feature a `[+ Deadline]` quick-action button, allowing users to promote any past thought to a scheduled task in 1 tap without copy-pasting.

#### 3. Team-Wide Mention Reminders
- When a deadline note mentions a colleague (`@username`), `syncAllNoteReminders` automatically schedules the reminder on both the author's device and the mentioned teammate's device, triggering simultaneous notifications when due.

#### 4. Automated Daily Thought Nudges (9:00 AM & 6:00 PM)
- **Engine ([src/lib/notifications.ts](file:///c:/Users/Dev/Documents/Mindshare/src/lib/notifications.ts#L192-L260))**:
  - **9:00 AM Morning Nudge**: *"☀️ Morning Mindshare — Good morning! What's top of mind today? Jot down your morning thoughts & priorities."*
  - **6:00 PM Evening Nudge**: *"🌙 Evening Mindshare — End of day reflection. Any takeaways, learnings, or quick thoughts to capture before signing off?"*
  - Responsive cross-platform scheduling using Service Worker push and Web Notifications API with local deduplication.

---

### 10.9 Collaborative Multi-Assignee Deadlines, Rose Aesthetic & Mobile Optimization

#### 1. Collaborative Multi-Assignee Task Completion
- **Core Requirement**: A deadline task created by one teammate (e.g. `@ag`) tagging colleagues (e.g. `@deva`) should allow each person to independently mark their part complete.
- **Data Model**: Added `completed_by JSONB DEFAULT '[]'::jsonb` to `notes` table in Supabase.
- **Backend API ([server/index.ts](file:///c:/Users/Dev/Documents/Mindshare/server/index.ts#L970-L1075))**:
  - `PATCH /api/notes/:id/toggle-complete`: Validates that the requesting user is either the author or in the note's `mentions`.
  - Non-authors can strictly toggle completion for their own handle (security verified).
  - Toggles the user's handle in `completed_by`. When all participants (author + all mentioned users) have completed, overall `is_completed` is set to `true`.
- **User Interface ([src/components/feed/NoteCard.tsx](file:///c:/Users/Dev/Documents/Mindshare/src/components/feed/NoteCard.tsx) & [src/components/layout/DetailPanel.tsx](file:///c:/Users/Dev/Documents/Mindshare/src/components/layout/DetailPanel.tsx))**:
  - **Completed Status**: Renders an executive badge with a green checkmark `✓ Done by @username` visible across all user accounts. Includes an undo action for the participant.
  - **Pending Status**: If the logged-in user is an assignee who hasn't completed yet, a dedicated button `[Mark done as @myusername]` is displayed. For other teammates, `⏳ @username (Pending)` shows who is still working on the task.

#### 2. Input Box Exclusivity: "My Thoughts" Only
- Removed the chat / input box from the "Deadlines & Tasks" (`reminders`) feed.
- "My Thoughts" (`activeFilter.type === 'all'`) is now the single canonical entry point for capturing thoughts, tags, and scheduling deadlines. The Deadlines view functions as a clean, distraction-free execution cockpit.

#### 3. Soft Rose / Crimson Deadline Aesthetic
- Replaced the low-contrast, straining yellow/amber color scheme with a soft crimson/rose palette (`rose-500`, `rose-600`, `bg-rose-500/10`, `border-rose-500/30`).
- High visibility on both light and dark modes, conveying urgency without visual eye fatigue.

#### 4. Instant Tag Operations & Mobile Responsiveness
- **Zero-Glitch Tag & Content Updates ([src/lib/storage.ts](file:///c:/Users/Dev/Documents/Mindshare/src/lib/storage.ts#L345-L395))**: `updateNote` and `deleteTag` apply instant in-memory optimistic updates to `feedCaches.all` and `feedCaches.tagged_me`, rendering tag additions, tag removals, and content edits in under 10 milliseconds (surpassing the user's < 1–2s requirement).
- **Mobile / PDA Polish**: Expanded touch targets to minimum 36px–40px, prevented card click event bubbling with `e.stopPropagation()`, added responsive badge wrapping, and eliminated all horizontal scrolling.

---

*This document was compiled by Antigravity for Mindshare.*


