/**
 * Analysis queue (in-process).
 *
 * The chapter-save endpoint enqueues here, returns 200 immediately, and the
 * worker drains the queue asynchronously. Each chapter is debounced so that
 * a burst of keystrokes coalesces into a single analysis run.
 *
 * For production: replace with BullMQ + Redis so jobs survive process restarts
 * and scale horizontally. The interface (enqueueAnalysis) stays the same.
 */

import { analyzeChapter } from './bibleService.js';

const DEBOUNCE_MS = 4000;

interface PendingJob {
  timer: NodeJS.Timeout;
  running: boolean;
  rerun: boolean; // if a new request comes in while running, schedule a rerun
}

const jobs = new Map<string, PendingJob>();

export function enqueueAnalysis(chapterId: string): void {
  const existing = jobs.get(chapterId);
  if (existing) {
    if (existing.running) {
      existing.rerun = true;
      return;
    }
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => void runJob(chapterId), DEBOUNCE_MS);
  jobs.set(chapterId, { timer, running: false, rerun: false });
}

async function runJob(chapterId: string): Promise<void> {
  const job = jobs.get(chapterId);
  if (!job) return;

  job.running = true;
  try {
    await analyzeChapter(chapterId);
    console.log(`[analysis] done for ${chapterId}`);
  } catch (err) {
    console.error(`[analysis] failed for ${chapterId}:`, err);
  } finally {
    const finalJob = jobs.get(chapterId);
    if (finalJob?.rerun) {
      // Another save arrived while we were running — schedule once more.
      jobs.delete(chapterId);
      enqueueAnalysis(chapterId);
    } else {
      jobs.delete(chapterId);
    }
  }
}
