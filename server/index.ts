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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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

  const { data: userProfile, error } = await db
    .from('users')
    .select('id, email, full_name, username, avatar_url, status')
    .eq('id', req.userId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (userProfile) {
    return res.json({ user: userProfile });
  }

  // Self-heal: Provision user row if auth trigger was bypassed
  const email = req.userEmail || '';
  const fallbackUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') || `user_${req.userId.slice(0, 6)}`;
  const fullName = req.user?.user_metadata?.full_name || req.user?.user_metadata?.name || fallbackUsername;
  const avatarUrl = req.user?.user_metadata?.avatar_url || null;

  const { data: createdUser, error: insertErr } = await db
    .from('users')
    .upsert({
      id: req.userId,
      email,
      full_name: fullName,
      username: fallbackUsername,
      avatar_url: avatarUrl,
      status: 'active',
    })
    .select('id, email, full_name, username, avatar_url, status')
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

  // Verify username uniqueness
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('username', cleanUsername)
    .neq('id', req.userId)
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: `Username @${cleanUsername} is already taken by a teammate.` });
  }

  const updates: any = {
    username: cleanUsername,
    updated_at: new Date().toISOString(),
  };
  if (fullName !== undefined) updates.full_name = fullName.trim();
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

  const { data: updated, error } = await db
    .from('users')
    .update(updates)
    .eq('id', req.userId)
    .select('id, email, full_name, username, avatar_url, status')
    .single();

  if (error) {
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
  const tags = (n.note_tags || [])
    .filter((nt: any) => nt.tags)
    .map((nt: any) => ({
      id: nt.tags.id,
      name: nt.tags.name,
      is_manual: nt.is_manual ?? true,
      source: nt.source || 'manual',
    }));

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

  return {
    id: n.id,
    user_id: n.user_id,
    author,
    content: n.content,
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
      .eq('name', cleanName)
      .maybeSingle();

    let tagId = existingTag?.id;

    if (!tagId) {
      const { data: newTag } = await db
        .from('tags')
        .insert({ user_id: userId, name: cleanName })
        .select('id')
        .maybeSingle();

      tagId = newTag?.id;
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

  let query = db
    .from('notes')
    .select(`
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
    `, { count: 'exact' })
    .is('deleted_at', null);

  if (feed === 'tagged_me') {
    const { data: mentionRows } = await db
      .from('mentions')
      .select('note_id')
      .eq('user_id', userId);

    const noteIds = (mentionRows || []).map((m: any) => m.note_id);
    if (noteIds.length === 0) {
      return res.json({ notes: [], pagination: { total: 0, limit, offset, has_more: false }, total: 0 });
    }

    query = query.in('id', noteIds).neq('user_id', userId);
  } else {
    query = query.eq('user_id', userId);
  }

  if (searchQuery) {
    const cleanSearch = searchQuery
      .replace(/[!&|():*]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .join(' & ');

    if (cleanSearch) {
      query = query.textSearch('fts', cleanSearch, { config: 'english' });
    }
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;

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

// Count unread / total mentions for the user (to show badge in sidebar)
app.get('/api/notes/mentions-count', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ count: 0 });

  const { count, error } = await db
    .from('mentions')
    .select('note_id', { count: 'exact', head: true })
    .eq('user_id', req.userId);

  if (error) return res.status(500).json({ count: 0 });
  res.json({ count: count || 0 });
});

// Create Note
app.post('/api/notes', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  const { content, manualTags } = req.body || {};
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
    const { data: usersData } = await db
      .from('users')
      .select('id, username, full_name, email, avatar_url')
      .in('username', parsed.mentions.map((m) => m.toLowerCase()));

    matchedTeammates = usersData || [];
    mentionedUserIds = matchedTeammates.map((u) => u.id);
  }

  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: noteErr } = await db.from('notes').insert({
    id: noteId,
    user_id: req.userId,
    content,
    created_at: now,
    updated_at: now,
  });

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
  const { content, manualTags } = req.body || {};

  const parsed = parseNoteContent(content || '');
  if (!parsed.isValid) {
    return res.status(400).json({ error: parsed.errors[0] || 'Invalid note content.', success: false });
  }

  const now = new Date().toISOString();

  const { data: updatedRow, error: updateErr } = await db
    .from('notes')
    .update({ content, updated_at: now })
    .eq('id', id)
    .eq('user_id', req.userId)
    .select('id, content, created_at, updated_at')
    .maybeSingle();

  if (updateErr) {
    return res.status(500).json({ error: `Could not update note: ${updateErr.message}`, success: false });
  }
  if (!updatedRow) {
    return res.status(404).json({ error: 'Note not found or you do not have permission to edit it.', success: false });
  }

  const combinedTags = Array.from(new Set([
    ...parsed.tags,
    ...(Array.isArray(manualTags) ? manualTags : [])
  ].map((t) => t.toLowerCase().trim())));

  let mentionedUserIds: string[] = [];
  let matchedTeammates: any[] = [];

  if (parsed.mentions.length > 0) {
    const { data: usersData } = await db
      .from('users')
      .select('id, username, full_name, email, avatar_url')
      .in('username', parsed.mentions.map((m) => m.toLowerCase()));

    matchedTeammates = usersData || [];
    mentionedUserIds = matchedTeammates.map((u) => u.id);
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

  const { error } = await db
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', req.userId);

  if (error) {
    return res.status(500).json({ error: error.message, success: false });
  }

  res.json({ success: true });
});

// Get User's Private Tags with Note Counts
app.get('/api/tags', async (req: AuthRequest, res: Response) => {
  const db = getDb(req);
  if (!db || !req.userId) return res.status(500).json({ error: 'Supabase not configured' });

  const { data: userTags, error } = await db
    .from('tags')
    .select('id, name, created_at')
    .eq('user_id', req.userId)
    .order('name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const { data: noteTags } = await db
    .from('note_tags')
    .select(`
      tag_id,
      notes!inner ( user_id )
    `)
    .eq('notes.user_id', req.userId);

  const countMap: Record<string, number> = {};
  (noteTags || []).forEach((nt: any) => {
    countMap[nt.tag_id] = (countMap[nt.tag_id] || 0) + 1;
  });

  const tags = (userTags || []).map((t) => ({
    id: t.id,
    name: t.name,
    count: countMap[t.id] || 0,
    created_at: t.created_at,
  }));

  res.json({ tags });
});

if (!isSupabaseConfigured) {
  console.warn('⚠️  Server running WITHOUT Supabase config. Data endpoints will return 500.');
}

app.listen(PORT, () => {
  console.log(`⚡ Mindshare Multi-User Engine running on port ${PORT}`);
});
