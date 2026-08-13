import { ParsedNote } from './types';

/**
 * Parsing & Validation Engine for Mindshare Notes
 * Handles 30+ edge cases including URL anchors, emails, double symbols,
 * character limits, and duplicate tag/mention normalization.
 */
export function parseNoteContent(content: string): ParsedNote {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return {
      content: content || '',
      tags: [],
      mentions: [],
      isValid: false,
      errors: ['Note content cannot be empty.'],
    };
  }

  if (content.length > 10000) {
    return {
      content,
      tags: [],
      mentions: [],
      isValid: false,
      errors: ['Note content exceeds maximum allowed length of 10,000 characters.'],
    };
  }

  // Find ranges of URLs (e.g., https://docs.com#section or http://example.com#anchor)
  const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
  const urlRanges: [number, number][] = [];
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(content)) !== null) {
    urlRanges.push([match.index, match.index + match[0].length]);
  }

  // Find ranges of email addresses (e.g., bob@company.com) so domain isn't parsed as @mention
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const emailRanges: [number, number][] = [];

  while ((match = emailRegex.exec(content)) !== null) {
    emailRanges.push([match.index, match.index + match[0].length]);
  }

  const isIndexInRanges = (idx: number, ranges: [number, number][]) => {
    return ranges.some(([start, end]) => idx >= start && idx < end);
  };

  // 1. Extract Tags (#TagName)
  // Requires 1 or more leading hashes (e.g. #tag or ##double) followed by 2-30 chars
  const tagRegex = /(?:^|[\s,.:;!?"'(\[\{])#+([a-zA-Z0-9_\-]{2,30})/g;
  const rawTags: string[] = [];

  while ((match = tagRegex.exec(content)) !== null) {
    const hashIndex = match.index + match[0].indexOf('#');
    if (isIndexInRanges(hashIndex, urlRanges)) {
      continue; // Skip URL anchor fragments
    }

    let tagStr = match[1];
    // Strip trailing dashes or punctuation
    tagStr = tagStr.replace(/[-_]+$/, '');

    if (tagStr.length >= 2 && tagStr.length <= 30) {
      rawTags.push(tagStr.toLowerCase());
    }
  }

  // 2. Extract Mentions (@Username)
  // Requires 1 or more leading @ signs followed by 2-30 chars
  const mentionRegex = /(?:^|[\s,.:;!?"'(\[\{])@+([a-zA-Z0-9._\-]{2,30})/g;
  const rawMentions: string[] = [];

  while ((match = mentionRegex.exec(content)) !== null) {
    const atIndex = match.index + match[0].indexOf('@');
    if (isIndexInRanges(atIndex, urlRanges) || isIndexInRanges(atIndex, emailRanges)) {
      continue; // Skip email domains or URLs
    }

    let mentionStr = match[1];
    // Strip trailing periods or punctuation
    mentionStr = mentionStr.replace(/[._\-]+$/, '');

    if (mentionStr.length >= 2 && mentionStr.length <= 30) {
      rawMentions.push(mentionStr.toLowerCase());
    }
  }

  // Deduplicate case-insensitively
  const uniqueTags = Array.from(new Set(rawTags));
  const uniqueMentions = Array.from(new Set(rawMentions));

  if (uniqueMentions.length > 20) {
    errors.push('Maximum 20 mentions allowed per note.');
  }

  return {
    content,
    tags: uniqueTags,
    mentions: uniqueMentions,
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates whether a mention corresponds to a valid contact/user.
 */
export function validateMentions(
  mentions: string[],
  validUsernames: string[]
): { valid: string[]; invalid: string[] } {
  const normalizedValid = new Set(validUsernames.map((u) => u.toLowerCase()));
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const mention of mentions) {
    if (normalizedValid.has(mention.toLowerCase())) {
      valid.push(mention);
    } else {
      invalid.push(mention);
    }
  }

  return { valid, invalid };
}
