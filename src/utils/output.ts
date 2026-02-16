/**
 * Output utilities for dual mode (human-readable vs JSON)
 */

export interface OutputOptions {
  json: boolean;
}

export function output(data: Record<string, unknown>, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(data));
  }
}

export function outputSuccess(message: string, options: OutputOptions): void {
  if (!options.json) {
    console.log(`\n✅ ${message}`);
  }
}

export function outputError(message: string, options: OutputOptions): void {
  if (!options.json) {
    console.error(`\n❌ ${message}`);
  }
}

export function outputInfo(message: string, options: OutputOptions): void {
  if (!options.json) {
    console.log(`\n${message}`);
  }
}
