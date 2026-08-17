const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface AITagResponse {
  tags: string[];
  summary?: string;
  success: boolean;
  error?: string;
}

/**
 * Strips image markdown, standalone URLs, file extensions, and base64 string noise from content
 * so the AI LLM only receives clean human thought text (saving tokens and eliminating junk tags).
 */
function cleanContentForAI(content: string): string {
  if (!content) return '';
  return content
    .replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi, '') // Remove markdown images ![image](url)
    .replace(/https?:\/\/[^\s]+/gi, '')              // Remove standalone http/https URLs
    .replace(/data:image\/[a-z]+;base64,[^\s]+/gi, '') // Remove base64 data URIs
    .trim();
}

function generateLocalAITags(rawContent: string): AITagResponse {
  const content = cleanContentForAI(rawContent) || 'Photo attachment note';

  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with',
    'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'from', 'up', 'down', 'of', 'off', 'over', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
    'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't',
    'can', 'will', 'just', 'don', 'should', 'now', 'this', 'that', 'these', 'those',
    'image', 'jpg', 'png', 'webp', 'jpeg', 'url', 'http', 'https', 'cloudinary'
  ]);

  const words = content
    .toLowerCase()
    .replace(/[^\w\s#@]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w) && !w.startsWith('#') && !w.startsWith('@'));

  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  const sortedWords = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  const tags = sortedWords.slice(0, 3).map((t) => t.toLowerCase());

  const sentences = content.split(/(?<=[.!?])\s+/);
  const summary = sentences[0] && sentences[0].length > 10
    ? sentences[0].substring(0, 120) + (sentences[0].length > 120 ? '...' : '')
    : content.substring(0, 100) + '...';

  return {
    tags: tags.length > 0 ? tags : ['thought', 'note'],
    summary,
    success: true,
  };
}

export async function generateAITags(
  rawContent: string,
  userApiKey?: string
): Promise<AITagResponse> {
  const apiKey = userApiKey || process.env.GROQ_API_KEY;

  // Clean raw content so image URLs & markdown image syntax are stripped before calling AI
  const cleanContent = cleanContentForAI(rawContent);

  if (!cleanContent) {
    return {
      tags: ['photo', 'attachment'],
      summary: 'Image attachment note.',
      success: true,
    };
  }

  if (!apiKey) {
    console.log('[Backend Groq AI] No GROQ_API_KEY set. Using Intelligent Local Fallback.');
    return generateLocalAITags(cleanContent);
  }

  const prompt = `Analyze this note text: "${cleanContent.replace(/"/g, '\\"')}".
Return ONLY a valid JSON object strictly matching this schema with no markdown:
{
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "1-sentence summary"
}`;

  let attempts = 0;
  const maxAttempts = 3;
  let delay = 1000;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are an intelligent knowledge base auto-tagger. Output JSON strictly. Never output tags about image file extensions, URLs, or image hosting platforms.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 150,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Groq API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const rawOutput = data?.choices?.[0]?.message?.content;
      if (!rawOutput) throw new Error('Empty response');

      const parsed = JSON.parse(rawOutput);
      const invalidAITags = new Set(['image', 'jpg', 'png', 'webp', 'jpeg', 'cloudinary', 'upload', 'http', 'https', 'url']);

      const tags = Array.isArray(parsed.tags)
        ? parsed.tags
            .map((t: string) => String(t).toLowerCase().replace(/[^a-z0-9_-]/g, ''))
            .filter((t: string) => Boolean(t) && !invalidAITags.has(t))
        : [];

      return {
        tags: tags.slice(0, 3),
        summary: parsed.summary || '',
        success: true,
      };
    } catch (err: any) {
      if (attempts >= maxAttempts) {
        return generateLocalAITags(cleanContent);
      }
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2;
    }
  }

  return generateLocalAITags(cleanContent);
}
