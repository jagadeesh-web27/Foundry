/**
 * Date and time questions answered from the device clock.
 *
 * A language model has no clock: asked "what is the date today?" it guesses. These questions are
 * answered here, instantly and correctly, before anything reaches the model. Covered:
 * current time, date, day, month, year, time zone; tomorrow / yesterday / day after tomorrow;
 * "date in N days/weeks"; "how many days until/since <date or holiday>"; "time in <city>".
 */

export interface ClockOptions {
  now?: Date;
  /** IANA time zone used for "local" answers; defaults to the device's zone. */
  timeZone?: string;
  /** Formatting locale; defaults to the device's locale. */
  locale?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

/** Common cities -> IANA time zones for "what time is it in London". */
const CITY_ZONES: Record<string, string> = {
  india: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', mumbai: 'Asia/Kolkata', bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata', chennai: 'Asia/Kolkata', hyderabad: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', pune: 'Asia/Kolkata',
  london: 'Europe/London', uk: 'Europe/London', england: 'Europe/London', paris: 'Europe/Paris', france: 'Europe/Paris',
  berlin: 'Europe/Berlin', germany: 'Europe/Berlin', amsterdam: 'Europe/Amsterdam', madrid: 'Europe/Madrid', rome: 'Europe/Rome',
  moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul', dubai: 'Asia/Dubai', uae: 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai',
  riyadh: 'Asia/Riyadh', karachi: 'Asia/Karachi', pakistan: 'Asia/Karachi', dhaka: 'Asia/Dhaka', bangladesh: 'Asia/Dhaka',
  kathmandu: 'Asia/Kathmandu', nepal: 'Asia/Kathmandu', colombo: 'Asia/Colombo', 'sri lanka': 'Asia/Colombo',
  singapore: 'Asia/Singapore', 'kuala lumpur': 'Asia/Kuala_Lumpur', malaysia: 'Asia/Kuala_Lumpur', bangkok: 'Asia/Bangkok',
  thailand: 'Asia/Bangkok', jakarta: 'Asia/Jakarta', 'hong kong': 'Asia/Hong_Kong', beijing: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai', china: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', seoul: 'Asia/Seoul',
  korea: 'Asia/Seoul', sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', perth: 'Australia/Perth',
  auckland: 'Pacific/Auckland', 'new zealand': 'Pacific/Auckland', 'new york': 'America/New_York', nyc: 'America/New_York',
  washington: 'America/New_York', boston: 'America/New_York', toronto: 'America/Toronto', chicago: 'America/Chicago',
  texas: 'America/Chicago', dallas: 'America/Chicago', denver: 'America/Denver', 'los angeles': 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', california: 'America/Los_Angeles',
  vancouver: 'America/Vancouver', 'mexico city': 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo',
  brazil: 'America/Sao_Paulo', 'buenos aires': 'America/Argentina/Buenos_Aires', cairo: 'Africa/Cairo', egypt: 'Africa/Cairo',
  nairobi: 'Africa/Nairobi', kenya: 'Africa/Nairobi', lagos: 'Africa/Lagos', nigeria: 'Africa/Lagos',
  johannesburg: 'Africa/Johannesburg', 'south africa': 'Africa/Johannesburg', utc: 'UTC', gmt: 'UTC',
};

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function fmt(date: Date, opts: Intl.DateTimeFormatOptions, o: ClockOptions): string {
  return new Intl.DateTimeFormat(o.locale, { timeZone: o.timeZone, ...opts }).format(date);
}

const fullDate = (d: Date, o: ClockOptions) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, o);
const timeOfDay = (d: Date, o: ClockOptions) => fmt(d, { hour: 'numeric', minute: '2-digit', hour12: true }, o);

function zoneName(d: Date, o: ClockOptions, style: 'long' | 'shortOffset'): string {
  const part = new Intl.DateTimeFormat(o.locale ?? 'en-US', { timeZone: o.timeZone, timeZoneName: style })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? '';
}

/** Calendar date (year, month, day) of `d` in the answer's time zone, as a UTC-midnight timestamp. */
function calendarDay(d: Date, o: ClockOptions): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: o.timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'));
}

/** A UTC-midnight timestamp, formatted as a full date (no time-zone shift). */
const fullDateOfDay = (dayMs: number, o: ClockOptions) => fullDate(new Date(dayMs), { ...o, timeZone: 'UTC' });

function parseTargetDate(text: string, todayMs: number, past = false): { day: number; label?: string } | null {
  const today = new Date(todayMs);
  const year = today.getUTCFullYear();
  // Without a year: the next occurrence for "until", the most recent one for "since".
  const nextOccurrence = (month: number, day: number) => {
    let t = Date.UTC(year, month, day);
    if (!past && t < todayMs) t = Date.UTC(year + 1, month, day);
    if (past && t > todayMs) t = Date.UTC(year - 1, month, day);
    return t;
  };
  if (/\bchristmas\b|\bxmas\b/.test(text)) return { day: nextOccurrence(11, 25), label: 'Christmas' };
  if (/\bnew year'?s eve\b/.test(text)) return { day: nextOccurrence(11, 31), label: "New Year's Eve" };
  if (/\bnew year'?s?( day)?\b/.test(text)) return { day: past ? Date.UTC(year, 0, 1) : Date.UTC(year + 1, 0, 1), label: "New Year's Day" };

  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return { day: Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) };

  const dayFirst = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:\\s+(\\d{4}))?\\b`));
  const monthFirst = text.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  const m = dayFirst
    ? { month: dayFirst[2], day: dayFirst[1], year: dayFirst[3] }
    : monthFirst
      ? { month: monthFirst[1], day: monthFirst[2], year: monthFirst[3] }
      : null;
  if (!m) return null;
  const monthIndex = MONTHS.findIndex((name) => name.startsWith(m.month.slice(0, 3)));
  if (monthIndex < 0) return null;
  const day = Number(m.day);
  return { day: m.year ? Date.UTC(Number(m.year), monthIndex, day) : nextOccurrence(monthIndex, day) };
}

/**
 * Answer a date/time question, or return null when the text is not one.
 * Questions about meetings, schedules, files or durations ("time complexity") are left alone.
 */
export function answerClockQuestion(input: string, options: ClockOptions = {}): string | null {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^(hey |hi |ok |okay )?(foundry,? )?/, '')
    .replace(/^(please |can you |could you |pls )+/, '')
    .replace(/[\s.!?]+$/, '');
  if (!text) return null;
  // Not about the clock: schedules, files, technical terms.
  if (/\b(meeting|event|appointment|flight|train|bus|deadline|reminder|alarm|file|files|folder|document|complexity|travel time|time limit)\b/.test(text)) {
    return null;
  }
  const o: ClockOptions = { ...options, timeZone: options.timeZone ?? deviceZone() };
  const now = o.now ?? new Date();
  const today = calendarDay(now, o);

  // Time somewhere else: "what time is it in London", "current time in Tokyo"
  // Anchored at the start so "spend time in nature" is not read as a city question.
  const cityMatch = text.match(/^(?:what(?:'s| is)? (?:the )?(?:current |local )?time(?: is it)?|what time is it|tell me the (?:current )?time|(?:current |local )?time)(?: right now| now)? (?:in|at) ([a-z .]+?)(?: right now| now)?$/);
  if (cityMatch) {
    const place = cityMatch[1].trim().replace(/^the /, '');
    const zone = CITY_ZONES[place];
    if (!zone) return `I don't have the time zone for "${place}" yet. I can tell you the time in major cities such as London, New York, Dubai, Singapore or Tokyo.`;
    const there = { ...o, timeZone: zone };
    return `In ${place.replace(/\b\w/g, (c) => c.toUpperCase())} it's **${timeOfDay(now, there)}** on ${fmt(now, { weekday: 'long', day: 'numeric', month: 'long' }, there)} (${zoneName(now, there, 'shortOffset')}).`;
  }

  // Time zone
  if (/^(?:what(?:'s| is)? )?(?:my|the|this device'?s?|current|local|our) (?:current )?time ?zone(?: here| now)?$|^time ?zone$|\bwhich time ?zone (?:am i|are we|is this)\b|\bwhat time ?zone is (?:it|this)\b/.test(text)) {
    return `This device is set to **${zoneName(now, o, 'long')}** (${o.timeZone}, ${zoneName(now, o, 'shortOffset')}).`;
  }

  // Days until / since a date
  const until = text.match(/\b(?:how many )?days? (?:left )?(?:until|till|til|to go (?:until|till)|before|to) (.+)$/) || text.match(/\bhow (?:long|many days) (?:until|till|is it (?:until|till|to)) (.+)$/);
  const since = text.match(/\b(?:how many )?days? (?:since|after|have passed since) (.+)$/);
  if (until || since) {
    const target = parseTargetDate((until ?? since)![1], today, !until);
    if (target) {
      const diff = Math.round((target.day - today) / DAY_MS);
      const when = target.label ? `${target.label} (${fullDateOfDay(target.day, o)})` : fullDateOfDay(target.day, o);
      if (diff === 0) return `That's **today**: ${when}.`;
      if (diff > 0) return `**${diff} ${diff === 1 ? 'day' : 'days'}** until ${when}.`;
      return `${when} was **${-diff} ${diff === -1 ? 'day' : 'days'} ago**.`;
    }
  }

  // Date N days/weeks from now or ago
  const offset = text.match(/\b(\d{1,4}) (day|days|week|weeks) (from (?:now|today)|later|after today|ago|before today|back)\b/)
    || text.match(/\b(?:date |day )?(?:after|in) (\d{1,4}) (day|days|week|weeks)\b/);
  if (offset) {
    const n = Number(offset[1]) * (offset[2].startsWith('week') ? 7 : 1);
    const past = /\b(ago|before today|back)\b/.test(offset[0]);
    const day = today + (past ? -n : n) * DAY_MS;
    return `${offset[1]} ${offset[2]} ${past ? 'ago it was' : 'from today is'} **${fullDateOfDay(day, o)}**.`;
  }

  // "What day is Christmas", "what date was 15 August 1947", "when is new year"
  const dayOf = text.match(/\b(?:what|which) (?:day|date)(?: of the week)? (?:is|was|will be|falls on|does) (.+?)(?: fall on| fall)?$/)
    || text.match(/\bwhen is (.+)$/);
  if (dayOf) {
    const target = parseTargetDate(dayOf[1], today, /\bwas\b/.test(text));
    if (target) {
      const diff = Math.round((target.day - today) / DAY_MS);
      const relative = diff === 0 ? 'today' : diff > 0 ? `in ${diff} ${diff === 1 ? 'day' : 'days'}` : `${-diff} ${diff === -1 ? 'day' : 'days'} ago`;
      const name = target.label ? `**${target.label}** is on` : 'That is';
      return `${name} **${fullDateOfDay(target.day, o)}** (${relative}).`;
    }
  }

  // Relative days
  const asksDate = /\b(date|day|what day|which day)\b/.test(text);
  if (asksDate && /\bday after tomorrow\b/.test(text)) return `The day after tomorrow is **${fullDateOfDay(today + 2 * DAY_MS, o)}**.`;
  if (asksDate && /\bday before yesterday\b/.test(text)) return `The day before yesterday was **${fullDateOfDay(today - 2 * DAY_MS, o)}**.`;
  if (asksDate && /\btomorrow\b/.test(text)) return `Tomorrow is **${fullDateOfDay(today + DAY_MS, o)}**.`;
  if (asksDate && /\byesterday\b/.test(text)) return `Yesterday was **${fullDateOfDay(today - DAY_MS, o)}**.`;

  // Patterns are anchored so "what time is sunset", "which month has 31 days" or "the date of Diwali"
  // are not answered with the current time or date.
  const asksTime = /\b(what('s| is) (the )?(current |exact )?time( now| right now| today| please)?$|what time is it|time (is it|now|right now)\b|current time|tell me the time|time please|time it is)/.test(text)
    || /^(what )?time$/.test(text);
  const asksToday = /\b(today'?s date|date today|date (is it|now|right now)\b|current date|tell me the date|what('s| is) (the |today'?s )?date( today| now| right now| please)?$|what date is (it|today))/.test(text)
    || /^date$/.test(text);
  const asksDay = /\b(what|which) day (is (it|today)|today)\b|\bday (is it|of the week is it)\b|\bwhat('s| is) (the )?day( today| now)?$|^(what|which) day$/.test(text);
  const asksMonth = /\bwhat month is (it|this)\b|\b(what|which) month are we in\b|\bwhat('s| is) (the )?(current|present) month\b|^(what|which|current|this) month( now)?$/.test(text);
  const asksYear = /\bwhat year is (it|this)\b|\b(what|which) year are we in\b|\bwhat('s| is) (the )?(current|present) year\b|^(what|which|current|this) year( now)?$/.test(text);

  if (asksTime && (asksToday || asksDay)) {
    return `It's **${timeOfDay(now, o)}** on **${fullDate(now, o)}**.`;
  }
  if (asksTime) return `It's **${timeOfDay(now, o)}** (${fullDate(now, o)}, ${zoneName(now, o, 'long')}).`;
  if (asksToday) return `Today is **${fullDate(now, o)}**.`;
  if (asksDay) return `Today is **${fmt(now, { weekday: 'long' }, o)}**, ${fmt(now, { day: 'numeric', month: 'long', year: 'numeric' }, o)}.`;
  if (asksMonth) return `It's **${fmt(now, { month: 'long', year: 'numeric' }, o)}**.`;
  if (asksYear) return `It's **${fmt(now, { year: 'numeric' }, o)}**.`;
  return null;
}

/** Current date/time context for AI prompts, so general answers that depend on "now" are grounded. */
export function clockContext(options: ClockOptions = {}): string {
  const o: ClockOptions = { ...options, timeZone: options.timeZone ?? deviceZone() };
  const now = o.now ?? new Date();
  return `Current date and time on this device: ${fullDate(now, o)}, ${timeOfDay(now, o)} (${zoneName(now, o, 'long')}).`;
}
