const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface AITagResponse {
  tags: string[];
  summary?: string;
  success: boolean;
  error?: string;
}

function generateLocalAITags(content: string): AITagResponse {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with',
    'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'from', 'up', 'down', 'of', 'off', 'over', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
    'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't',
    'can', 'will', 'just', 'don', 'should', 'now', 'this', 'that', 'these', 'those'
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
  content: string,
  userApiKey?: string
): Promise<AITagResponse> {
  const apiKey = userApiKey || process.env.GROQ_API_KEY;

  if (!content || !content.trim()) {
    return {
      tags: ['photo', 'attachment'],
      summary: 'Image attachment note.',
      success: true,
    };
  }

  if (!apiKey) {
    console.log('[Backend Groq AI] No GROQ_API_KEY set. Using Intelligent Local Fallback.');
    return generateLocalAITags(content);
  }

  const prompt = `Analyze this note: "${content.replace(/"/g, '\\"').replace(/\n/g, ' ')}".
Return ONLY a valid JSON object strictly matching this schema with no markdown:
{
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "1-sentence summary"
}`;

  // Currently active models on Groq Cloud
  const candidateModels = [
    process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    'llama-3.3-70b-specdec',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ];

  for (const modelName of candidateModels) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: 'You are an intelligent knowledge base auto-tagger. Output JSON strictly.' },
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
        console.warn(`[Groq AI] Model "${modelName}" returned HTTP ${response.status}. Trying next model...`);
        continue;
      }

      const data = await response.json();
      const rawOutput = data?.choices?.[0]?.message?.content;
      if (!rawOutput) continue;

      const parsed = JSON.parse(rawOutput);
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags
            .map((t: string) => String(t).toLowerCase().replace(/[^a-z0-9_-]/g, ''))
            .filter(Boolean)
        : [];

      console.log(`[Groq AI Success with ${modelName}]:`, tags);
      return {
        tags: tags.slice(0, 3),
        summary: parsed.summary || '',
        success: true,
      };
    } catch (err: any) {
      console.error(`[Groq AI Error with ${modelName}]:`, err.message);
    }
  }

  return generateLocalAITags(content);
}
