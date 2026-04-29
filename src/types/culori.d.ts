declare module "culori" {
  export function parse(value: string): unknown;
  export function formatHex(value: unknown): string;
}
