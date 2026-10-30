import React from 'react';

/**
 * Minimal, safe markdown for chat answers: paragraphs, line breaks, headings, bullet and numbered
 * lists, fenced code blocks, and inline **bold**, *italic* and `code`.
 * Builds React elements directly (no HTML injection), so model output can never inject markup.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Emphasis markers only count at word boundaries, so file names and identifiers such as
  // my_resume_2026.pdf, PHYSICAL_RESUME_MARKER or 2*3*4 are left untouched.
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|(?<![\w*])\*[^*\s][^*\n]*?\*(?![\w*])|(?<!\w)_[^_\s][^_\n]*?_(?!\w))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) nodes.push(<code key={key} className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)] font-mono text-[0.92em]">{token.slice(1, -1)}</code>);
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function withBreaks(lines: string[], keyPrefix: string): React.ReactNode[] {
  return lines.flatMap((line, idx) => {
    const parts = renderInline(line, `${keyPrefix}-${idx}`);
    return idx < lines.length - 1 ? [...parts, <br key={`${keyPrefix}-br-${idx}`} />] : parts;
  });
}

export const MarkdownText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre key={k++} className="overflow-x-auto rounded-lg bg-[var(--bg-tertiary)] p-3 font-mono text-[0.9em] leading-snug whitespace-pre">
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^\s*(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const size = level === 1 ? 'text-base' : level === 2 ? 'text-[1.05em]' : 'text-[1em]';
      blocks.push(<p key={k++} className={`${size} font-semibold`}>{renderInline(heading[2], `h${k}`)}</p>);
      i++;
      continue;
    }

    if (/^\s*([-*•])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•])\s+/, ''));
      blocks.push(
        <ul key={k++} className="list-disc pl-5 space-y-1">
          {items.map((it, j) => <li key={j}>{renderInline(it, `ul${k}-${j}`)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(
        <ol key={k++} className="list-decimal pl-5 space-y-1">
          {items.map((it, j) => <li key={j}>{renderInline(it, `ol${k}-${j}`)}</li>)}
        </ol>,
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph: consecutive non-special lines, keeping single line breaks.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*#{1,4}\s+/.test(lines[i]) &&
      !/^\s*([-*•])\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push(<p key={k++}>{withBreaks(para, `p${k}`)}</p>);
  }

  return <div className={`space-y-2 break-words ${className || ''}`}>{blocks}</div>;
};
