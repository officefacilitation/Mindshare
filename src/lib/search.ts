import { Note, SearchQuery } from './types';

/**
 * Tokenizes search query strings supporting boolean operators:
 * - AND operators: "AND", "&", "&&"
 * - OR operators: "OR", "|", "||"
 * Examples:
 *   "#work AND #urgent", "#work & #urgent" -> Matches notes with BOTH tags
 *   "#ideas OR #todo", "#ideas | #todo", "#ideas || #todo" -> Matches notes with EITHER tag
 *   "project & #important" -> Matches text "project" AND tag "important"
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

  // Normalize boolean operators: & / && -> AND, | / || -> OR
  const normalizedRaw = raw
    .replace(/&&/g, ' AND ')
    .replace(/&/g, ' AND ')
    .replace(/\|\|/g, ' OR ')
    .replace(/\|/g, ' OR ');

  // Detect boolean operator: OR if explicit OR/|/|| is present, otherwise default to AND
  const isOr = /\bOR\b/i.test(normalizedRaw);
  const operator: 'AND' | 'OR' = isOr ? 'OR' : 'AND';

  // Extract tags: #tagname
  const tagMatches = normalizedRaw.match(/#[a-zA-Z0-9_\-]{2,30}/g) || [];
  const tags = Array.from(new Set(tagMatches.map((t) => t.substring(1).toLowerCase())));

  // Extract mentions: @username
  const mentionMatches = normalizedRaw.match(/@[a-zA-Z0-9._\-]{2,30}/g) || [];
  const mentions = Array.from(new Set(mentionMatches.map((m) => m.substring(1).toLowerCase())));

  // Clean out tags, mentions, and operator keywords to get remaining free-text
  let freetext = normalizedRaw
    .replace(/#[a-zA-Z0-9_\-]{2,30}/g, '')
    .replace(/@[a-zA-Z0-9._\-]{2,30}/g, '')
    .replace(/\b(AND|OR)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    raw: normalizedRaw,
    tags,
    mentions,
    operator,
    freetext,
  };
}

/**
 * Filters notes collection according to parsed boolean query logic (AND / OR / & / |).
 */
export function filterNotes(notes: Note[], parsedQuery: SearchQuery): Note[] {
  const { tags, mentions, operator, freetext } = parsedQuery;

  if (tags.length === 0 && mentions.length === 0 && !freetext) {
    return notes;
  }

  const freeTextLower = freetext.toLowerCase();
  const freeTextWords = freeTextLower.split(' ').filter(Boolean);

  return notes.filter((note) => {
    const noteTagNames = (note.tags || []).map((t) => t.name.toLowerCase());
    const noteMentionUsernames = (note.mentions || []).map((m) => m.username.toLowerCase());
    const noteContentLower = note.content.toLowerCase();

    // Tag Matches
    const tagResults = tags.map((t) => noteTagNames.includes(t));

    // Mention Matches
    const mentionResults = mentions.map((m) => noteMentionUsernames.includes(m));

    // Free-Text Match
    let freetextMatch = true;
    if (freeTextWords.length > 0) {
      if (operator === 'AND') {
        freetextMatch = freeTextWords.every((w) => noteContentLower.includes(w));
      } else {
        freetextMatch = freeTextWords.some((w) => noteContentLower.includes(w));
      }
    }

    if (operator === 'AND') {
      // AND logic: note MUST satisfy all specified tags, mentions, and freetext words
      const allTagsMatch = tagResults.length === 0 || tagResults.every(Boolean);
      const allMentionsMatch = mentionResults.length === 0 || mentionResults.every(Boolean);
      return allTagsMatch && allMentionsMatch && freetextMatch;
    } else {
      // OR logic: note matches if ANY tag, ANY mention, or ANY freetext word matches
      const hasAnyTag = tagResults.some(Boolean);
      const hasAnyMention = mentionResults.some(Boolean);
      const hasFreetextMatch = freeTextWords.length > 0 && freetextMatch;
      return hasAnyTag || hasAnyMention || hasFreetextMatch;
    }
  });
}
