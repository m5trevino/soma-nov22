/**
 * The engine stores "no price published" as 0.0 and marks it with `free: null`.
 * Only `free: true` means the provider says the model costs nothing. A 0/0 pair
 * without that flag is an unknown price, not a free model, so it is dropped here
 * and every price filter, band and badge treats it as unpriced.
 */
export interface ReportedPrices {
  input?: number;
  output?: number;
  cacheRead?: number;
}

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function reportedPrices(raw: any): ReportedPrices {
  const input = num(raw?.input_price_1m ?? raw?.inputPrice1m);
  const output = num(raw?.output_price_1m ?? raw?.outputPrice1m);
  const cacheRead = num(raw?.cache_read_price_1m ?? raw?.cacheReadPrice1m);
  const confirmedFree = raw?.free === true || raw?.free === 'true';
  if (input === 0 && output === 0 && !confirmedFree) return {};
  return { input, output, cacheRead };
}
