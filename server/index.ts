import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase.js';
import { generateAITags } from './groq.js';
import { parseNoteContent } from '../src/lib/parser.js';
import { uploadToCloudinary, deleteFromCloudinary } from './cloudinary.js';

const app = express();
const PORT = process.env.PORT || 3001;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));

// Preflight handler for all routes
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));

// Path normalizer middleware: accepts requests with or without /api prefix
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.path.startsWith('/api') && req.path !== '/health') {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

// Authenticated Request interface
interface AuthRequest extends Request {
  user?: any;
  userId?: string;
  userEmail?: string;
  token?: string;
}

// Helper: Get user-scoped Supabase client with JWT passed in headers
function getDb(req: AuthRequest) {
  if (req.token && supabaseUrl && supabaseAnonKey) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${req.token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabase;
}

// Stateless Supabase JWT Authentication Middleware
async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }

    req.user = user;
    req.userId = user.id;
    req.userEmail = user.email;
    req.token = token;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: `Auth Error: ${err.message}` });
  }
}

// Health check endpoint (used by UptimeRobot to keep Render service warm 24/7)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'online', service: 'Mindshare Multi-User Engine', timestamp: new Date() });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'online', service: 'Mindshare Multi-User Engine', timestamp: new Date() });
});

// Protect all /api routes below with requireAuth
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') return next();
  return requireAuth(req as AuthRequest, res, next);
});

// ========================================================
// USER & PROFILE ENDPOINTS
// ========================================================

// Get current user profile
app.get('/api/users/me', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Server error' });

  let { data: userProfile, error } = await db
    .from('users')
    .select('id, email, full_name, username, avatar_url, status, is_handle_set')
    .eq('id', req.userId)
    .maybeSingle();

  // Graceful fallback if is_handle_set column is not yet migrated in DB
  if (error && error.message?.includes('is_handle_set')) {
    const fallbackRes = await db
      .from('users')
      .select('id, email, full_name, username, avatar_url, status')
      .eq('id', req.userId)
      .maybeSingle();
    userProfile = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const meta = req.user?.user_metadata || {};
  const identityData = req.user?.identities?.[0]?.identity_data || {};
  const googleAvatarUrl =
    meta.avatar_url ||
    meta.picture ||
    identityData.avatar_url ||
    identityData.picture ||
    null;

  if (userProfile) {
    // If existing user has no avatar stored, but Google provided one, backfill it now!
    if (!userProfile.avatar_url && googleAvatarUrl) {
      userProfile.avatar_url = googleAvatarUrl;
      await db
        .from('users')
        .update({ avatar_url: googleAvatarUrl })
        .eq('id', req.userId);
    }
    return res.json({ user: userProfile });
  }

  // Self-heal: Provision user row if auth trigger was bypassed
  const email = req.userEmail || '';
  const fallbackUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') || `user_${req.userId.slice(0, 6)}`;
  const fullName = req.user?.user_metadata?.full_name || req.user?.user_metadata?.name || fallbackUsername;
  const avatarUrl = googleAvatarUrl;

  const { data: createdUser, error: insertErr } = await db
    .from('users')
    .upsert({
      id: req.userId,
      email,
      full_name: fullName,
      username: fallbackUsername,
      avatar_url: avatarUrl,
      status: 'active',
      is_handle_set: false,
    })
    .select('id, email, full_name, username, avatar_url, status, is_handle_set')
    .single();

  if (insertErr) {
    return res.status(500).json({ error: insertErr.message });
  }

  return res.json({ user: createdUser });
});

// Update profile (e.g. claim / change @username and display name)
app.put('/api/users/profile', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Server error' });

  const { username, fullName, avatarUrl } = req.body || {};

  const cleanUsername = (username || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  if (cleanUsername.length < 2 || cleanUsername.length > 24) {
    return res.status(400).json({ error: 'Username must be 2-24 alphanumeric characters or underscores.' });
  }

  // Verify username uniqueness (case-insensitive across all registered users)
  const { data: existing } = await db
    .from('users')
    .select('id')
    .ilike('username', cleanUsername)
    .neq('id', req.userId)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: `Username @${cleanUsername} is already taken by a teammate.` });
  }

  const updates: any = {
    username: cleanUsername,
    is_handle_set: true,
    updated_at: new Date().toISOString(),
  };
  if (fullName !== undefined) updates.full_name = fullName.trim();
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

  let { data: updated, error } = await db
    .from('users')
    .update(updates)
    .eq('id', req.userId)
    .select('id, email, full_name, username, avatar_url, status, is_handle_set')
    .single();

  // If is_handle_set column does not exist yet on DB, fall back gracefully
  if (error && error.message?.includes('is_handle_set')) {
    delete updates.is_handle_set;
    const fallbackRes = await db
      .from('users')
      .update(updates)
      .eq('id', req.userId)
      .select('id, email, full_name, username, avatar_url, status')
      .single();
    updated = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `Username @${cleanUsername} is already taken.` });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ user: updated, success: true });
});

// Team directory endpoint: Returns all active registered teammates
app.get('/api/users/directory', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db) return res.status(500).json({ error: 'Supabase not configured' });

  const { data, error } = await db
    .from('users')
    .select('id, username, full_name, email, avatar_url')
    .order('full_name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ users: data || [] });
});

// ========================================================
// ON-DEMAND AI TAG SUGGESTIONS (USER CONTROLLED)
// ========================================================
app.post('/api/ai/suggest-tags', async (req: AuthRequest, res: Response) => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content required for AI suggestions', tags: [] });
  }

  try {
    const aiResult = await generateAITags(content.trim());
    return res.json({ tags: aiResult.tags || [], summary: aiResult.summary, success: true });
  } catch (err: any) {
    console.error('[AI Suggestion Error]:', err.message);
    return res.status(500).json({ error: 'Failed to generate suggestions', tags: [] });
  }
});

// Cloudinary Image Upload
app.post('/api/upload', async (req: AuthRequest, res: Response) => {
  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Image data (base64 or URL) is required' });
  }

  const result = await uploadToCloudinary(image);
  if (!result.success && !result.url) {
    return res.status(500).json({ error: result.error || 'Failed to upload image' });
  }

  res.json({ url: result.secure_url || result.url, success: true });
});

// ========================================================
// MULTI-TENANT NOTES & TAGS APIS
// ========================================================

function mapNoteRow(n: any): any {
  let tags = (n.note_tags || [])
    .filter((nt: any) => nt.tags)
    .map((nt: any) => ({
      id: nt.tags.id,
      name: nt.tags.name,
      is_manual: nt.is_manual ?? true,
      source: nt.source || 'manual',
    }));

  // Fallback: If tags junction is empty or blocked by RLS, extract hashtags directly from note content
  if (tags.length === 0 && n.content) {
    const parsed = parseNoteContent(n.content);
    tags = parsed.tags.map((tagName: string) => ({
      id: `tag-${tagName.toLowerCase()}`,
      name: tagName.toLowerCase(),
      is_manual: true,
      source: 'manual',
    }));
  }

  const mentions = (n.mentions || [])
    .filter((m: any) => m.users)
    .map((m: any) => ({
      id: m.users.id,
      display_name: m.users.full_name || m.users.username,
      username: m.users.username,
      contact_email: m.users.email,
      avatar_url: m.users.avatar_url,
      is_registered: true,
      status: 'active',
    }));

  const author = n.users
    ? {
      id: n.users.id,
      username: n.users.username,
      full_name: n.users.full_name,
      avatar_url: n.users.avatar_url,
    }
    : undefined;

  let rawCompletedBy = n.completed_by;
  let completed_by: string[] = [];
  if (Array.isArray(rawCompletedBy)) {
    completed_by = rawCompletedBy
      .map((entry: any) => {
        if (typeof entry === 'string') return entry.toLowerCase();
        return (entry?.username || entry?.user_id || '').toLowerCase();
      })
      .filter(Boolean);
  }
  const fallbackHandle = author?.username || n.users?.username;
  if (n.is_completed && completed_by.length === 0 && fallbackHandle) {
    completed_by.push(fallbackHandle.toLowerCase());
  }

  return {
    id: n.id,
    user_id: n.user_id,
    author,
    content: n.content,
    reminder_at: n.reminder_at || null,
    is_completed: Boolean(n.is_completed),
    completed_by,
    created_at: n.created_at,
    updated_at: n.updated_at,
    tags,
    mentions,
  };
}

// Helper: Insert/Link tags strictly under user's private account
async function batchInsertTagsAndJunctions(db: any, userId: string, noteId: string, tagNames: string[], isManual = true) {
  if (!db || tagNames.length === 0) return;

  for (const name of tagNames) {
    const cleanName = name.toLowerCase().trim();
    if (cleanName.length < 2) continue;

    const { data: existingTag } = await db
      .from('tags')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', cleanName)
      .maybeSingle();

    let tagId = existingTag?.id;

    if (!tagId) {
      const { data: newTag, error: insertErr } = await db
        .from('tags')
        .insert({ user_id: userId, name: cleanName })
        .select('id')
        .maybeSingle();

      if (newTag) {
        tagId = newTag.id;
      } else if (insertErr) {
        // Fallback in case of race condition / unique constraint
        const { data: retryTag } = await db
          .from('tags')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', cleanName)
          .maybeSingle();
        tagId = retryTag?.id;
      }
    }

    if (tagId) {
      await db
        .from('note_tags')
        .upsert({
          note_id: noteId,
          tag_id: tagId,
          is_manual: isManual,
          source: isManual ? 'manual' : 'ai_suggested',
          confidence_score: 1.0,
        }, { onConflict: 'note_id,tag_id' });
    }
  }
}

// Helper: Insert real teammate mentions
async function batchInsertMentions(db: any, noteId: string, userIds: string[]) {
  if (!db || userIds.length === 0) return;
  const rows = userIds.map((userId) => ({ note_id: noteId, user_id: userId }));
  await db.from('mentions').upsert(rows, { onConflict: 'note_id,user_id' });
}

// Get Notes with strict multi-user visibility & feeds
app.get('/api/notes', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  const userId = req.userId;
  const feed = (req.query.feed as string) || 'all'; // 'all' | 'tagged_me' | 'untagged'
  const tagFilter = req.query.tag as string;
  const mentionFilter = req.query.mention as string;
  const searchQuery = ((req.query.q || req.query.search || '') as string).trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  let noteIds: string[] = [];

  if (feed === 'tagged_me') {
    // 1. Fetch note IDs from mentions table where this user is tagged
    const { data: mentionRows } = await db
      .from('mentions')
      .select('note_id')
      .eq('user_id', userId);

    noteIds = (mentionRows || []).map((m: any) => m.note_id);

    // 2. Also check if user has a username, find notes mentioning @username in content
    const { data: userProfile } = await db
      .from('users')
      .select('username')
      .eq('id', userId)
      .maybeSingle();

    if (userProfile?.username) {
      const { data: contentMatches } = await db
        .from('notes')
        .select('id')
        .is('deleted_at', null)
        .ilike('content', `%@${userProfile.username}%`);

      if (contentMatches && contentMatches.length > 0) {
        const matchedIds = contentMatches.map((n: any) => n.id);
        noteIds = Array.from(new Set([...noteIds, ...matchedIds]));
      }
    }

    if (noteIds.length === 0) {
      return res.json({ notes: [], pagination: { total: 0, limit, offset, has_more: false }, total: 0 });
    }
  }

  // Resilient query runner: attempts with reminder columns first; if not migrated in DB, falls back seamlessly
  const runNotesQuery = async (includeReminderCols: boolean) => {
    const cols = includeReminderCols
      ? `
        id,
        user_id,
        content,
        reminder_at,
        is_completed,
        completed_by,
        created_at,
        updated_at,
        users!notes_user_id_fkey ( id, username, full_name, avatar_url ),
        note_tags (
          is_manual,
          source,
          tags ( id, name )
        ),
        mentions (
          user_id,
          users ( id, display_name:full_name, username, contact_email:email, avatar_url )
        )
      `
      : `
        id,
        user_id,
        content,
        created_at,
        updated_at,
        users!notes_user_id_fkey ( id, username, full_name, avatar_url ),
        note_tags (
          is_manual,
          source,
          tags ( id, name )
        ),
        mentions (
          user_id,
          users ( id, display_name:full_name, username, contact_email:email, avatar_url )
        )
      `;

    let q = db
      .from('notes')
      .select(cols, { count: 'exact' })
      .is('deleted_at', null);

    if (feed === 'tagged_me') {
      q = q.in('id', noteIds);
    } else if (feed === 'reminders') {
      if (!includeReminderCols) {
        return { data: [], count: 0, error: null };
      }
      q = q.eq('user_id', userId).not('reminder_at', 'is', null);
    } else {
      q = q.eq('user_id', userId);
    }

    if (searchQuery) {
      const cleanSearch = searchQuery
        .replace(/[!&|():*]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .join(' & ');

      if (cleanSearch) {
        q = q.textSearch('fts', cleanSearch, { config: 'english' });
      }
    }

    q = q
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return await q;
  };

  let { data, count, error } = await runNotesQuery(true);

  if (error && (error.message?.includes('is_completed') || error.message?.includes('reminder_at') || error.message?.includes('completed_by') || error.code === '42703')) {
    console.warn('[GET /api/notes] notes table missing reminder columns, falling back to base columns...');
    const retry = await runNotesQuery(false);
    data = retry.data;
    count = retry.count;
    error = retry.error;
  }

  if (error) {
    console.error('Supabase notes fetch error:', error);
    return res.status(500).json({ error: error.message });
  }

  let notes = (data || []).map(mapNoteRow);

  if (feed === 'untagged') {
    notes = notes.filter((n) => n.tags.length === 0);
  }
  if (tagFilter) {
    notes = notes.filter((n) => n.tags.some((t: any) => t.name.toLowerCase() === tagFilter.toLowerCase()));
  }
  if (mentionFilter) {
    notes = notes.filter((n) =>
      n.mentions.some((m: any) => m.username.toLowerCase() === mentionFilter.toLowerCase())
    );
  }

  res.json({
    notes,
    pagination: {
      total: count ?? notes.length,
      limit,
      offset,
      has_more: (offset + limit) < (count ?? notes.length),
    },
    total: count ?? notes.length,
  });
});

// Count unread and total mentions for the user across all devices
app.get('/api/notes/mentions-count', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ count: 0, unreadCount: 0, hasUnread: false });

  try {
    // 1. Fetch user's mentions_last_seen_at checkpoint
    const { data: userProfile } = await db
      .from('users')
      .select('mentions_last_seen_at')
      .eq('id', req.userId)
      .maybeSingle();

    // 2. Fetch all mention rows for this user
    const { data: mentionRows, error: mentionErr } = await db
      .from('mentions')
      .select('note_id')
      .eq('user_id', req.userId);

    if (mentionErr) {
      console.warn('[API] mentions query error:', mentionErr.message);
      return res.json({ count: 0, unreadCount: 0, hasUnread: false });
    }

    const noteIds = (mentionRows || []).map((m: any) => m.note_id);
    if (noteIds.length === 0) {
      return res.json({
        count: 0,
        unreadCount: 0,
        hasUnread: false,
        mentions_last_seen_at: userProfile?.mentions_last_seen_at || null,
      });
    }

    // 3. Fetch notes mentioning this user that are not deleted
    const { data: notes, error: notesErr } = await db
      .from('notes')
      .select('id, created_at')
      .in('id', noteIds)
      .is('deleted_at', null);

    if (notesErr) {
      console.warn('[API] notes query error for mentions:', notesErr.message);
      return res.json({ count: noteIds.length, unreadCount: 0, hasUnread: false });
    }

    const totalCount = notes?.length || 0;
    const lastSeen = userProfile?.mentions_last_seen_at;
    const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;

    const unreadCount = (notes || []).filter((n: any) => {
      const noteTime = new Date(n.created_at).getTime();
      return noteTime > lastSeenTime;
    }).length;

    res.json({
      count: totalCount,
      unreadCount,
      hasUnread: unreadCount > 0,
      mentions_last_seen_at: lastSeen || null,
    });
  } catch (err: any) {
    console.warn('[API] mentions-count error:', err.message);
    res.status(500).json({ count: 0, unreadCount: 0, hasUnread: false });
  }
});

// Mark mentions as read across all devices (updates mentions_last_seen_at in DB)
app.post('/api/notes/mark-mentions-read', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const now = new Date().toISOString();
    const { error } = await db
      .from('users')
      .update({ mentions_last_seen_at: now })
      .eq('id', req.userId);

    if (error) {
      console.warn('[API] Failed to update mentions_last_seen_at:', error.message);
      return res.status(500).json({ error: error.message, success: false });
    }

    res.json({ success: true, mentions_last_seen_at: now });
  } catch (err: any) {
    res.status(500).json({ error: err.message, success: false });
  }
});

// Create Note
app.post('/api/notes', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  const { content, manualTags, reminderAt, isCompleted } = req.body || {};
  const parsed = parseNoteContent(content || '');
  if (!parsed.isValid) {
    return res.status(400).json({ error: parsed.errors[0] || 'Invalid note content.', success: false });
  }

  const combinedTags = Array.from(new Set([
    ...parsed.tags,
    ...(Array.isArray(manualTags) ? manualTags : [])
  ].map((t) => t.toLowerCase().trim())));

  let mentionedUserIds: string[] = [];
  let matchedTeammates: any[] = [];

  if (parsed.mentions.length > 0) {
    const mentionSet = new Set(parsed.mentions.map((m) => m.toLowerCase()));
    const { data: allUsers } = await db
      .from('users')
      .select('id, username, full_name, email, avatar_url');

    matchedTeammates = (allUsers || []).filter(
      (u: any) => u.username && mentionSet.has(u.username.toLowerCase())
    );
    mentionedUserIds = matchedTeammates.map((u: any) => u.id);
  }

  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();

  const insertData: any = {
    id: noteId,
    user_id: req.userId,
    content,
    reminder_at: reminderAt || null,
    is_completed: Boolean(isCompleted),
    created_at: now,
    updated_at: now,
  };

  let { error: noteErr } = await db.from('notes').insert(insertData);

  // Graceful fallback if reminder columns are not yet migrated in DB
  if (noteErr && (noteErr.message?.includes('reminder_at') || noteErr.message?.includes('is_completed'))) {
    delete insertData.reminder_at;
    delete insertData.is_completed;
    const retry = await db.from('notes').insert(insertData);
    noteErr = retry.error;
  }

  if (noteErr) {
    console.error('Note insert error:', noteErr);
    return res.status(500).json({ error: `Could not save note: ${noteErr.message}`, success: false });
  }

  await batchInsertTagsAndJunctions(db, req.userId, noteId, combinedTags, true);
  await batchInsertMentions(db, noteId, mentionedUserIds);

  const tags = combinedTags.map((t) => ({
    id: `t-${t}`,
    name: t,
    is_manual: true,
  }));

  const mentions = matchedTeammates.map((u) => ({
    id: u.id,
    display_name: u.full_name || u.username,
    username: u.username,
    contact_email: u.email,
    avatar_url: u.avatar_url,
    is_registered: true,
    status: 'active',
  }));

  const note = {
    id: noteId,
    user_id: req.userId,
    content,
    reminder_at: reminderAt || null,
    is_completed: Boolean(isCompleted),
    completed_by: [],
    created_at: now,
    updated_at: now,
    tags,
    mentions,
  };

  return res.status(201).json({ note, success: true });
});

// Update Note (User can only update their own notes)
app.put('/api/notes/:id', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  const { id } = req.params;
  const { content, manualTags, reminderAt, isCompleted } = req.body || {};

  const parsed = parseNoteContent(content || '');
  if (!parsed.isValid) {
    return res.status(400).json({ error: parsed.errors[0] || 'Invalid note content.', success: false });
  }

  const now = new Date().toISOString();

  // Fetch existing note to identify any removed images
  const { data: existingNote } = await db
    .from('notes')
    .select('content')
    .eq('id', id)
    .eq('user_id', req.userId)
    .maybeSingle();

  const updates: any = { content, updated_at: now };
  if (reminderAt !== undefined) updates.reminder_at = reminderAt;
  if (isCompleted !== undefined) {
    updates.is_completed = Boolean(isCompleted);
    const userHandle = req.userEmail?.split('@')[0]?.toLowerCase() || 'me';
    updates.completed_by = updates.is_completed ? [userHandle] : [];
  }

  let { data: updatedRow, error: updateErr } = await db
    .from('notes')
    .update(updates)
    .eq('id', id)
    .eq('user_id', req.userId)
    .select('id, content, reminder_at, is_completed, completed_by, created_at, updated_at')
    .maybeSingle();

  // Fallback if columns not yet migrated
  if (updateErr && (updateErr.message?.includes('reminder_at') || updateErr.message?.includes('is_completed') || updateErr.message?.includes('completed_by'))) {
    delete updates.reminder_at;
    delete updates.is_completed;
    const retry = await db
      .from('notes')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.userId)
      .select('id, content, created_at, updated_at')
      .maybeSingle();
    updatedRow = retry.data;
    updateErr = retry.error;
  }

  if (updateErr) {
    return res.status(500).json({ error: `Could not update note: ${updateErr.message}`, success: false });
  }
  if (!updatedRow) {
    return res.status(404).json({ error: 'Note not found or you do not have permission to edit it.', success: false });
  }

  // Delete removed images from Cloudinary asynchronously
  if (existingNote?.content) {
    const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi;
    const oldUrls: string[] = [];
    let m;
    while ((m = imageRegex.exec(existingNote.content)) !== null) {
      const u = m[1] || m[2];
      if (u && !oldUrls.includes(u)) oldUrls.push(u);
    }
    imageRegex.lastIndex = 0;
    const newUrls: string[] = [];
    while ((m = imageRegex.exec(content)) !== null) {
      const u = m[1] || m[2];
      if (u && !newUrls.includes(u)) newUrls.push(u);
    }
    const removedUrls = oldUrls.filter((u) => !newUrls.includes(u));
    removedUrls.forEach((u) => {
      deleteFromCloudinary(u).catch((err) =>
        console.error('[Cloudinary Delete Error]:', err.message)
      );
    });
  }

  const combinedTags = Array.from(new Set([
    ...parsed.tags,
    ...(Array.isArray(manualTags) ? manualTags : [])
  ].map((t) => t.toLowerCase().trim())));

  let mentionedUserIds: string[] = [];
  let matchedTeammates: any[] = [];

  if (parsed.mentions.length > 0) {
    const mentionSet = new Set(parsed.mentions.map((m) => m.toLowerCase()));
    const { data: allUsers } = await db
      .from('users')
      .select('id, username, full_name, email, avatar_url');

    matchedTeammates = (allUsers || []).filter(
      (u: any) => u.username && mentionSet.has(u.username.toLowerCase())
    );
    mentionedUserIds = matchedTeammates.map((u: any) => u.id);
  }

  await db.from('note_tags').delete().eq('note_id', id);
  await db.from('mentions').delete().eq('note_id', id);

  await batchInsertTagsAndJunctions(db, req.userId, id, combinedTags, true);
  await batchInsertMentions(db, id, mentionedUserIds);

  const tags = combinedTags.map((t) => ({
    id: `t-${t}`,
    name: t,
    is_manual: true,
  }));

  const mentions = matchedTeammates.map((u) => ({
    id: u.id,
    display_name: u.full_name || u.username,
    username: u.username,
    contact_email: u.email,
    avatar_url: u.avatar_url,
    is_registered: true,
    status: 'active',
  }));

  const note = {
    id: updatedRow.id,
    user_id: req.userId,
    content: updatedRow.content,
    reminder_at: updatedRow.reminder_at || null,
    is_completed: Boolean(updatedRow.is_completed),
    completed_by: updatedRow.completed_by || existingNote?.completed_by || [],
    created_at: updatedRow.created_at,
    updated_at: updatedRow.updated_at,
    tags,
    mentions,
  };

  res.json({ note, success: true });
});

// Delete Note (User can only delete their own notes)
app.delete('/api/notes/:id', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  const { id } = req.params;

  const { data: noteRow } = await db
    .from('notes')
    .select('content')
    .eq('id', id)
    .eq('user_id', req.userId)
    .maybeSingle();

  if (!noteRow) {
    return res.status(404).json({ error: 'Note not found or unauthorized', success: false });
  }

  if (noteRow.content) {
    const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi;
    let match;
    while ((match = imageRegex.exec(noteRow.content)) !== null) {
      const imageUrl = match[1] || match[2];
      if (imageUrl) {
        deleteFromCloudinary(imageUrl).catch((err) =>
          console.error('[Cloudinary Delete Error]:', err.message)
        );
      }
    }
  }

  try {
    await db.from('note_tags').delete().eq('note_id', id);
    await db.from('mentions').delete().eq('note_id', id);
  } catch (juncErr: any) {
    console.warn('[Delete Note] Junction cleanup notice:', juncErr.message);
  }

  // Attempt hard delete
  let { error: delErr } = await db
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', req.userId);

  // If hard delete fails (e.g. FK constraint or RLS restriction), fallback to soft-delete
  if (delErr) {
    console.warn('[Delete Note] Hard delete failed, falling back to soft delete:', delErr.message);
    const { error: softErr } = await db
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', req.userId);

    if (softErr) {
      console.error('[Delete Note] Soft delete also failed:', softErr.message);
      return res.status(500).json({ error: softErr.message, success: false });
    }
  }

  res.json({ success: true, deletedNoteId: id });
});

// Toggle Task Completion (Collaborative Multi-Assignee: author & tagged colleagues)
const handleToggleComplete = async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  const { id } = req.params;
  const { isCompleted, username } = req.body || {};

  try {
    // 1. Get current user's profile username
    let currentUsername = '';
    const { data: userProfile } = await db
      .from('users')
      .select('username')
      .eq('id', req.userId)
      .maybeSingle();

    if (userProfile?.username) {
      currentUsername = userProfile.username.toLowerCase();
    } else if (req.userEmail) {
      currentUsername = req.userEmail.split('@')[0].toLowerCase();
    }

    // 2. Fetch the note with author & mentions to verify authorization
    const client = supabase || db;
    const { data: noteRow, error: fetchErr } = await client
      .from('notes')
      .select(`
        id, user_id, is_completed, completed_by,
        users!notes_user_id_fkey ( username ),
        mentions ( user_id, users ( username ) )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchErr || !noteRow) {
      return res.status(404).json({ error: 'Note not found or deleted', success: false });
    }

    // 3. Determine target user to toggle:
    // Any workspace member can toggle completion for their own handle.
    // The note author can also toggle on behalf of any assignee.
    const rawTarget = (username || currentUsername || 'team').toLowerCase().trim();
    const targetUser = rawTarget.replace(/^@/, '');

    let currentCompletedBy: string[] = Array.isArray(noteRow.completed_by)
      ? noteRow.completed_by.map((u: any) => typeof u === 'string' ? u.toLowerCase().replace(/^@/, '').trim() : (u?.username || '').toLowerCase().replace(/^@/, '').trim()).filter(Boolean)
      : [];

    if (noteRow.is_completed && currentCompletedBy.length === 0 && noteRow.users?.username) {
      currentCompletedBy.push(noteRow.users.username.toLowerCase().replace(/^@/, '').trim());
    }

    // Participants = author + all mentioned teammates
    const allParticipants = Array.from(new Set([
      (noteRow.users?.username || '').toLowerCase().replace(/^@/, '').trim(),
      ...((noteRow.mentions || []).map((m: any) => (m.users?.username || '').toLowerCase().replace(/^@/, '').trim()))
    ].filter(Boolean)));

    const shouldMarkDone = isCompleted !== undefined ? Boolean(isCompleted) : !currentCompletedBy.includes(targetUser);

    let newCompletedBy = [...currentCompletedBy];
    if (shouldMarkDone) {
      if (!newCompletedBy.includes(targetUser)) {
        newCompletedBy.push(targetUser);
      }
    } else {
      if (username) {
        newCompletedBy = newCompletedBy.filter((u) => u !== targetUser);
      } else {
        // Toggling main card checkbox off
        if (allParticipants.length <= 1) {
          newCompletedBy = [];
        } else {
          newCompletedBy = newCompletedBy.filter((u) => u !== targetUser && u !== currentUsername);
        }
      }
    }

    const overallCompleted = allParticipants.length > 0
      ? allParticipants.every((p) => newCompletedBy.includes(p))
      : (shouldMarkDone && newCompletedBy.length > 0);

    const now = new Date().toISOString();

    // 4. Update note in database (try primary client first, fallback to user-scoped db)
    let updated: any = null;
    let updateErr: any = null;

    const res1 = await client
      .from('notes')
      .update({
        is_completed: overallCompleted,
        completed_by: newCompletedBy,
        updated_at: now,
      })
      .eq('id', id)
      .select('id, is_completed, completed_by, updated_at')
      .maybeSingle();

    updated = res1.data;
    updateErr = res1.error;

    if (updateErr && (updateErr.message?.includes('completed_by') || updateErr.code === '42703')) {
      const retry = await client
        .from('notes')
        .update({
          is_completed: overallCompleted,
          updated_at: now,
        })
        .eq('id', id)
        .select('id, is_completed, updated_at')
        .maybeSingle();
      updated = { ...(retry.data || {}), completed_by: newCompletedBy };
      updateErr = retry.error;
    }

    // If client failed (e.g. RLS policy on anon key), retry with user-scoped JWT client
    if ((updateErr || !updated) && db && db !== client) {
      const res2 = await db
        .from('notes')
        .update({
          is_completed: overallCompleted,
          completed_by: newCompletedBy,
          updated_at: now,
        })
        .eq('id', id)
        .select('id, is_completed, completed_by, updated_at')
        .maybeSingle();
      if (!res2.error && res2.data) {
        updated = res2.data;
        updateErr = null;
      }
    }

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message, success: false });
    }

    res.json({
      success: true,
      note: updated || {
        id,
        is_completed: overallCompleted,
        completed_by: newCompletedBy,
        updated_at: now,
      },
    });
  } catch (err: any) {
    console.error('[toggle-complete error]:', err);
    res.status(500).json({ error: err.message, success: false });
  }
};

app.patch('/api/notes/:id/toggle-complete', handleToggleComplete);
app.post('/api/notes/:id/toggle-complete', handleToggleComplete);

// Delete User's Private Tag entirely (Non-blocking & fast)
app.delete('/api/tags/:id', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  const { id } = req.params;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // Find tag by ID or by name
  let query = db.from('tags').select('id, name').eq('user_id', req.userId);
  if (isUuid) {
    query = query.eq('id', id);
  } else {
    query = query.ilike('name', id.trim().replace(/^#/, ''));
  }

  const { data: tagRow, error: findErr } = await query.maybeSingle();

  if (findErr) {
    return res.status(500).json({ error: findErr.message, success: false });
  }
  if (!tagRow) {
    return res.status(404).json({ error: 'Tag not found or unauthorized', success: false });
  }

  // Delete from tags table (cascades to note_tags)
  const { error: delErr } = await db
    .from('tags')
    .delete()
    .eq('id', tagRow.id)
    .eq('user_id', req.userId);

  if (delErr) {
    return res.status(500).json({ error: delErr.message, success: false });
  }

  // Immediately respond to user so the UI is instantaneous (0ms - 20ms)
  res.json({ success: true, deletedTagId: tagRow.id, name: tagRow.name });

  // Clean note text in the background asynchronously without blocking the user
  (async () => {
    try {
      const { data: userNotes } = await db
        .from('notes')
        .select('id, content')
        .eq('user_id', req.userId)
        .is('deleted_at', null);

      const regex = new RegExp(`(?:^|\\s)#${tagRow.name}\\b`, 'gi');
      const updates = (userNotes || [])
        .filter((n: any) => regex.test(n.content))
        .map((n: any) => {
          const cleaned = n.content.replace(regex, '').trim();
          if (cleaned.length > 0) {
            return db.from('notes').update({ content: cleaned }).eq('id', n.id);
          }
          return null;
        })
        .filter(Boolean);

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    } catch (cleanErr: any) {
      console.warn('[Tag Delete] Notice when cleaning note text:', cleanErr.message);
    }
  })();
});

// Get All Tags Available to User (Personal Tags + Tags from Notes where User is Tagged)
app.get('/api/tags', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    // 1. Fetch user's own registered tags from tags table
    const { data: userTags } = await db
      .from('tags')
      .select('id, name, created_at')
      .eq('user_id', req.userId)
      .order('name', { ascending: true });

    // 2. Fetch user's personal active notes
    const { data: userNotes } = await db
      .from('notes')
      .select(`
        id, content,
        note_tags (
          tags ( id, name )
        )
      `)
      .eq('user_id', req.userId)
      .is('deleted_at', null);

    // 3. Fetch notes where user is mentioned
    const { data: mentionRows } = await db
      .from('mentions')
      .select('note_id')
      .eq('user_id', req.userId);

    const mentionedNoteIds = (mentionRows || []).map((m: any) => m.note_id);
    let mentionedNotes: any[] = [];
    if (mentionedNoteIds.length > 0) {
      const { data: mNotes } = await db
        .from('notes')
        .select(`
          id, content,
          note_tags (
            tags ( id, name )
          )
        `)
        .in('id', mentionedNoteIds)
        .is('deleted_at', null);
      mentionedNotes = mNotes || [];
    }

    // Tag map: lowerName -> { id, name, count, created_at }
    const tagMap = new Map<string, { id: string; name: string; count: number; created_at?: string }>();

    // Seed with user's own registered tags
    for (const ut of userTags || []) {
      tagMap.set(ut.name.toLowerCase(), {
        id: ut.id,
        name: ut.name,
        count: 0,
        created_at: ut.created_at,
      });
    }

    // Process all notes (both personal notes and notes mentioning user)
    const allAccessibleNotes = [...(userNotes || []), ...mentionedNotes];
    for (const note of allAccessibleNotes) {
      const seenInThisNote = new Set<string>();

      // Check note_tags junction
      for (const nt of note.note_tags || []) {
        if (nt.tags?.name) {
          const norm = nt.tags.name.toLowerCase();
          if (!seenInThisNote.has(norm)) {
            seenInThisNote.add(norm);
            const existing = tagMap.get(norm);
            if (existing) {
              existing.count += 1;
            } else {
              tagMap.set(norm, {
                id: nt.tags.id || `tag-${norm}`,
                name: nt.tags.name,
                count: 1,
              });
            }
          }
        }
      }

      // Also parse hashtags in note content
      if (note.content) {
        const parsed = parseNoteContent(note.content);
        for (const pt of parsed.tags) {
          const norm = pt.toLowerCase();
          if (!seenInThisNote.has(norm)) {
            seenInThisNote.add(norm);
            const existing = tagMap.get(norm);
            if (existing) {
              existing.count += 1;
            } else {
              tagMap.set(norm, {
                id: `tag-${norm}`,
                name: pt,
                count: 1,
              });
            }
          }
        }
      }
    }

    const tags = Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ tags });
  } catch (err: any) {
    console.error('[GET /api/tags] Error fetching tags:', err);
    res.status(500).json({ error: err.message, tags: [] });
  }
});

// ========================================================
// AUTOMATED GOOGLE DRIVE PER-USER SPREADSHEET BACKUP
// ========================================================
// Google Apps Script Webhook URL is loaded securely from environment variables
const googleWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL || '';

async function syncAllUsersToGoogleDrive(customUrl?: string): Promise<{ success: boolean; totalUsers: number; message: string; data?: any }> {
  const targetUrl = customUrl || googleWebhookUrl;
  if (!targetUrl) {
    return {
      success: false,
      totalUsers: 0,
      message: 'Google Sheets Webhook URL is not configured. Please set GOOGLE_SHEETS_WEBHOOK_URL in environment variables.'
    };
  }

  if (!supabase) {
    return { success: false, totalUsers: 0, message: 'Supabase client is not available.' };
  }

  try {
    // 1. Fetch all registered users (both existing and new)
    const { data: allUsers, error: usersErr } = await supabase
      .from('users')
      .select('id, username, full_name, email')
      .order('username', { ascending: true });

    if (usersErr) {
      throw new Error(`Failed to fetch users: ${usersErr.message}`);
    }

    // 2. Fetch all active notes
    const { data: allNotes, error: notesErr } = await supabase
      .from('notes')
      .select(`
        id,
        user_id,
        content,
        created_at,
        updated_at,
        note_tags ( tags ( name ) ),
        mentions ( users ( username ) )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (notesErr) {
      throw new Error(`Failed to fetch notes: ${notesErr.message}`);
    }

    // Group notes by user_id
    const userNotesMap: Record<string, any[]> = {};
    (allUsers || []).forEach((u: any) => {
      userNotesMap[u.id] = [];
    });

    const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi;

    (allNotes || []).forEach((n: any) => {
      if (userNotesMap[n.user_id]) {
        // Extract media URLs
        const mediaUrls: string[] = [];
        let m;
        const regexClone = new RegExp(imageRegex.source, 'gi');
        while ((m = regexClone.exec(n.content)) !== null) {
          const u = m[1] || m[2];
          if (u && !mediaUrls.includes(u)) mediaUrls.push(u);
        }

        const cleanText = n.content.replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g, '').trim();

        userNotesMap[n.user_id].push({
          id: n.id,
          created_at: n.created_at,
          updated_at: n.updated_at,
          content: cleanText,
          tags: (n.note_tags || []).map((nt: any) => nt.tags?.name).filter(Boolean),
          mentions: (n.mentions || []).map((m: any) => m.users?.username).filter(Boolean),
          media_urls: mediaUrls,
        });
      }
    });

    const payload = {
      users: (allUsers || []).map((u: any) => ({
        id: u.id,
        username: u.username || 'user',
        full_name: u.full_name || '',
        email: u.email || '',
        notes: userNotesMap[u.id] || [],
      })),
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({ success: response.ok }));

    return {
      success: response.ok,
      totalUsers: payload.users.length,
      message: `Successfully synced ${payload.users.length} users to individual Google Drive sheets!`,
      data: result,
    };
  } catch (err: any) {
    console.error('[Google Drive Sync Error]:', err.message);
    return { success: false, totalUsers: 0, message: err.message };
  }
}

// Midnight Recurring Timer Scheduler
function scheduleMidnightSync() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0); // Next 00:00:00
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  console.log(`⏰ [Midnight Timer] Google Drive sync scheduled in ${Math.round(msUntilMidnight / 60000)} minutes (at 00:00).`);

  setTimeout(() => {
    console.log('🌙 [Midnight Timer Fired] Triggering automated Google Drive sync for all users...');
    syncAllUsersToGoogleDrive().then((res) => {
      console.log(`✅ [Midnight Timer Complete]: ${res.message}`);
    });
    // Repeat every 24 hours
    setInterval(() => {
      console.log('🌙 [Midnight Timer Fired] Triggering automated Google Drive sync for all users...');
      syncAllUsersToGoogleDrive().then((res) => {
        console.log(`✅ [Midnight Timer Complete]: ${res.message}`);
      });
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

// Start Midnight Timer
scheduleMidnightSync();

// API Endpoints for Google Drive Sync
app.post('/api/backup/google-drive-sync', async (req: AuthRequest, res: Response) => {
  const { webhookUrl } = req.body || {};
  const result = await syncAllUsersToGoogleDrive(webhookUrl);
  res.json(result);
});

app.get('/api/backup/google-drive-status', (_req: Request, res: Response) => {
  res.json({
    configured: Boolean(googleWebhookUrl),
    midnightScheduled: true,
  });
});

if (!isSupabaseConfigured) {
  console.warn('⚠️  Server running WITHOUT Supabase config. Data endpoints will return 500.');
}

app.listen(PORT, () => {
  console.log(`⚡ Mindshare Multi-User Engine running on port ${PORT}`);
});
