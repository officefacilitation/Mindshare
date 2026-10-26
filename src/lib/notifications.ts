import { Note } from './types';
import { playNotificationChime } from './sound';

let swRegistration: ServiceWorkerRegistration | null = null;
const activeTimers = new Map<string, number>();

/**
 * Initialize Service Worker for PWA and Mobile Push
 */
export async function initNotifications(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      swRegistration = reg;
      console.log('[Mindshare PWA] Service Worker registered successfully.');
    } catch (err) {
      console.warn('[Mindshare PWA] Service Worker registration failed:', err);
    }
  }

  // Initialize 9 AM and 6 PM daily thought nudge schedule
  initDailyNudges();
}

/**
 * Check current notification permission
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Request Notification Permission from User (Phone & Desktop)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      showNotification('🔔 Mindshare Notifications Active', {
        body: 'You will receive reminders on your phone and desktop when deadlines hit.',
      });
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[Notifications] Permission request error:', err);
    return false;
  }
}

/**
 * Show a native OS/Phone popup notification
 */
export async function showNotification(
  title: string,
  options: { body?: string; tag?: string; noteId?: string } = {}
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // Play audio chime
  playNotificationChime();

  const body = options.body || '';
  const tag = options.tag || 'mindshare-reminder';

  if (swRegistration && 'showNotification' in swRegistration) {
    try {
      await swRegistration.showNotification(title, {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag,
        renotify: true,
        data: { noteId: options.noteId },
      } as any);
      return;
    } catch (e) {
      // Fallback to Window Notification constructor
    }
  }

  try {
    new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag,
    });
  } catch (err) {
    console.warn('[Notification API] Fallback error:', err);
  }
}

/**
 * Schedule a client-side reminder timer
 */
export function scheduleNoteReminder(note: Note, onTrigger?: (note: Note) => void): void {
  if (!note.reminder_at || note.is_completed) {
    if (activeTimers.has(note.id)) {
      clearTimeout(activeTimers.get(note.id));
      activeTimers.delete(note.id);
    }
    return;
  }

  const reminderTime = new Date(note.reminder_at).getTime();
  const now = Date.now();
  const delay = reminderTime - now;

  // Clear any existing timer for this note
  if (activeTimers.has(note.id)) {
    clearTimeout(activeTimers.get(note.id));
    activeTimers.delete(note.id);
  }

  // If reminder is in the future (within next 7 days)
  if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) {
    const timerId = window.setTimeout(() => {
      activeTimers.delete(note.id);
      
      const cleanContent = note.content
        .replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g, '')
        .trim();

      showNotification('⏰ Mindshare Reminder', {
        body: cleanContent || 'Scheduled thought reminder is due now!',
        tag: `reminder-${note.id}`,
        noteId: note.id,
      });

      if (onTrigger) onTrigger(note);
    }, delay);

    activeTimers.set(note.id, timerId);
  }
}

/**
 * Scan all notes and sync active reminder timers
 */
export function syncAllNoteReminders(notes: Note[]): void {
  const firedMap = getFiredReminders();

  notes.forEach((note) => {
    if (!note.reminder_at || note.is_completed) return;

    const reminderTime = new Date(note.reminder_at).getTime();
    const now = Date.now();

    // If it was due in the last 15 minutes and hasn't fired yet
    if (now >= reminderTime && (now - reminderTime) < 15 * 60 * 1000 && !firedMap.has(note.id)) {
      firedMap.add(note.id);
      saveFiredReminders(firedMap);

      const cleanContent = note.content
        .replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g, '')
        .trim();

      showNotification('⏰ Mindshare Reminder Due', {
        body: cleanContent || 'Scheduled thought reminder is due now!',
        tag: `reminder-${note.id}`,
        noteId: note.id,
      });
    } else if (reminderTime > now) {
      scheduleNoteReminder(note);
    }
  });
}

function getFiredReminders(): Set<string> {
  try {
    const raw = sessionStorage.getItem('mindshare_fired_reminders');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveFiredReminders(set: Set<string>): void {
  try {
    sessionStorage.setItem('mindshare_fired_reminders', JSON.stringify(Array.from(set)));
  } catch {}
}

let dailyNudgeTimerId: number | null = null;

/**
 * Daily Morning (9:00 AM) and Evening (6:00 PM) Thought Nudges
 * Encourages regular reflection and capturing ideas on Phone and Desktop.
 */
export function initDailyNudges(): void {
  if (typeof window === 'undefined') return;

  if (dailyNudgeTimerId) {
    clearTimeout(dailyNudgeTimerId);
    dailyNudgeTimerId = null;
  }

  const checkAndScheduleNext = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const slot9am = new Date(now);
    slot9am.setHours(9, 0, 0, 0);

    const slot6pm = new Date(now);
    slot6pm.setHours(18, 0, 0, 0);

    const nowMs = now.getTime();
    const key9am = `mindshare_nudge_${todayStr}_09am`;
    const key6pm = `mindshare_nudge_${todayStr}_06pm`;

    // 9 AM Slot Check (window: 9:00 AM - 9:45 AM)
    if (nowMs >= slot9am.getTime() && nowMs < slot9am.getTime() + 45 * 60 * 1000) {
      if (!localStorage.getItem(key9am)) {
        localStorage.setItem(key9am, 'fired');
        showNotification('☀️ Morning Mindshare', {
          body: "Good morning! What's top of mind today? Jot down your morning thoughts & priorities.",
          tag: 'mindshare-daily-9am',
        });
      }
    }

    // 6 PM Slot Check (window: 6:00 PM - 6:45 PM)
    if (nowMs >= slot6pm.getTime() && nowMs < slot6pm.getTime() + 45 * 60 * 1000) {
      if (!localStorage.getItem(key6pm)) {
        localStorage.setItem(key6pm, 'fired');
        showNotification('🌙 Evening Mindshare', {
          body: 'End of day reflection. Any takeaways, learnings, or quick thoughts to capture?',
          tag: 'mindshare-daily-6pm',
        });
      }
    }

    // Determine the next upcoming target slot
    let nextTarget: Date;
    if (nowMs < slot9am.getTime()) {
      nextTarget = slot9am;
    } else if (nowMs < slot6pm.getTime()) {
      nextTarget = slot6pm;
    } else {
      // Tomorrow at 9:00 AM
      nextTarget = new Date(now);
      nextTarget.setDate(nextTarget.getDate() + 1);
      nextTarget.setHours(9, 0, 0, 0);
    }

    const delayMs = Math.max(1000, nextTarget.getTime() - nowMs);
    dailyNudgeTimerId = window.setTimeout(() => {
      checkAndScheduleNext();
    }, delayMs);
  };

  checkAndScheduleNext();
}
