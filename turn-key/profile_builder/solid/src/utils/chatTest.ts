/**
 * Live-test helpers shared by the model pool and the deck.
 *
 * Every request to the engine carries the model and the provider as two
 * separate fields. The engine must not choose the gateway for a model that
 * several gateways offer, so a test that omits the provider tests nothing
 * useful. Results are stored per (provider, model): the same model id on
 * two providers is two different routes with two different outcomes.
 */

/** Storage key for one route's test result. */
export function testKey(provider: string, modelId: string): string {
  return `${provider}::${modelId}`;
}

/** The SDK treats these placeholders as "no provider"; so does the UI. */
export function hasProvider(provider: string | undefined | null): boolean {
  const value = (provider ?? '').trim().toLowerCase();
  return value !== '' && value !== 'unknown' && value !== 'default';
}

export function chatTestBody(modelId: string, provider: string, content: string) {
  return {
    model: modelId,
    provider,
    messages: [{ role: 'user', content }],
    max_tokens: 32,
  };
}

/** What to show when a card or model has no usable provider. */
export function missingProviderText(modelId: string): string {
  return (
    `No provider on "${modelId}". Every call must send the model and the provider ` +
    `as two fields, e.g. {"model": "${modelId}", "provider": "openrouter"}. ` +
    `Re-add the model from the pool (each pool card is one provider), or set ` +
    `"provider" on this deck card in the profile JSON.`
  );
}

/** "HTTP 400" plus the engine's own explanation when it gave one. */
export function failureText(status: number, body: any): string {
  const raw = body?.detail ?? body?.error?.detail ?? body?.error?.message ?? body?.error;
  const detail = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : '';
  if (!detail) return `HTTP ${status}`;
  return `HTTP ${status}: ${detail.length > 240 ? detail.slice(0, 240) + '…' : detail}`;
}
