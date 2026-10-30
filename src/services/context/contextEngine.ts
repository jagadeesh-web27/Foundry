/**
 * Foundry Context Engine
 * Compiles minimal, relevant, and privacy-conscious system and user context for the AI Agent.
 * Enforces least-privilege data minimization: only injects what is needed for the active query.
 */

import { memoryEngine } from '@/services/memory/memoryEngine';
import { db } from '@/services/db/database';

export type AssistantMode = 'normal' | 'developer' | 'accessibility';

export interface ContextOptions {
  mode?: AssistantMode;
  workspacePath?: string;
  userQuery?: string;
}

export class ContextEngine {
  private activeMode: AssistantMode = 'normal';
  private activeWorkspace: string = 'd:\\Foundry';

  public setMode(mode: AssistantMode): void {
    this.activeMode = mode;
  }

  public getMode(): AssistantMode {
    return this.activeMode;
  }

  public setWorkspace(path: string): void {
    this.activeWorkspace = path;
  }

  public getWorkspace(): string {
    return this.activeWorkspace;
  }

  /**
   * Build minimal, privacy-compliant system context for the prompt
   */
  public async buildContext(options?: ContextOptions): Promise<string> {
    const mode = options?.mode || this.activeMode;
    const workspace = options?.workspacePath || this.activeWorkspace;
    const query = options?.userQuery || '';

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = now.toLocaleTimeString('en-US');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isoDate = now.toISOString().slice(0, 10);

    const sections: string[] = [];

    // 1. Identity & System Foundation
    sections.push(`You are Foundry, an intelligent personal AI assistant that operates seamlessly with the user's computer and personal workflows.`);
    sections.push(`CURRENT SYSTEM CONTEXT:
- Today's Date: ${formattedDate} (${isoDate})
- Current Time: ${formattedTime}
- Timezone: ${timezone}
- Active Workspace: ${workspace}
- Operating Mode: ${mode.toUpperCase()}`);

    // 2. Mode-Specific Guidance
    if (mode === 'developer') {
      sections.push(`DEVELOPER MODE ACTIVE:
- Provide technical precision, architecture insights, and code-level diagnostics.
- When inspecting errors, trace dependencies, package configurations, and runtime ports.`);
    } else if (mode === 'accessibility') {
      sections.push(`ACCESSIBILITY MODE ACTIVE:
- Evaluate designs against WCAG 2.2 AA / AAA standards.
- Focus on accessible names, color contrast ratios, keyboard navigability, and screen-reader semantics.`);
    }

    // 3. Relevant Recalled Memories (Data Minimization)
    if (query) {
      try {
        const memContext = await memoryEngine.getRelevantContext(query);
        if (memContext) {
          sections.push(memContext);
        }
      } catch (e) {
        console.warn('[ContextEngine] Failed to recall memories:', e);
      }

      // 4. Relevant Active Tasks Summary
      try {
        const todoTasks = await db.getTasks('todo');
        if (todoTasks.length > 0) {
          const highPriority = todoTasks.filter((t) => t.priority === 'high');
          const taskSummary = highPriority.length > 0 ? highPriority : todoTasks.slice(0, 3);
          sections.push(
            `ACTIVE TASKS:\n${taskSummary.map((t) => `- [${t.priority.toUpperCase()}] ${t.title}${t.dueDate ? ` (Due: ${t.dueDate})` : ''}`).join('\n')}`
          );
        }
      } catch {}
    }

    // 5. Source-of-Truth Enforcement
    sections.push(`GROUNDING & INTEGRITY RULES:
1. NEVER fabricate files, sizes, dates, hardware specs, network states, or running applications. If data is unavailable, state so clearly.
2. For general knowledge (e.g. "What is React?"), answer directly using your intelligence without device tools.
3. For device questions (hardware, network, files, apps, tasks), dynamically call the appropriate verified tool.
4. ACTION tools (e.g. launching an application) require explicit user confirmation.
5. Tool calls are internal: NEVER output raw tool JSON to the user.`);

    return sections.join('\n\n');
  }
}

export const contextEngine = new ContextEngine();
