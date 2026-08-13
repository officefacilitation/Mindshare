import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { supabase, isSupabaseConfigured, DEMO_USER_ID, ensureDemoUserExists } from './supabase.js';
import { generateAITags } from './groq.js';
import { parseNoteContent } from '../src/lib/parser.ts';
import { startAIWorker } from './aiWorker.js';

const app = express();
const PORT = process.env.PORT || 3001;
const APP_PASSWORD = process.env.APP_PASSWORD || 'mindshare123';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Path normalizer middleware: accepts requests with or without /api prefix
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.path.startsWith('/api') && req.path !== '/health') {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

interface Contact {
  id: string;
  display_name: string;
  username: string;
  contact_email: string;
  is_registered: boolean;
  status: 'active' | 'invited' | 'pending';
}

interface NoteTag {
  id: string;
  name: string;
  is_manual: boolean;
  source?: 'manual' | 'ai_suggested' | 'ai_confirmed';
  confidence_score?: number;
}

interface Note {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  tags: NoteTag[];
  mentions: Contact[];
  is_processing_ai?: boolean;
}

// Single-user password auth (in-memory sessions)
const sessions = new Map<string, number>();
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    if (expiresAt) sessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function mapNoteRow(n: any): Note {
  const tags: NoteTag[] = (n.note_tags || [])
    .filter((nt: any) => nt.tags)
    .map((nt: any) => ({
      id: nt.tags.id,
      name: nt.tags.name,
      is_manual: nt.is_manual ?? true,
      source: nt.source || (nt.is_manual ? 'manual' : 'ai_suggested'),
      confidence_score: nt.confidence_score ?? 1.0,
    }));

  const mentions: Contact[] = (n.mentions || [])
    .filter((m: any) => m.user_contacts)
    .map((m: any) => ({
      id: m.user_contacts.id,
      display_name: m.user_contacts.display_name,
      username: m.user_contacts.username,
      contact_email: m.user_contacts.contact_email,
      is_registered: true,
      status: 'active',
    }));

  return {
    id: n.id,
    user_id: n.user_id || DEMO_USER_ID,
    content: n.content,
    created_at: n.created_at,
    updated_at: n.updated_at,
    tags,
    mentions,
  };
}

// Batch helper: Upsert tags and link junctions efficiently
async function batchInsertTagsAndJunctions(noteId: string, tagNames: string[], isManual = true) {
  if (!supabase || tagNames.length === 0) return;

  for (const name of tagNames) {
    const cleanName = name.toLowerCase().trim();
    if (cleanName.length < 2) continue;

    // Fetch existing tag or create new one
    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('user_id', DEMO_USER_ID)
      .eq('name', cleanName)
      .maybeSingle();

    let tagId = existingTag?.id;

    if (!tagId) {
      const { data: newTag, error: tagErr } = await supabase
        .from('tags')
        .insert({ user_id: DEMO_USER_ID, name: cleanName })
        .select('id')
        .maybeSingle();

      if (!tagErr && newTag?.id) {
        tagId = newTag.id;
      } else {
        // Fallback check if created concurrently
        const { data: retryTag } = await supabase
          .from('tags')
          .select('id')
          .eq('user_id', DEMO_USER_ID)
          .eq('name', cleanName)
          .maybeSingle();
        tagId = retryTag?.id;
      }
    }

    if (tagId) {
      await supabase
        .from('note_tags')
        .upsert({
          note_id: noteId,
          tag_id: tagId,
          is_manual: isManual,
          source: isManual ? 'manual' : 'ai_suggested',
          confidence_score: isManual ? 1.0 : 0.85,
        }, { onConflict: 'note_id,tag_id' });
    }
  }
}

// Batch helper: Insert mentions
async function batchInsertMentions(noteId: string, contactIds: string[]) {
  if (!supabase || contactIds.length === 0) return;
  const rows = contactIds.map((contact_id) => ({ note_id: noteId, contact_id }));
  await supabase.from('mentions').upsert(rows, { onConflict: 'note_id,contact_id' });
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'online', service: 'Mindshare Scalable Backend API', timestamp: new Date() });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'online', service: 'Mindshare Scalable Backend API', timestamp: new Date() });
});

// Auth
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !password || !safeEqual(password, APP_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  res.json({ token, user: { id: DEMO_USER_ID } });
});

app.post('/api/auth/logout', requireAuth, (req: Request, res: Response) => {
  const header = req.headers.authorization || '';
  const token = header.slice(7);
  sessions.delete(token);
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (_req: Request, res: Response) => {
  res.json({ user: { id: DEMO_USER_ID } });
});

// Protect all /api endpoints below
app.use('/api', requireAuth);

// Contacts
app.get('/api/contacts', async (_req: Request, res: Response) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const { data, error } = await supabase
    .from('user_contacts')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const contacts: Contact[] = (data || []).map((c: any) => ({
    id: c.id,
    display_name: c.display_name,
    username: c.username,
    contact_email: c.contact_email,
    is_registered: c.is_registered ?? true,
    status: 'active',
  }));

  res.json({ contacts });
});

app.post('/api/contacts', async (req: Request, res: Response) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const { displayName, email } = req.body || {};
  if (!displayName || typeof displayName !== 'string') {
    return res.status(400).json({ error: 'Display name required' });
  }

  const username = displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (username.length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 alphanumeric characters.' });
  }

  const { data: existing } = await supabase
    .from('user_contacts')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: `Contact @${username} already exists.` });
  }

  const id = crypto.randomUUID();
  const contactEmail = email || `${username}@company.com`;

  const { error: insertErr } = await supabase.from('user_contacts').insert({
    id,
    owner_user_id: DEMO_USER_ID,
    display_name: displayName,
    username,
    contact_email: contactEmail,
    is_registered: true,
  });

  if (insertErr) {
    return res.status(500).json({ error: `Database Error: ${insertErr.message}` });
  }

  const contact: Contact = {
    id,
    display_name: displayName,
    username,
    contact_email: contactEmail,
    is_registered: true,
    status: 'active',
  };

  res.status(201).json({ contact, success: true });
});

// Scalable Paginated Notes Endpoint (Handles 10,000+ Notes Scale)
app.get('/api/notes', async (req: Request, res: Response) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const tagFilter = req.query.tag as string;
  const mentionFilter = req.query.mention as string;
  const searchQuery = ((req.query.q || req.query.search || '') as string).trim();

  let query = supabase
    .from('notes')
    .select(`
      id,
      user_id,
      content,
      created_at,
      updated_at,
      note_tags (
        is_manual,
        source,
        confidence_score,
        tags ( id, name )
      ),
      mentions (
        contact_id,
        user_contacts ( id, display_name, username, contact_email )
      )
    `, { count: 'exact' })
    .is('deleted_at', null);

  if (searchQuery) {
    // Perform PostgreSQL Full-Text Search on GIN fts index
    const formattedQuery = searchQuery.split(/\s+/).filter(Boolean).join(' & ');
    query = query.textSearch('fts', formattedQuery, { config: 'english' });
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Supabase notes fetch error:', error);
    return res.status(500).json({ error: error.message });
  }

  let notes: Note[] = (data || []).map(mapNoteRow);

  // In-memory filter fallback for tag/mention parameter matching
  if (tagFilter) {
    notes = notes.filter((n) => n.tags.some((t) => t.name.toLowerCase() === tagFilter.toLowerCase()));
  }
  if (mentionFilter) {
    notes = notes.filter((n) =>
      n.mentions.some((m) => m.username.toLowerCase() === mentionFilter.toLowerCase())
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

// High-Performance Note Creation (Atomic / Batch + Async Queue)
app.post('/api/notes', async (req: Request, res: Response) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const { content } = req.body || {};
  const parsed = parseNoteContent(content || '');
  if (!parsed.isValid) {
    return res.status(400).json({ error: parsed.errors[0] || 'Invalid note content.', success: false });
  }

  // 1. Efficient targeted check for mentioned usernames
  let matchedContacts: Contact[] = [];
  if (parsed.mentions.length > 0) {
    const { data: contactsData } = await supabase
      .from('user_contacts')
      .select('*')
      .in('username', parsed.mentions.map((m) => m.toLowerCase()))
      .is('deleted_at', null);

    const foundMap = new Map((contactsData || []).map((c: any) => [c.username.toLowerCase(), c]));
    const unknownMentions = parsed.mentions.filter((m) => !foundMap.has(m.toLowerCase()));

    if (unknownMentions.length > 0) {
      return res.status(400).json({
        error: `@${unknownMentions[0]} isn't a contact yet. Add them first in People directory.`,
        success: false,
      });
    }

    matchedContacts = (contactsData || []).map((c: any) => ({
      id: c.id,
      display_name: c.display_name,
      username: c.username,
      contact_email: c.contact_email,
      is_registered: c.is_registered ?? true,
      status: 'active',
    }));
  }

  // 2. Try Atomic RPC Procedure `create_note_with_relations` first
  const contactIds = matchedContacts.map((c) => c.id);
  const { data: rpcNoteId, error: rpcErr } = await supabase.rpc('create_note_with_relations', {
    p_user_id: DEMO_USER_ID,
    p_content: content,
    p_tags: parsed.tags,
    p_contact_ids: contactIds,
  });

  let noteId = rpcNoteId;

  if (rpcErr || !noteId) {
    // Fallback: Pure JS Batch Insertion if RPC is not present in live DB
    noteId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: noteErr } = await supabase.from('notes').insert({
      id: noteId,
      user_id: DEMO_USER_ID,
      content,
      created_at: now,
      updated_at: now,
    });

    if (noteErr) {
      return res.status(500).json({ error: `Could not save note: ${noteErr.message}`, success: false });
    }

    // Batch insert manual tags & mentions
    await batchInsertTagsAndJunctions(noteId, parsed.tags, true);
    await batchInsertMentions(noteId, contactIds);

    // Enqueue persistent AI job into ai_jobs queue table
    await supabase.from('ai_jobs').insert({
      note_id: noteId,
      user_id: DEMO_USER_ID,
      status: 'pending',
      payload: { content },
    }).catch(() => null);

    // Immediate fallback AI tag generation call
    generateAITags(content)
      .then(async (aiResult) => {
        const existingNames = new Set(parsed.tags.map((t) => t.toLowerCase()));
        const newAITags = aiResult.tags.filter((t) => !existingNames.has(t.toLowerCase()));
        if (newAITags.length > 0) {
          await batchInsertTagsAndJunctions(noteId, newAITags, false);
        }
      })
      .catch((err) => console.error('AI Tagging error:', err));
  }

  const tags: NoteTag[] = parsed.tags.map((t) => ({
    id: `t-${t.toLowerCase()}`,
    name: t.toLowerCase(),
    is_manual: true,
  }));

  const note: Note = {
    id: noteId,
    user_id: DEMO_USER_ID,
    content,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tags,
    mentions: matchedContacts,
    is_processing_ai: true,
  };

  return res.status(201).json({ note, success: true });
});

// Update Note
app.put('/api/notes/:id', async (req: Request, res: Response) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const { id } = req.params;
  const { content } = req.body || {};

  const parsed = parseNoteContent(content || '');
  if (!parsed.isValid) {
    return res.status(400).json({ error: parsed.errors[0] || 'Invalid note content.', success: false });
  }

  // Targeted check for mentioned contacts
  let matchedContacts: Contact[] = [];
  if (parsed.mentions.length > 0) {
    const { data: contactsData } = await supabase
      .from('user_contacts')
      .select('*')
      .in('username', parsed.mentions.map((m) => m.toLowerCase()))
      .is('deleted_at', null);

    const foundMap = new Map((contactsData || []).map((c: any) => [c.username.toLowerCase(), c]));
    const unknownMentions = parsed.mentions.filter((m) => !foundMap.has(m.toLowerCase()));

    if (unknownMentions.length > 0) {
      return res.status(400).json({
        error: `@${unknownMentions[0]} isn't a contact yet. Add them first in People directory.`,
        success: false,
      });
    }

    matchedContacts = (contactsData || []).map((c: any) => ({
      id: c.id,
      display_name: c.display_name,
      username: c.username,
      contact_email: c.contact_email,
      is_registered: c.is_registered ?? true,
      status: 'active',
    }));
  }

  const now = new Date().toISOString();

  const { data: updatedRow, error: updateErr } = await supabase
    .from('notes')
    .update({ content, updated_at: now })
    .eq('id', id)
    .select('id, content, created_at, updated_at')
    .maybeSingle();

  if (updateErr) {
    return res.status(500).json({ error: `Could not update note: ${updateErr.message}`, success: false });
  }
  if (!updatedRow) {
    return res.status(404).json({ error: 'Note not found', success: false });
  }

  // Resync relations safely
  await supabase.from('note_tags').delete().eq('note_id', id);
  await supabase.from('mentions').delete().eq('note_id', id);
  await batchInsertTagsAndJunctions(id, parsed.tags, true);
  await batchInsertMentions(id, matchedContacts.map((c) => c.id));

  const tags: NoteTag[] = parsed.tags.map((t) => ({
    id: `t-${t.toLowerCase()}`,
    name: t.toLowerCase(),
    is_manual: true,
  }));

  const note: Note = {
    id: updatedRow.id,
    user_id: DEMO_USER_ID,
    content: updatedRow.content,
    created_at: updatedRow.created_at,
    updated_at: updatedRow.updated_at,
    tags,
    mentions: matchedContacts,
  };

  res.json({ note, success: true });
});

// Delete Note
app.delete('/api/notes/:id', async (req: Request, res: Response) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const { id } = req.params;
  const { error, count } = await supabase.from('notes').delete({ count: 'exact' }).eq('id', id);

  if (error) {
    return res.status(500).json({ error: error.message, success: false });
  }

  if (!count || count === 0) {
    return res.status(404).json({ error: 'Note not found', success: false });
  }

  res.json({ success: true });
});

if (!isSupabaseConfigured) {
  console.warn('⚠️  Server running WITHOUT Supabase config. Data endpoints will return 500.');
}

app.listen(PORT, () => {
  console.log(`⚡ Mindshare Scalable Backend API Server running on port ${PORT}`);
  ensureDemoUserExists();
  // Start persistent background AI Queue worker polling
  startAIWorker(5000);
});
