import { describe, it, expect } from 'vitest';
import { planQuery } from '@/services/agent/queryPlanner';

describe('queryPlanner: device intents', () => {
  it.each([
    'what is my battery level',
    'is my laptop charging',
    'what is my wifi network',
    'how much storage is left',
    'what are my laptop specs',
    'how much ram do i have',
    'how much free space do I have',
    'what is my cpu',
  ])('classifies "%s" as device', (input) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('device');
    expect(plan.confidence).toBeGreaterThan(0.5);
  });
});

describe('queryPlanner: open intents', () => {
  it.each([
    ['open chrome', 'chrome'],
    ['launch notepad', 'notepad'],
    ['start calculator', 'calculator'],
    ['please open vs code', 'vs code'],
    ['can you open spotify', 'spotify'],
  ])('classifies "%s" as open with applicationName %s', (input, app) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('open');
    expect(plan.applicationName).toBe(app);
    expect(plan.requiresConfirmation).toBe(true);
  });
});

describe('queryPlanner: find intents across file types and verbs', () => {
  const verbs = ['find', 'show', 'get'];
  const types: [string, string][] = [
    ['pdf files', 'pdf'],
    ['word documents', 'docx'],
    ['excel files', 'xlsx'],
    ['photos', 'Image'],
    ['videos', 'Video'],
  ];
  for (const verb of verbs) {
    for (const [noun, expected] of types) {
      it(`"${verb} my ${noun}" is a find with the right file type`, () => {
        const plan = planQuery(`${verb} my ${noun}`);
        expect(plan.intent).toBe('find');
        expect(plan.fileFilters?.extensions).toContain(expected);
      });
    }
  }

  it.each([
    ['find my resume', 'resume'],
    ['where is my passport', 'passport'],
    ['find my offer letter', 'offer letter'],
    ['give me my adhar', 'adhar'],
  ])('finds a named personal item: "%s"', (input, query) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('find');
    expect(plan.fileFilters?.nameQuery).toBe(query);
  });

  it.each([
    'find the Teams folder',
    'show me the Projects folder',
    'where is the Downloads folder',
    'find my Documents directory',
  ])('classifies "%s" as a folder-scoped find', (input) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('find');
    expect(plan.fileFilters?.scope).toBe('folder');
  });
});

describe('queryPlanner: content-intent maps to contentQuery', () => {
  it.each([
    ['find documents related to React development', 'react development'],
    ['find files mentioning invoice', 'invoice'],
    ['find files about the budget', 'budget'],
  ])('"%s" uses contentQuery', (input) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('find');
    expect(plan.fileFilters?.contentQuery).toBeTruthy();
    expect(plan.fileFilters?.nameQuery).toBeUndefined();
  });

  it('naming a thing (no content words) uses nameQuery, not contentQuery', () => {
    const plan = planQuery('find my passport');
    expect(plan.fileFilters?.contentQuery).toBeUndefined();
    expect(plan.fileFilters?.nameQuery).toBe('passport');
  });
});

describe('queryPlanner: count intents', () => {
  it.each([
    ['how many pdf files do I have', 'pdf'],
    ['how many word documents do I have', 'docx'],
    ['how many excel files do I have', 'xlsx'],
    ['count my photos', 'Image'],
    ['how many videos do I have', 'Video'],
  ])('"%s" is a count', (input, expected) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('count');
    expect(plan.fileFilters?.extensions).toContain(expected);
  });

  it('how many pdfs did I download this week is a count with a date range', () => {
    const plan = planQuery('how many pdfs did I download this week');
    expect(plan.intent).toBe('count');
    expect(plan.fileFilters?.dateRange).toBeDefined();
  });
});

describe('queryPlanner: read vs summarize', () => {
  it.each([
    'read my resume',
    'read the offer letter',
    "what's in my resume",
  ])('"%s" is a plain read', (input) => {
    expect(planQuery(input).intent).toBe('read');
  });

  it.each([
    'summarize my resume',
    'summarise the report',
    'give me a summary of my notes',
  ])('"%s" is a summarize', (input) => {
    expect(planQuery(input).intent).toBe('summarize');
  });
});

describe('queryPlanner: recent vs find', () => {
  it.each([
    'show files I added today',
    'what did I download yesterday',
    'files modified this week',
    'what have I saved recently',
  ])('"%s" with no name/type filter is recent', (input) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('recent');
    expect(plan.fileFilters?.dateRange).toBeDefined();
  });

  it('a typed + dated query is still find, not recent', () => {
    const plan = planQuery('find my pdf files from today');
    expect(plan.intent).toBe('find');
  });
});

describe('queryPlanner: date/time intent', () => {
  it.each([
    'what time is it',
    'what is the date today',
    'what day is it',
    'what day is tomorrow',
    'what time is it in Tokyo',
    'how many days until christmas',
    'what is the time zone here',
  ])('"%s" is date_time', (input) => {
    expect(planQuery(input).intent).toBe('date_time');
  });
});

describe('queryPlanner: compare and relate', () => {
  it.each([
    'compare my resume with my cover letter',
    'what is the difference between plan A and plan B',
    'compare these two pdfs',
  ])('"%s" is compare', (input) => {
    expect(planQuery(input).intent).toBe('compare');
  });

  it.each([
    'how is the invoice related to the contract',
    "what's the connection between these two files",
    'how does the budget link to the proposal',
  ])('"%s" is relate', (input) => {
    expect(planQuery(input).intent).toBe('relate');
  });

  it('extracts compare targets when named', () => {
    const plan = planQuery('compare my resume with my cover letter');
    expect(plan.compareTargets).toBeDefined();
    expect(plan.compareTargets?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('queryPlanner: general knowledge', () => {
  it.each([
    'What is React?',
    'what is the capital of France',
    'explain how wifi works',
    'who is the prime minister of india',
    'why is the sky blue',
    'how does photosynthesis work',
    'write a poem about the sea',
    'translate hello to spanish',
    'define serendipity',
    'what is RAM',
    'tell me about black holes',
    'how to bake a cake',
  ])('"%s" is general', (input) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('general');
    expect(plan.confidence).toBeGreaterThan(0.5);
  });

  it.each([
    'start a conversation with me',
    'hello there',
  ])('"%s" is a low-confidence general fallback, not misrouted', (input) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('general');
  });
});

describe('queryPlanner: wider find/count coverage (more file types and phrasings)', () => {
  const moreTypes: [string, string][] = [
    ['csv files', 'csv'],
    ['powerpoint files', 'Presentation'],
    ['presentations', 'Presentation'],
    ['spreadsheets', 'Spreadsheet'],
    ['music files', 'Audio'],
    ['audio files', 'Audio'],
    ['screenshots', 'Image'],
    ['recordings', 'Video'],
  ];
  for (const [noun, expected] of moreTypes) {
    it(`"find my ${noun}" resolves the right type`, () => {
      const plan = planQuery(`find my ${noun}`);
      expect(plan.intent).toBe('find');
      expect(plan.fileFilters?.extensions).toContain(expected);
    });
    it(`"how many ${noun} do I have" is a count of the right type`, () => {
      const plan = planQuery(`how many ${noun} do I have`);
      expect(plan.intent).toBe('count');
      expect(plan.fileFilters?.extensions).toContain(expected);
    });
    it(`"list my ${noun}" is a find`, () => {
      expect(planQuery(`list my ${noun}`).intent).toBe('find');
    });
  }

  it.each([
    'show me large videos',
    'find my CV',
    'where are my invoices',
    'find my reports',
    'show my notes',
    'locate my pan card',
    'find the quarterly sales report',
    'search for my tax documents',
  ])('"%s" is still a find', (input) => {
    expect(planQuery(input).intent).toBe('find');
  });
});

describe('queryPlanner: wider recent/date phrasing coverage', () => {
  it.each([
    'what did I download today',
    'what files changed yesterday',
    'what have I edited this week',
    'what files have I downloaded last week',
    'show me the newest files',
    'show me the latest files',
  ])('"%s" is recent', (input) => {
    expect(planQuery(input).intent).toBe('recent');
  });

  it.each([
    'what time is it right now',
    'what is todays date',
    "what's the date",
    'what month is it',
    'what year is it',
    'what time is it in london',
    'what time is it in dubai',
    'how many days since 15 august',
    'what day of the week is it',
  ])('"%s" is date_time (wider set)', (input) => {
    expect(planQuery(input).intent).toBe('date_time');
  });
});

describe('queryPlanner: wider device phrasing coverage', () => {
  it.each([
    'is my battery charging',
    'battery percentage',
    'my wifi signal',
    'am I connected to the internet',
    'free disk space',
    'my system info',
    'operating system version',
    'how many cpu cores do I have',
  ])('"%s" is device', (input) => {
    expect(planQuery(input).intent).toBe('device');
  });
});

describe('queryPlanner: wider compare/relate coverage', () => {
  it.each([
    'compare the invoice and the receipt',
    'difference between the two resumes',
    'compare version 1 with version 2',
    'compare budget.xlsx and forecast.xlsx',
  ])('"%s" is compare', (input) => {
    expect(planQuery(input).intent).toBe('compare');
  });

  it.each([
    'how are these two documents related',
    'relationship between the contract and the invoice',
    'is the report connected to the proposal',
  ])('"%s" is relate', (input) => {
    expect(planQuery(input).intent).toBe('relate');
  });
});

describe('queryPlanner: wider general-knowledge coverage', () => {
  it.each([
    'what is the speed of light',
    'who wrote hamlet',
    'how do airplanes fly',
    'what causes rain',
    'explain quantum computing',
    'what is the tallest mountain in the world',
    'how do vaccines work',
    'what is machine learning',
    'who was albert einstein',
    'why do we dream',
    'what is the meaning of life',
    'convert 10 miles to kilometers',
    'write a haiku about autumn',
    'code a function to reverse a string',
    'what language is spoken in brazil',
  ])('"%s" is general', (input) => {
    expect(planQuery(input).intent).toBe('general');
  });
});

describe('queryPlanner: wider open-app coverage', () => {
  it.each([
    ['run firefox', 'firefox'],
    ['open visual studio', 'visual studio'],
    ['start the task manager', 'task manager'],
    ['launch paint', 'paint'],
  ])('"%s" opens %s', (input, app) => {
    const plan = planQuery(input);
    expect(plan.intent).toBe('open');
    expect(plan.applicationName).toBe(app);
  });
});

describe('queryPlanner: wider read/summarize coverage', () => {
  it.each([
    'read my offer letter',
    'read the contract',
    'what does my resume say',
  ])('"%s" is read', (input) => {
    expect(planQuery(input).intent).toBe('read');
  });

  it.each([
    'summarize the contract',
    'summarize my notes',
    'give me a summary of the report',
  ])('"%s" is summarize', (input) => {
    expect(planQuery(input).intent).toBe('summarize');
  });
});

describe('queryPlanner: plan shape', () => {
  it('always returns the raw query and a confidence in [0, 1]', () => {
    for (const input of ['find my resume', 'what time is it', 'hello', '']) {
      const plan = planQuery(input);
      expect(plan.rawQuery).toBe(input);
      expect(plan.confidence).toBeGreaterThanOrEqual(0);
      expect(plan.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('empty input is general with zero confidence', () => {
    const plan = planQuery('');
    expect(plan.intent).toBe('general');
    expect(plan.confidence).toBe(0);
  });
});
