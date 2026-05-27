import { DataPacketSchema } from '../schemas/dataPacket.js';

const DEFAULT_API_BASE_URL = 'https://api.thesis-investing.com';

export class ThesisApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ThesisApiError';
    this.code = options.code || 'THESIS_API_ERROR';
    this.status = options.status ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

function normalizeApiBaseUrl(apiBaseUrl) {
  return (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

async function parseJsonResponse(response) {
  if (typeof response.text === 'function') {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      const snippet = text ? ` ${text.slice(0, 200)}` : '';
      throw new ThesisApiError(`Thesis API returned a non-JSON response.${snippet}`, {
        code: 'NON_JSON_RESPONSE',
        status: response.status,
      });
    }
  }

  try {
    return await response.json();
  } catch {
    throw new ThesisApiError('Thesis API returned a non-JSON response.', {
      code: 'NON_JSON_RESPONSE',
      status: response.status,
    });
  }
}

export async function fetchDataPacket(ticker, config, options = {}) {
  const trimmedTicker = typeof ticker === 'string' ? ticker.trim() : '';
  if (!trimmedTicker) {
    throw new ThesisApiError('ticker is required', { code: 'MISSING_TICKER' });
  }

  if (!config?.apiKey) {
    throw new ThesisApiError('Thesis API key is required', { code: 'MISSING_API_KEY' });
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new ThesisApiError('No fetch implementation is available', { code: 'MISSING_FETCH' });
  }

  const normalizedTicker = trimmedTicker.toUpperCase();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  const response = await fetchImpl(`${apiBaseUrl}/v1/datapackets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ticker: normalizedTicker }),
  });

  const body = await parseJsonResponse(response);

  if (response.status === 202) {
    throw new ThesisApiError('queued DataPacket jobs are not supported by this CLI version', {
      code: 'JOB_QUEUED',
      status: response.status,
    });
  }

  if (!response.ok) {
    const error = body?.error || {};
    throw new ThesisApiError(error.message || `HTTP ${response.status} from Thesis API`, {
      code: error.code || `HTTP_${response.status}`,
      status: response.status,
      retryAfterSeconds: error.retryAfterSeconds ?? null,
    });
  }

  if (!body?.dataPacket) {
    throw new ThesisApiError('Thesis API response is missing dataPacket', {
      code: 'MISSING_DATA_PACKET',
      status: response.status,
    });
  }

  const parsed = DataPacketSchema.safeParse(body.dataPacket);
  if (!parsed.success) {
    throw new ThesisApiError('Thesis API returned an invalid DataPacket', {
      code: 'INVALID_DATA_PACKET',
      status: response.status,
    });
  }

  return {
    dataPacket: parsed.data,
    quality: body.quality || null,
    cache: body.cache || null,
  };
}
