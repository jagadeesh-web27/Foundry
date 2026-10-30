/**
 * Foundry DateResolver - Temporal Reasoning Engine
 * Resolves natural language date and time expressions relative to system time or message timestamp.
 */

export interface ResolvedDate {
  date: Date;
  isApproximate: boolean;
  rawExpression: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export class DateResolver {
  /**
   * Resolves a relative or natural language date string into an exact Date object.
   * @param text The expression to resolve (e.g. "tomorrow", "by EOD", "next Friday", "in 2 days")
   * @param referenceDate The reference point (defaults to now, or message timestamp)
   */
  public resolve(text: string, referenceDate: Date = new Date()): ResolvedDate | null {
    if (!text || !text.trim()) return null;
    const clean = text.toLowerCase().trim();
    const ref = new Date(referenceDate.getTime());

    // 1. "today", "by EOD", "by end of day", "tonight", "this evening"
    if (/\b(today|by eod|end of day|end of the day|tonight|this evening)\b/i.test(clean)) {
      const d = new Date(ref);
      if (/\b(eod|end of day|end of the day)\b/i.test(clean)) {
        d.setHours(17, 0, 0, 0); // 5:00 PM standard business EOD
      } else if (/\b(tonight|this evening)\b/i.test(clean)) {
        d.setHours(20, 0, 0, 0);
      } else {
        d.setHours(18, 0, 0, 0);
      }
      return { date: d, isApproximate: false, rawExpression: text };
    }

    // 2. "tomorrow", "tomorrow morning", "tomorrow afternoon", "tomorrow by EOD"
    if (/\btomorrow\b/i.test(clean)) {
      const d = new Date(ref);
      d.setDate(d.getDate() + 1);
      if (/\bmorning\b/i.test(clean)) {
        d.setHours(9, 0, 0, 0);
      } else if (/\bafternoon\b/i.test(clean)) {
        d.setHours(14, 0, 0, 0);
      } else if (/\b(eod|end of day)\b/i.test(clean)) {
        d.setHours(17, 0, 0, 0);
      } else {
        d.setHours(18, 0, 0, 0);
      }
      return { date: d, isApproximate: false, rawExpression: text };
    }

    // 3. "yesterday"
    if (/\byesterday\b/i.test(clean)) {
      const d = new Date(ref);
      d.setDate(d.getDate() - 1);
      d.setHours(18, 0, 0, 0);
      return { date: d, isApproximate: false, rawExpression: text };
    }

    // 4. "after lunch" -> 14:00 today
    if (/\bafter lunch\b/i.test(clean)) {
      const d = new Date(ref);
      d.setHours(14, 0, 0, 0);
      return { date: d, isApproximate: true, rawExpression: text };
    }

    // 5. "this weekend" / "by the weekend" -> Saturday 12:00 PM
    if (/\b(this weekend|by the weekend)\b/i.test(clean)) {
      const d = new Date(ref);
      const currentDay = d.getDay(); // 0 is Sunday, 6 is Saturday
      const daysUntilSat = (6 - currentDay + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilSat);
      d.setHours(12, 0, 0, 0);
      return { date: d, isApproximate: true, rawExpression: text };
    }

    // 6. "next week" -> next Monday 9:00 AM
    if (/\bnext week\b/i.test(clean)) {
      const d = new Date(ref);
      const currentDay = d.getDay();
      const daysUntilNextMon = ((1 - currentDay + 7) % 7 || 7) + (currentDay === 1 ? 7 : 0);
      d.setDate(d.getDate() + daysUntilNextMon);
      d.setHours(9, 0, 0, 0);
      return { date: d, isApproximate: true, rawExpression: text };
    }

    // 7. "next month" -> 1st day of next month
    if (/\bnext month\b/i.test(clean)) {
      const d = new Date(ref);
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(9, 0, 0, 0);
      return { date: d, isApproximate: true, rawExpression: text };
    }

    // 8. "in X days" / "in X hours" / "in two days"
    const numberWords: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };

    const inDaysMatch = clean.match(/\bin\s+(a\s+|one\s+|two\s+|three\s+|four\s+|\d+\s*)days?\b/i);
    if (inDaysMatch) {
      const token = inDaysMatch[1].trim();
      const count = numberWords[token] || parseInt(token, 10) || 1;
      const d = new Date(ref);
      d.setDate(d.getDate() + count);
      d.setHours(18, 0, 0, 0);
      return { date: d, isApproximate: false, rawExpression: text };
    }

    const inHoursMatch = clean.match(/\bin\s+(\d+)\s*hours?\b/i);
    if (inHoursMatch) {
      const count = parseInt(inHoursMatch[1], 10);
      const d = new Date(ref.getTime() + count * 60 * 60 * 1000);
      return { date: d, isApproximate: false, rawExpression: text };
    }

    // 9. Named weekdays: "Friday", "this Friday", "next Monday", "by Monday", "on Wednesday"
    for (let i = 0; i < WEEKDAYS.length; i++) {
      const dayName = WEEKDAYS[i];
      const weekdayRegex = new RegExp(`\\b(this\\s+|next\\s+|by\\s+|on\\s+)?(${dayName})\\b`, 'i');
      const match = clean.match(weekdayRegex);
      if (match) {
        const isNext = (match[1] || '').trim() === 'next';
        const targetDay = i;
        const currentDay = ref.getDay();
        let diff = (targetDay - currentDay + 7) % 7;
        if (diff === 0) diff = 7; // Default to next occurrence if today is that day
        if (isNext && diff < 7) diff += 7;

        const d = new Date(ref);
        d.setDate(d.getDate() + diff);
        d.setHours(17, 0, 0, 0);
        return { date: d, isApproximate: false, rawExpression: text };
      }
    }

    // 10. "on the 30th", "by the 15th", "on May 12th"
    const dayOfMonthMatch = clean.match(/\b(?:on|by)?\s*(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
    if (dayOfMonthMatch) {
      const targetDay = parseInt(dayOfMonthMatch[1], 10);
      if (targetDay >= 1 && targetDay <= 31) {
        const d = new Date(ref);
        d.setDate(targetDay);
        // If the day has already passed in the current month, move to next month
        if (d.getTime() < ref.getTime()) {
          d.setMonth(d.getMonth() + 1);
        }
        d.setHours(17, 0, 0, 0);
        return { date: d, isApproximate: false, rawExpression: text };
      }
    }

    // 11. Standard ISO date or date parse
    const parsed = Date.parse(text);
    if (!isNaN(parsed)) {
      return { date: new Date(parsed), isApproximate: false, rawExpression: text };
    }

    return null;
  }

  /**
   * Scans a message text and extracts mentions of deadlines, dates, or time expressions.
   */
  public extractExpressions(text: string, referenceDate: Date = new Date()): { expression: string; resolvedDate: Date; index: number }[] {
    const results: { expression: string; resolvedDate: Date; index: number }[] = [];
    if (!text) return results;

    const patterns = [
      /\bby\s+(?:today|tomorrow|eod|end of day|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+\w+|\d{1,2}(?:st|nd|rd|th))\b/gi,
      /\b(?:tomorrow|today|yesterday|this weekend|next week|after lunch)\b/gi,
      /\bin\s+(?:\d+|two|three|four|five)\s+days?\b/gi,
      /\bbefore\s+(?:the\s+)?(?:meeting|weekend|monday|friday)\b/gi,
      /\bon\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th))\b/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const expression = match[0];
        const resolved = this.resolve(expression, referenceDate);
        if (resolved) {
          results.push({
            expression,
            resolvedDate: resolved.date,
            index: match.index,
          });
        }
      }
    }

    return results;
  }

  /**
   * Formats a date relative to now in human-readable terms:
   * "Today", "Tomorrow", "Friday at 5:00 PM", "Overdue by 2 days", "In 3 days"
   */
  public formatRelative(date: Date, now: Date = new Date()): string {
    const d = new Date(date);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (diffDays === 0) {
      return `Today at ${timeStr}`;
    }
    if (diffDays === 1) {
      return `Tomorrow at ${timeStr}`;
    }
    if (diffDays === -1) {
      return `Yesterday (Overdue)`;
    }
    if (diffDays < -1) {
      return `Overdue by ${Math.abs(diffDays)} days`;
    }
    if (diffDays <= 6) {
      const weekday = WEEKDAYS[d.getDay()];
      const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      return `${capitalized} at ${timeStr}`;
    }

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export const dateResolver = new DateResolver();
