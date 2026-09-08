import { Note, SearchQuery } from './types';

/**
 * Tokenizes search query strings supporting full boolean operators:
 * - AND operators: "AND", "&", "&&"
 * - OR operators: "OR", "|", "||"
 * - NOT operators: "NOT #tag", "-#tag", "!#tag", "-word", "NOT word"
 * Examples:
 *   "#work AND #urgent", "#work & #urgent" -> Notes with BOTH tags
 *   "#ideas OR #todo", "#ideas | #todo" -> Notes with EITHER tag
 *   "#work NOT #archive", "#work -#archive" -> Notes with #work but WITHOUT #archive
 *   "project -client" -> Notes containing "project" but NOT containing "client"
 */
export function parseSearchQuery(queryStr: string): SearchQuery {
  const raw = queryStr.trim();
  if (!raw) {
    return {
      raw: '',
      tags: [],
      mentions: [],
      excludeTags: [],
      excludeMentions: [],
      excludeWords: [],
      operator: 'AND',
      freetext: '',
    };
  }

  // Pre-normalize NOT operators:
  // "NOT #tag" -> "-#tag", "NOT @user" -> "-@user", "NOT word" -> "-word"
  let processed = raw
    .replace(/\bNOT\s+#([a-zA-Z0-9_\-]+)/gi, ' -#$1 ')
    .replace(/\bNOT\s+@([a-zA-Z0-9._\-]+)/gi, ' -@$1 ')
    .replace(/\bNOT\s+([a-zA-Z0-9_\-]+)/gi, ' -$1 ');

  // Normalize boolean operators: & / && -> AND, | / || -> OR
  processed = processed
    .replace(/&&/g, ' AND ')
    .replace(/&/g, ' AND ')
    .replace(/\|\|/g, ' OR ')
    .replace(/\|/g, ' OR ');

  // Detect boolean operator: OR if explicit OR/|/|| is present, otherwise default to AND
  const isOr = /\bOR\b/i.test(processed);
  const operator: 'AND' | 'OR' = isOr ? 'OR' : 'AND';

  // Extract Excluded Tags: -#tag or !#tag
  const excludeTagMatches = processed.match(/[-!]#[a-zA-Z0-9_\-]{2,30}/g) || [];
  const excludeTags = Array.from(new Set(excludeTagMatches.map((t) => t.substring(2).toLowerCase())));
  processed = processed.replace(/[-!]#[a-zA-Z0-9_\-]{2,30}/g, ' ');

  // Extract Excluded Mentions: -@username or !@username
  const excludeMentionMatches = processed.match(/[-!]@[a-zA-Z0-9._\-]{2,30}/g) || [];
  const excludeMentions = Array.from(new Set(excludeMentionMatches.map((m) => m.substring(2).toLowerCase())));
  processed = processed.replace(/[-!]@[a-zA-Z0-9._\-]{2,30}/g, ' ');

  // Extract Excluded Words: -word
  const excludeWordMatches = processed.match(/(?:^|\s)-([a-zA-Z0-9]{2,30})/g) || [];
  const excludeWords = Array.from(
    new Set(excludeWordMatches.map((w) => w.trim().substring(1).toLowerCase()))
  );
  processed = processed.replace(/(?:^|\s)-([a-zA-Z0-9]{2,30})/g, ' ');

  // Extract Positive Tags: #tagname
  const tagMatches = processed.match(/#[a-zA-Z0-9_\-]{2,30}/g) || [];
  const tags = Array.from(new Set(tagMatches.map((t) => t.substring(1).toLowerCase())));
  processed = processed.replace(/#[a-zA-Z0-9_\-]{2,30}/g, ' ');

  // Extract Positive Mentions: @username
  const mentionMatches = processed.match(/@[a-zA-Z0-9._\-]{2,30}/g) || [];
  const mentions = Array.from(new Set(mentionMatches.map((m) => m.substring(1).toLowerCase())));
  processed = processed.replace(/@[a-zA-Z0-9._\-]{2,30}/g, ' ');

  // Clean out operator keywords to get remaining free-text
  const freetext = processed
    .replace(/\b(AND|OR)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    raw: raw,
    tags,
    mentions,
    excludeTags,
    excludeMentions,
    excludeWords,
    operator,
    freetext,
  };
}

/**
 * High-performance note filtering supporting AND, OR, and NOT boolean operations.
 * Optimized for sub-millisecond execution over 10,000+ notes in RAM.
 */
export function filterNotes(notes: Note[], parsedQuery: SearchQuery): Note[] {
  const {
    tags,
    mentions,
    excludeTags = [],
    excludeMentions = [],
    excludeWords = [],
    operator,
    freetext,
  } = parsedQuery;

  const hasPositiveCriteria = tags.length > 0 || mentions.length > 0 || Boolean(freetext);
  const hasNegativeCriteria =
    excludeTags.length > 0 || excludeMentions.length > 0 || excludeWords.length > 0;

  if (!hasPositiveCriteria && !hasNegativeCriteria) {
    return notes;
  }

  const freeTextLower = freetext.toLowerCase();
  const freeTextWords = freeTextLower.split(' ').filter(Boolean);

  return notes.filter((note) => {
    const noteContentLower = note.content.toLowerCase();
    const noteTagNames = (note.tags || []).map((t) => t.name.toLowerCase());
    const noteMentionUsernames = (note.mentions || []).map((m) => m.username.toLowerCase());

    // 1. Strict Negative / Exclude check (NOT logic)
    if (hasNegativeCriteria) {
      if (excludeTags.some((t) => noteTagNames.includes(t))) return false;
      if (excludeMentions.some((m) => noteMentionUsernames.includes(m))) return false;
      if (excludeWords.some((w) => noteContentLower.includes(w))) return false;
    }

    // If there are no positive criteria specified, the note passed negative exclusion
    if (!hasPositiveCriteria) {
      return true;
    }

    // 2. Positive Tag & Mention Checks
    const tagMatches = tags.map((t) => noteTagNames.includes(t));
    const mentionMatches = mentions.map((m) => noteMentionUsernames.includes(m));

    // 3. Positive Free-Text Check
    let freetextMatch = true;
    if (freeTextWords.length > 0) {
      if (operator === 'AND') {
        freetextMatch = freeTextWords.every((w) => noteContentLower.includes(w));
      } else {
        freetextMatch = freeTextWords.some((w) => noteContentLower.includes(w));
      }
    }

    if (operator === 'AND') {
      // AND logic: note MUST satisfy all specified positive tags, mentions, and freetext
      const allTagsMatch = tagMatches.length === 0 || tagMatches.every(Boolean);
      const allMentionsMatch = mentionMatches.length === 0 || mentionMatches.every(Boolean);
      return allTagsMatch && allMentionsMatch && freetextMatch;
    } else {
      // OR logic: note matches if ANY tag, ANY mention, or ANY freetext word matches
      const hasAnyTag = tagMatches.some(Boolean);
      const hasAnyMention = mentionMatches.some(Boolean);
      const hasAnyFreetext = freeTextWords.length > 0 && freetextMatch;
      return hasAnyTag || hasAnyMention || hasAnyFreetext;
    }
  });
}
