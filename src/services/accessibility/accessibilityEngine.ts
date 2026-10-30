/**
 * Foundry Accessibility Engine
 * Provides WCAG 2.2 analysis, color contrast ratio computation,
 * accessibility audits for HTML/ARIA, and screen reader/focus diagnostics.
 */

export interface ContrastResult {
  ratio: number;
  formattedRatio: string;
  aaNormal: boolean;   // >= 4.5:1
  aaLarge: boolean;    // >= 3.0:1
  aaaNormal: boolean;  // >= 7.0:1
  aaaLarge: boolean;   // >= 4.5:1
}

export interface AccessibilityViolation {
  id: string;
  wcagCriterion: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  severity: 'critical' | 'warning' | 'info';
  elementSnippet: string;
  issue: string;
  recommendation: string;
}

export interface AccessibilityAuditReport {
  passed: boolean;
  score: number; // 0 to 100
  totalChecks: number;
  violationCount: number;
  violations: AccessibilityViolation[];
  summary: string;
}

export interface UiFocusableItem {
  tagName: string;
  accessibleName: string;
  role: string;
  tabIndex: number;
  hasAriaLabel: boolean;
  isVisible: boolean;
}

export interface UiInspectionReport {
  title: string;
  hasLang: boolean;
  lang: string;
  landmarkCount: {
    main: number;
    nav: number;
    header: number;
    footer: number;
  };
  focusableElements: UiFocusableItem[];
  missingAccessibleNamesCount: number;
  headingHierarchyValid: boolean;
  headingSummary: string[];
}

export class AccessibilityEngine {
  /**
   * Computes WCAG 2.2 relative luminance for a given sRGB color component (0-255).
   */
  private getChannelLuminance(c: number): number {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  }

  /**
   * Computes relative luminance of an RGB tuple.
   */
  public getRelativeLuminance(r: number, g: number, b: number): number {
    const lr = this.getChannelLuminance(r);
    const lg = this.getChannelLuminance(g);
    const lb = this.getChannelLuminance(b);
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  }

  /**
   * Parses hex color string (e.g. "#fff", "#1a1a1a", "rgb(255,255,255)") into RGB.
   */
  public parseColor(colorStr: string): { r: number; g: number; b: number } | null {
    const clean = colorStr.trim().toLowerCase();

    // Hex #rgb or #rrggbb
    if (clean.startsWith('#')) {
      const hex = clean.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
        };
      }
      if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }
    }

    // rgb(r, g, b)
    const rgbMatch = clean.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1], 10),
        g: parseInt(rgbMatch[2], 10),
        b: parseInt(rgbMatch[3], 10),
      };
    }

    // Common named colors
    const namedColors: Record<string, [number, number, number]> = {
      white: [255, 255, 255],
      black: [0, 0, 0],
      red: [255, 0, 0],
      green: [0, 128, 0],
      blue: [0, 0, 255],
      yellow: [255, 255, 0],
      cyan: [0, 255, 255],
      gray: [128, 128, 128],
      grey: [128, 128, 128],
    };

    if (namedColors[clean]) {
      const [r, g, b] = namedColors[clean];
      return { r, g, b };
    }

    return null;
  }

  /**
   * Calculates WCAG 2.2 Color Contrast Ratio between two colors.
   */
  public calculateContrast(fgColor: string, bgColor: string): ContrastResult {
    const fg = this.parseColor(fgColor) || { r: 0, g: 0, b: 0 };
    const bg = this.parseColor(bgColor) || { r: 255, g: 255, b: 255 };

    const l1 = this.getRelativeLuminance(fg.r, fg.g, fg.b);
    const l2 = this.getRelativeLuminance(bg.r, bg.g, bg.b);

    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    const ratio = (lighter + 0.05) / (darker + 0.05);
    const rounded = Math.round(ratio * 100) / 100;

    return {
      ratio: rounded,
      formattedRatio: `${rounded.toFixed(2)}:1`,
      aaNormal: rounded >= 4.5,
      aaLarge: rounded >= 3.0,
      aaaNormal: rounded >= 7.0,
      aaaLarge: rounded >= 4.5,
    };
  }

  /**
   * Audits an HTML code snippet for common WCAG violations.
   */
  public auditHtml(html: string): AccessibilityAuditReport {
    const violations: AccessibilityViolation[] = [];
    let totalChecks = 0;

    // 1. Check for images missing alt attribute (WCAG 1.1.1)
    const imgRegex = /<img\b([^>]*)>/gi;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      totalChecks++;
      const attrs = imgMatch[1];
      if (!/alt\s*=/i.test(attrs)) {
        violations.push({
          id: 'missing-alt',
          wcagCriterion: '1.1.1 Non-text Content',
          wcagLevel: 'A',
          severity: 'critical',
          elementSnippet: imgMatch[0].slice(0, 100),
          issue: 'Image is missing an alt attribute.',
          recommendation: 'Add alt="descriptive text" for informative images, or alt="" for decorative images.',
        });
      }
    }

    // 2. Check for button elements without text or aria-label (WCAG 4.1.2)
    const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let btnMatch: RegExpExecArray | null;
    while ((btnMatch = buttonRegex.exec(html)) !== null) {
      totalChecks++;
      const attrs = btnMatch[1];
      const innerText = btnMatch[2].replace(/<[^>]*>/g, '').trim();
      const hasAriaLabel = /aria-label(ledby)?\s*=/i.test(attrs);
      const hasTitle = /title\s*=/i.test(attrs);

      if (!innerText && !hasAriaLabel && !hasTitle) {
        violations.push({
          id: 'empty-button',
          wcagCriterion: '4.1.2 Name, Role, Value',
          wcagLevel: 'A',
          severity: 'critical',
          elementSnippet: btnMatch[0].slice(0, 100),
          issue: 'Button has no accessible name (no text content, aria-label, or title).',
          recommendation: 'Provide readable text inside the button or add an aria-label attribute.',
        });
      }
    }

    // 3. Check for input elements missing labels (WCAG 1.3.1, 4.1.2)
    const inputRegex = /<input\b([^>]*)>/gi;
    let inputMatch: RegExpExecArray | null;
    while ((inputMatch = inputRegex.exec(html)) !== null) {
      const attrs = inputMatch[1];
      // ignore hidden, submit, button, reset
      if (/type\s*=\s*["'](hidden|submit|button|reset)["']/i.test(attrs)) {
        continue;
      }
      totalChecks++;
      const hasAria = /aria-label(ledby)?\s*=/i.test(attrs);
      const hasId = /id\s*=\s*["']([^"']+)["']/i.exec(attrs);
      let hasLabel = hasAria;
      if (hasId && !hasLabel) {
        const idVal = hasId[1];
        const labelForRegex = new RegExp(`<label[^>]*for=["']${idVal}["']`, 'i');
        if (labelForRegex.test(html)) {
          hasLabel = true;
        }
      }

      if (!hasLabel) {
        violations.push({
          id: 'missing-input-label',
          wcagCriterion: '1.3.1 Info and Relationships',
          wcagLevel: 'A',
          severity: 'critical',
          elementSnippet: inputMatch[0].slice(0, 100),
          issue: 'Form input does not have an associated <label for="..."> or aria-label.',
          recommendation: 'Connect an explicit <label for="inputId"> or provide an aria-label.',
        });
      }
    }

    // 4. Check heading hierarchy order (WCAG 1.3.1)
    const headingRegex = /<h([1-6])\b[^>]*>/gi;
    let hMatch: RegExpExecArray | null;
    let prevLevel = 0;
    while ((hMatch = headingRegex.exec(html)) !== null) {
      totalChecks++;
      const level = parseInt(hMatch[1], 10);
      if (prevLevel > 0 && level > prevLevel + 1) {
        violations.push({
          id: 'skipped-heading-level',
          wcagCriterion: '1.3.1 Info and Relationships',
          wcagLevel: 'AA',
          severity: 'warning',
          elementSnippet: hMatch[0],
          issue: `Heading level skipped from <h${prevLevel}> directly to <h${level}>.`,
          recommendation: `Use <h${prevLevel + 1}> to preserve logical hierarchical structure for assistive tech.`,
        });
      }
      prevLevel = level;
    }

    // 5. Check role="button" has keyboard support indicator (WCAG 2.1.1)
    const roleBtnRegex = /<([a-z0-9]+)\b([^>]*role\s*=\s*["']button["'][^>]*)>/gi;
    let roleBtnMatch: RegExpExecArray | null;
    while ((roleBtnMatch = roleBtnRegex.exec(html)) !== null) {
      const tag = roleBtnMatch[1].toLowerCase();
      if (tag === 'button') continue;
      totalChecks++;
      const attrs = roleBtnMatch[2];
      if (!/tabindex\s*=/i.test(attrs)) {
        violations.push({
          id: 'role-button-no-tabindex',
          wcagCriterion: '2.1.1 Keyboard Accessible',
          wcagLevel: 'A',
          severity: 'critical',
          elementSnippet: roleBtnMatch[0].slice(0, 100),
          issue: `Element <${tag} role="button"> is not keyboard focusable (missing tabindex="0").`,
          recommendation: 'Add tabindex="0" and onKeyDown handlers for Enter and Space keys.',
        });
      }
    }

    const baselineChecks = Math.max(totalChecks, 1);
    const score = Math.max(0, Math.round(100 - (violations.length * 20) / baselineChecks * 10));

    return {
      passed: violations.length === 0,
      score: violations.length === 0 ? 100 : score,
      totalChecks,
      violationCount: violations.length,
      violations,
      summary: violations.length === 0
        ? `Accessibility audit passed! All ${totalChecks} evaluated elements conform to baseline WCAG 2.2 rules.`
        : `Found ${violations.length} accessibility violation(s) across ${totalChecks} evaluated elements.`,
    };
  }

  /**
   * Inspects the active document in browser/DOM environment for accessibility features.
   */
  public inspectLiveDom(): UiInspectionReport {
    if (typeof document === 'undefined') {
      return {
        title: 'DOM unavailable',
        hasLang: false,
        lang: '',
        landmarkCount: { main: 0, nav: 0, header: 0, footer: 0 },
        focusableElements: [],
        missingAccessibleNamesCount: 0,
        headingHierarchyValid: true,
        headingSummary: [],
      };
    }

    const title = document.title || '';
    const lang = document.documentElement.getAttribute('lang') || '';
    const hasLang = Boolean(lang);

    const landmarkCount = {
      main: document.querySelectorAll('main, [role="main"]').length,
      nav: document.querySelectorAll('nav, [role="navigation"]').length,
      header: document.querySelectorAll('header, [role="banner"]').length,
      footer: document.querySelectorAll('footer, [role="contentinfo"]').length,
    };

    const focusableSelectors = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const rawFocusables = Array.from(document.querySelectorAll(focusableSelectors));

    let missingAccessibleNamesCount = 0;
    const focusableElements: UiFocusableItem[] = rawFocusables.slice(0, 50).map((el) => {
      const tagName = el.tagName.toLowerCase();
      const ariaLabel = el.getAttribute('aria-label') || '';
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      let accessibleName = ariaLabel;

      if (!accessibleName && ariaLabelledBy) {
        const refEl = document.getElementById(ariaLabelledBy);
        if (refEl) accessibleName = refEl.textContent?.trim() || '';
      }
      if (!accessibleName) {
        accessibleName = el.textContent?.trim() || el.getAttribute('title') || '';
      }

      if (!accessibleName && tagName !== 'input') {
        missingAccessibleNamesCount++;
      }

      return {
        tagName,
        accessibleName: accessibleName.slice(0, 40),
        role: el.getAttribute('role') || tagName,
        tabIndex: parseInt(el.getAttribute('tabindex') || '0', 10),
        hasAriaLabel: Boolean(ariaLabel),
        isVisible: true,
      };
    });

    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const headingSummary = headings.map((h) => `${h.tagName}: "${h.textContent?.trim().slice(0, 30)}"`);

    let headingHierarchyValid = true;
    let prevLevel = 0;
    for (const h of headings) {
      const level = parseInt(h.tagName[1], 10);
      if (prevLevel > 0 && level > prevLevel + 1) {
        headingHierarchyValid = false;
        break;
      }
      prevLevel = level;
    }

    return {
      title,
      hasLang,
      lang,
      landmarkCount,
      focusableElements,
      missingAccessibleNamesCount,
      headingHierarchyValid,
      headingSummary,
    };
  }
}

export const accessibilityEngine = new AccessibilityEngine();
