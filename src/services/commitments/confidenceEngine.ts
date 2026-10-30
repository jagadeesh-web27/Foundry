/**
 * Foundry Confidence Engine - Commitment Confidence & Over-Detection Prevention
 * Accurately scores detected intentions based on linguistic cues, modal verbs, negations,
 * and temporal specificity to prevent hallucinating obligations.
 */

export interface ConfidenceAssessment {
  confidence: number; // 0.0 to 1.0
  isTentative: boolean; // True if confidence < 0.75
  signals: string[];
}

export class ConfidenceEngine {
  private static HIGH_CONFIDENCE_PATTERNS = [
    /\b(will definitely|will certainly|promise to|guarantee|committed to|confirm that I will|i will|i'll)\b/i,
    /\b(please submit|must be submitted|deadline is|due by|required by)\b/i,
    /\b(can you please|could you please|please send|kindly provide)\b/i,
    /\b(waiting on|waiting for|awaiting response|pending your)\b/i,
  ];

  private static TENTATIVE_PATTERNS = [
    /\b(might|maybe|perhaps|possibly|if possible|if I get time|could potentially|try to|hope to)\b/i,
    /\b(let's see|we can consider|might be able to)\b/i,
  ];

  private static NEGATION_OR_DISMISSAL_PATTERNS = [
    /\b(don't worry|no need|never mind|cancel that|ignore the previous|already done|all set|received thanks|thanks received)\b/i,
    /\b(thanks,?\s*received|received,?\s*thanks|thank you|got it|sounds good|all set|no problem)\b/i,
    /\b(not needed|won't be able to|cannot send|unable to)\b/i,
  ];

  /**
   * Evaluates the linguistic confidence of an extracted commitment candidate.
   * @param text The exact sentence or evidence containing the commitment
   * @param hasDueDate Whether a specific temporal target was successfully resolved
   */
  public evaluate(text: string, hasDueDate: boolean): ConfidenceAssessment {
    const clean = text.trim();
    const signals: string[] = [];

    // 1. Check for immediate disqualifiers (negations, dismissals)
    for (const pattern of ConfidenceEngine.NEGATION_OR_DISMISSAL_PATTERNS) {
      if (pattern.test(clean)) {
        signals.push('Negation or dismissal detected');
        return {
          confidence: 0.1,
          isTentative: true,
          signals,
        };
      }
    }

    let score = 0.5; // Baseline

    // 2. Check for tentative language (penalty)
    let isTentativePhrase = false;
    for (const pattern of ConfidenceEngine.TENTATIVE_PATTERNS) {
      if (pattern.test(clean)) {
        score -= 0.25;
        isTentativePhrase = true;
        signals.push('Tentative modal verb detected (e.g. might, maybe, try to)');
      }
    }

    // 3. Check for high-commitment affirmations (boost only if not tentative)
    if (!isTentativePhrase) {
      for (const pattern of ConfidenceEngine.HIGH_CONFIDENCE_PATTERNS) {
        if (pattern.test(clean)) {
          score += 0.35;
          signals.push('Strong commitment keyword identified');
          break;
        }
      }
    }

    // 4. Boost for having an explicit resolved due date
    if (hasDueDate) {
      score += 0.15;
      signals.push('Concrete due date/time resolved');
    }

    // 5. Specificity bonus: Action verbs
    if (/\b(send|submit|review|share|call|email|deliver|forward|sign|prepare)\b/i.test(clean)) {
      score += 0.1;
      signals.push('Explicit action verb present');
    }

    // If tentative, cap confidence at 0.60
    if (isTentativePhrase) {
      score = Math.min(score, 0.6);
    }

    // Clamp between 0.05 and 1.0
    const finalScore = Math.max(0.05, Math.min(1.0, parseFloat(score.toFixed(2))));
    const isTentative = isTentativePhrase || finalScore < 0.75;

    return {
      confidence: finalScore,
      isTentative,
      signals,
    };
  }
}

export const confidenceEngine = new ConfidenceEngine();
