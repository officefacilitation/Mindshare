import { supabase, DEMO_USER_ID } from './supabase.js';
import { generateAITags } from './groq.js';

let isWorkerRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

export async function processNextAIJob(): Promise<boolean> {
  if (!supabase) return false;

  try {
    // 1. Fetch next pending job
    const { data: job, error: fetchErr } = await supabase
      .from('ai_jobs')
      .select('*')
      .in('status', ['pending'])
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      // If table doesn't exist yet on live DB, log once and skip
      if (fetchErr.code === '42P01') {
        return false;
      }
      console.error('[AI Worker] Error fetching pending jobs:', fetchErr.message);
      return false;
    }

    if (!job) return false; // No pending jobs

    // 2. Mark job as processing
    const { error: lockErr } = await supabase
      .from('ai_jobs')
      .update({
        status: 'processing',
        attempts: (job.attempts || 0) + 1,
      })
      .eq('id', job.id)
      .eq('status', 'pending');

    if (lockErr) return false;

    console.log(`[AI Worker] Processing Job ${job.id} for Note ${job.note_id} (Attempt ${job.attempts + 1})...`);

    const content = job.payload?.content || '';
    if (!content) {
      await supabase
        .from('ai_jobs')
        .update({ status: 'failed', last_error: 'Empty note content in payload' })
        .eq('id', job.id);
      return true;
    }

    // 3. Generate AI tags via Groq LLM API
    const aiResult = await generateAITags(content);

    if (aiResult.success && aiResult.tags.length > 0) {
      // 4. Batch insert AI tags into DB
      for (const tagName of aiResult.tags) {
        const cleanName = tagName.toLowerCase().trim();
        if (cleanName.length < 2) continue;

        // Upsert Tag
        let tagId: string | null = null;
        const { data: existingTag } = await supabase
          .from('tags')
          .select('id')
          .eq('user_id', job.user_id || DEMO_USER_ID)
          .eq('name', cleanName)
          .maybeSingle();

        if (existingTag?.id) {
          tagId = existingTag.id;
        } else {
          const { data: newTag } = await supabase
            .from('tags')
            .insert({
              user_id: job.user_id || DEMO_USER_ID,
              name: cleanName,
            })
            .select('id')
            .maybeSingle();
          tagId = newTag?.id || null;
        }

        if (tagId) {
          await supabase
            .from('note_tags')
            .upsert({
              note_id: job.note_id,
              tag_id: tagId,
              is_manual: false,
              source: 'ai_suggested',
              confidence_score: 0.85,
            }, { onConflict: 'note_id,tag_id' });
        }
      }

      // 5. Mark job as completed
      await supabase
        .from('ai_jobs')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          result: { tags: aiResult.tags, summary: aiResult.summary || '' },
        })
        .eq('id', job.id);

      console.log(`[AI Worker] ✅ Job ${job.id} completed successfully. Tags: ${aiResult.tags.join(', ')}`);
      return true;
    } else {
      throw new Error(aiResult.error || 'AI generation failed to produce tags');
    }
  } catch (err: any) {
    console.error('[AI Worker] Job processing error:', err.message);
    return false;
  }
}

export function startAIWorker(pollIntervalMs = 5000) {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  console.log(`🤖 AI Queue Worker initialized (polling every ${pollIntervalMs / 1000}s)...`);

  workerInterval = setInterval(async () => {
    await processNextAIJob();
  }, pollIntervalMs);
}

export function stopAIWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  isWorkerRunning = false;
}
