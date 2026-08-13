import { Note, SearchQuery } from './types';

/**
 * Tokenizes search query strings like "#Finance AND @Yashi", "#Tag1 OR #Tag2",
 * or mixed queries with free-text terms.
 */
export function parseSearchQuery(queryStr: string): SearchQuery {
  const raw = queryStr.trim();
  if (!raw) {
    return {
      raw: '',
      tags: [],
      mentions: [],
      operator: 'AND',
      freetext: '',
    };
  }

  // Detect explicit boolean operator OR vs AND (default AND)
  const isOr = /\bOR\b/i.test(raw);
  const operator: 'AND' | 'OR' = isOr ? 'OR' : 'AND';

  // Extract tags: #tagname
  const tagMatches = raw.match(/#[a-zA-Z0-9_\-]{2,30}/g) || [];
  const tags = Array.from(new Set(tagMatches.map((t) => t.substring(1).toLowerCase())));

  // Extract mentions: @username
  const mentionMatches = raw.match(/@[a-zA-Z0-9._\-]{2,30}/g) || [];
  const mentions = Array.from(new Set(mentionMatches.map((m) => m.substring(1).toLowerCase())));

  // Clean out tags, mentions, and operator keywords to get remaining free-text
  let freetext = raw
    .replace(/#[a-zA-Z0-9_\-]{2,30}/g, '')
    .replace(/@[a-zA-Z0-9._\-]{2,30}/g, '')
    .replace(/\b(AND|OR)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    raw,
    tags,
    mentions,
    operator,
    freetext,
  };
}

/**
 * Filters a collection of notes based on parsed search query logic.
 */
export function filterNotes(notes: Note[], parsedQuery: SearchQuery): Note[] {
  const { tags, mentions, operator, freetext } = parsedQuery;

  if (tags.length === 0 && mentions.length === 0 && !freetext) {
    return notes;
  }

  const freeTextLower = freetext.toLowerCase();

  return notes.filter((note) => {
    const noteTagNames = (note.tags || []).map((t) => t.name.toLowerCase());
    const noteMentionUsernames = (note.mentions || []).map((m) => m.username.toLowerCase());
    const noteContentLower = note.content.toLowerCase();

    // Check Tag Matches
    const tagResults = tags.map((t) => noteTagNames.includes(t));
    
    // Check Mention Matches
    const mentionResults = mentions.map((m) => noteMentionUsernames.includes(m));

    // Check Free-Text Match
    let freetextMatch = true;
    if (freeTextLower) {
      const words = freeTextLower.split(' ').filter(Boolean);
      if (operator === 'AND') {
        freetextMatch = words.every((w) => noteContentLower.includes(w));
      } else {
        freetextMatch = words.some((w) => noteContentLower.includes(w));
      }
    }

    if (operator === 'AND') {
      const allTagsMatch = tagResults.every(Boolean);
      const allMentionsMatch = mentionResults.every(Boolean);
      return allTagsMatch && allMentionsMatch && freetextMatch;
    } else {
      // OR logic: match if any tag matches, any mention matches, or freetext matches
      const hasAnyTag = tagResults.some(Boolean);
      const hasAnyMention = mentionResults.some(Boolean);
      return hasAnyTag || hasAnyMention || (Boolean(freeTextLower) && freetextMatch);
    }
  });
}
