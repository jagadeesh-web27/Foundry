import { describe, it, expect } from 'vitest';
import { routeQuery, extractQuery, normalizeInput, looksLikeGeneralKnowledge } from '@/services/agent/directRouter';
import { DynamicAgent } from '@/services/agent/dynamicAgent';

describe('directRouter: device and file questions are routed to real tools', () => {
  it('routes the exact failing message "give me my resme" to a resume search', () => {
    const route = routeQuery('give me my resme');
    expect(route).toMatchObject({ kind: 'search', args: { query: 'resume' } });
  });

  it.each([
    ['give me my resume', 'resume'],
    ['find my resume', 'resume'],
    ['where is my CV', 'resume'],
    ['Find my offer letter', 'offer letter'],
  ])('searches files for "%s"', (input, query) => {
    const route = routeQuery(input);
    expect(route?.kind).toBe('search');
    expect((route as any).args.query).toBe(query);
  });

  it('maps file types to the right filter', () => {
    expect((routeQuery('find my pdf files') as any).args.extension).toBe('pdf');
    expect((routeQuery('find my word documents') as any).args.extension).toBe('docx');
    expect((routeQuery('show my excel files') as any).args.extension).toBe('xlsx');
    expect((routeQuery('show my photos') as any).args.fileTypes).toEqual(['Image']);
    expect((routeQuery('find my videos') as any).args.fileTypes).toEqual(['Video']);
  });

  it('routes counts to countFiles', () => {
    const route = routeQuery('How many PDF files do I have?');
    expect(route).toMatchObject({ kind: 'count', args: { extension: 'pdf' } });
  });

  it('routes read / summarize requests', () => {
    expect(routeQuery('read my resume')?.kind).toBe('read');
    expect(routeQuery('summarize my resume')?.kind).toBe('read');
  });

  it.each([
    ['what is my battery level', 'battery'],
    ['is my laptop charging', 'battery'],
    ['what is my wifi network', 'network'],
    ['how much storage is left', 'disk'],
    ['what are my laptop specs', 'system'],
    ['how much ram do i have', 'system'],
  ])('routes device question "%s" to %s', (input, kind) => {
    expect(routeQuery(input)?.kind).toBe(kind);
  });

  it('routes application launches and folders', () => {
    expect(routeQuery('open chrome')).toEqual({ kind: 'open_app', application: 'chrome' });
    expect(routeQuery('find the Teams folder')).toMatchObject({ kind: 'folders', nameQuery: 'teams' });
  });

  it('does not route open-ended or general questions', () => {
    expect(routeQuery('What is React?')).toBeNull();
    expect(routeQuery('write a poem about the sea')).toBeNull();
    expect(routeQuery('what is the capital of France')).toBeNull();
    expect(routeQuery('start a conversation with me')).toBeNull();
  });

  it('routes personal document requests with no file word ("give me my adhar")', () => {
    expect(routeQuery('give me my adhar')).toMatchObject({ kind: 'search', args: { query: 'adhar' } });
    expect(routeQuery('where is my passport')).toMatchObject({ kind: 'search', args: { query: 'passport' } });
    expect(routeQuery('find my pan card')).toMatchObject({ kind: 'search', args: { query: 'pan card' } });
  });

  it('keeps general knowledge questions away from the router', () => {
    expect(looksLikeGeneralKnowledge('what is ram')).toBe(true);
    expect(looksLikeGeneralKnowledge('explain how wifi works')).toBe(true);
    expect(looksLikeGeneralKnowledge('give me my adhar')).toBe(false);
    expect(looksLikeGeneralKnowledge('what is my battery level')).toBe(false);
    expect(looksLikeGeneralKnowledge('what files do i have')).toBe(false);
  });

  it('extractQuery drops filler and fixes typos', () => {
    expect(extractQuery('give me my resme please')).toBe('resume');
    expect(extractQuery('find the quarterly sales report')).toBe('quarterly sales report');
  });

  it('general questions are still classified as general by the agent (never routed)', () => {
    const agent = new DynamicAgent();
    expect(agent.classifyIntent('What is React?')).toBe('general');
    expect(agent.classifyIntent(normalizeInput('give me my resme'))).not.toBe('general');
    expect(normalizeInput('give me my resme')).toBe('give me my resume');
  });
});
