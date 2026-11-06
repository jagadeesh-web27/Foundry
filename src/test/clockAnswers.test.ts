import { describe, it, expect } from 'vitest';
import { answerClockQuestion, clockContext } from '@/services/agent/clockAnswers';

// Thursday 5 November 2026, 23:28 in India (17:58 UTC)
const now = new Date(Date.UTC(2026, 10, 5, 17, 58));
const o = { now, timeZone: 'Asia/Kolkata', locale: 'en-GB' };
const ask = (q: string) => answerClockQuestion(q, o);

describe('date and time answers come from the device clock', () => {
  it.each([
    ['what is the time now', /11:28 pm/i],
    ['what time is it?', /11:28 pm/i],
    ['current time', /11:28 pm/i],
    ['tell me the time', /11:28 pm/i],
    ['time?', /11:28 pm/i],
  ])('time: "%s"', (q, re) => {
    expect(ask(q)).toMatch(re);
  });

  it.each([
    ['what is the date today', /Thursday,? 5 November 2026/],
    ["what's today's date?", /Thursday,? 5 November 2026/],
    ['what date is it', /Thursday,? 5 November 2026/],
    ['current date', /Thursday,? 5 November 2026/],
  ])('date: "%s"', (q, expected) => {
    expect(ask(q)).toMatch(expected);
  });

  it('day, month, year, both date and time', () => {
    expect(ask('what day is it today')).toContain('**Thursday**');
    expect(ask('which day is today')).toContain('Thursday');
    expect(ask('what month is it')).toContain('November 2026');
    expect(ask('what is the current year')).toContain('2026');
    const both = ask('what is the date and time now')!;
    expect(both).toContain('11:28 pm');
    expect(both).toContain('5 November 2026');
  });

  it('relative days use the local calendar date (late evening in India is already the next UTC day boundary-safe)', () => {
    expect(ask("what is tomorrow's date")).toMatch(/Friday,? 6 November 2026/);
    expect(ask('what was the date yesterday')).toMatch(/Wednesday,? 4 November 2026/);
    expect(ask('what day is the day after tomorrow')).toMatch(/Saturday,? 7 November 2026/);
    expect(ask('what is the date after 10 days')).toMatch(/Sunday,? 15 November 2026/);
    expect(ask('2 weeks from now')).toMatch(/Thursday,? 19 November 2026/);
    expect(ask('what was the date 30 days ago')).toMatch(/Tuesday,? 6 October 2026/);
  });

  it('days until / since dates and holidays', () => {
    expect(ask('how many days until christmas')).toMatch(/\*\*50 days\*\* until Christmas \(Friday,? 25 December 2026\)/);
    expect(ask('how many days until 1 january 2027')).toContain('**57 days**');
    expect(ask('days left until december 31')).toContain('**56 days**');
    expect(ask('how many days since 15 august')).toMatch(/82 days ago/);
    expect(ask('days until 5 november')).toContain('today');
  });

  it('time zone and other cities', () => {
    expect(ask('what is my time zone')).toMatch(/India Standard Time.*Asia\/Kolkata.*GMT\+5:30/);
    expect(ask('what time is it in London')).toMatch(/In London it's \*\*5:58 pm\*\*/i);
    expect(ask('time in new york')).toMatch(/In New York it's \*\*12:58 pm\*\*/i);
    expect(ask('what time is it in Atlantis')).toMatch(/don't have the time zone for "atlantis"/);
  });

  it('answers what day or date a given date or holiday falls on', () => {
    expect(ask('what day is christmas')).toMatch(/\*\*Christmas\*\* is on \*\*Friday,? 25 December 2026\*\* \(in 50 days\)/);
    expect(ask('when is new year')).toMatch(/New Year's Day\*\* is on \*\*Friday,? 1 January 2027/);
    expect(ask('when is new years eve')).toMatch(/New Year's Eve\*\* is on \*\*Thursday,? 31 December 2026/);
    expect(ask('what day was 15 august 1947')).toMatch(/Friday,? 15 August 1947/);
    expect(ask('what day of the week is 26 january 2027')).toMatch(/Tuesday,? 26 January 2027/);
  });

  it('understands polite, spoken and punctuated forms', () => {
    expect(ask('Hey Foundry, what is the time now?')).toMatch(/11:28 pm/i);
    expect(ask('Can you tell me the date.')).toMatch(/Thursday,? 5 November 2026/);
    expect(ask('WHAT DAY IS IT TODAY!')).toContain('Thursday');
    expect(ask("what's the time in Dubai")).toMatch(/In Dubai it's \*\*9:58 pm\*\*/i);
  });

  it('leaves non-clock questions alone', () => {
    for (const q of [
      'what time is sunset',
      'what time does the shop open',
      'which month has 31 days',
      'what is the date of diwali this year',
      'how many days are in this month',
      'how to spend time in nature',
      'convert the time zone of a date in python',
      'when is my birthday',
      'what day is my exam',
      'what year did india get independence',
      'what is React?',
      'what is the time complexity of quicksort',
      'what time is my meeting tomorrow',
      'show files I added today',
      'find files modified yesterday',
      'explain time zones in javascript dates',
      'how much storage is left',
    ]) {
      expect(ask(q), q).toBeNull();
    }
  });

  it('gives the AI the current date for general questions', () => {
    expect(clockContext(o)).toMatch(/Thursday,? 5 November 2026, 11:28 pm/);
  });
});
