/**
 * Development-only diagnostic logging.
 *
 * Pipeline traces include user queries, model prompts, answers and file contents. They are useful while
 * developing but must not be written to the console of a production build (privacy), so this is a no-op
 * unless Vite is running in dev/test mode.
 */
const enabled: boolean = (() => {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
})();

export function trace(...args: unknown[]): void {
  if (enabled) console.log(...args);
}
