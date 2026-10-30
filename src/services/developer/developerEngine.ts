/**
 * Foundry Developer Mode Engine
 * Provides software project inspection, build error diagnostics, and development environment auditing.
 */

import { computerService } from '@/services/native/computerService';

export interface ProjectInspectionResult {
  projectPath: string;
  projectType: string;
  filesFound: string[];
  manifest?: Record<string, any>;
  hasGit: boolean;
}

export interface BuildErrorDiagnosis {
  errorType: string;
  rootCause: string;
  suggestedFix: string;
  relevantFiles: string[];
}

export class DeveloperEngine {
  /**
   * Inspect a project folder for manifest files (package.json, Cargo.toml), structure, and tech stack
   */
  async inspectProject(dirPath: string = 'd:\\Foundry'): Promise<ProjectInspectionResult> {
    const files = await computerService.searchFilesLive({
      scopePath: dirPath,
      limit: 50,
    });

    const fileNames = files.map((f) => f.name.toLowerCase());
    let projectType = 'Generic Project';

    if (fileNames.includes('cargo.toml')) {
      projectType = fileNames.includes('package.json') ? 'Tauri (Rust + React/TypeScript)' : 'Rust';
    } else if (fileNames.includes('package.json')) {
      projectType = fileNames.includes('next.config.js') || fileNames.includes('next.config.ts') ? 'Next.js' : 'React / Node.js';
    } else if (fileNames.includes('pyproject.toml') || fileNames.includes('requirements.txt')) {
      projectType = 'Python';
    }

    let manifest: Record<string, any> | undefined = undefined;
    const pkgFile = files.find((f) => f.name.toLowerCase() === 'package.json');
    if (pkgFile) {
      try {
        const content = await computerService.readFileContent(pkgFile.path, 4000);
        if (content) {
          const parsed = JSON.parse(content);
          manifest = {
            name: parsed.name,
            version: parsed.version,
            scripts: Object.keys(parsed.scripts || {}),
            dependencyCount: Object.keys(parsed.dependencies || {}).length,
            devDependencyCount: Object.keys(parsed.devDependencies || {}).length,
          };
        }
      } catch {}
    }

    const hasGit = fileNames.some((n) => n.includes('.git'));

    return {
      projectPath: dirPath,
      projectType,
      filesFound: files.slice(0, 15).map((f) => f.name),
      manifest,
      hasGit,
    };
  }

  /**
   * Explains technical build and compiler errors with clear remediation steps
   */
  explainBuildError(errorMessage: string): BuildErrorDiagnosis {
    const lower = errorMessage.toLowerCase();

    if (lower.includes('cannot find module') || lower.includes('module not found') || lower.includes('ts2307')) {
      const match = errorMessage.match(/cannot find module ['"]([^'"]+)['"]/i);
      const mod = match ? match[1] : 'the specified module';
      return {
        errorType: 'Missing Module / Unresolved Import',
        rootCause: `The import for ${mod} could not be resolved by the module bundler or TypeScript.`,
        suggestedFix: `1. Check if ${mod} is installed in package.json. Run 'npm install ${mod}'.\n2. If it's a local file, verify the relative path or tsconfig path alias.`,
        relevantFiles: ['package.json', 'tsconfig.json'],
      };
    }

    if (lower.includes('eaddrinuse') || lower.includes('address already in use') || (lower.includes('port') && lower.includes('already in use'))) {
      const portMatch = errorMessage.match(/:(\d{2,5})/);
      const portStr = portMatch ? portMatch[1] : 'this port';
      return {
        errorType: 'Port Conflict (EADDRINUSE)',
        rootCause: `Another background process or dev server is already listening on ${portStr}.`,
        suggestedFix: `1. Terminate the conflicting process using Task Manager or run 'netstat -ano | findstr :${portStr}'.\n2. Or specify an alternate port in your dev server config.`,
        relevantFiles: ['vite.config.ts', 'package.json'],
      };
    }

    if (lower.includes('ts2322') || lower.includes('not assignable to type')) {
      return {
        errorType: 'TypeScript Type Error',
        rootCause: 'Type mismatch where a variable or property receives a value of incompatible type.',
        suggestedFix: 'Verify the expected interface or type signature, add a type assertion, or update the schema definition.',
        relevantFiles: ['tsconfig.json'],
      };
    }

    if (lower.includes('e0382') || lower.includes('use of moved value') || lower.includes('borrow of moved value')) {
      return {
        errorType: 'Rust Borrow Checker Error (E0382)',
        rootCause: 'Value was moved to another ownership scope and subsequently used.',
        suggestedFix: 'Borrow the value with & / &mut instead of moving, or implement/derive Clone or Copy.',
        relevantFiles: ['src-tauri/src/lib.rs', 'src-tauri/Cargo.toml'],
      };
    }

    if (lower.includes('cargo') || lower.includes('rustc') || lower.includes('mismatched types')) {
      return {
        errorType: 'Rust Compilation Error',
        rootCause: 'Type mismatch or compiler constraint violation in Rust backend code.',
        suggestedFix: 'Run `cargo check` inside the src-tauri directory to see detailed compiler diagnostics with line numbers.',
        relevantFiles: ['src-tauri/src/lib.rs', 'src-tauri/Cargo.toml'],
      };
    }

    return {
      errorType: 'Build / Runtime Diagnostic',
      rootCause: 'General compilation, syntax, or environment issue detected.',
      suggestedFix: 'Review the full terminal stack trace, check syntax near the highlighted line, and verify dependency compatibility.',
      relevantFiles: [],
    };
  }
}

export const developerEngine = new DeveloperEngine();
