import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { configPath } from '../utils/thesisDir.js';

export const DEFAULT_API_BASE_URL = 'https://api.thesis-investing.com';
export const DEFAULT_MODE = 'hosted-data';

function normalizeApiBaseUrl(apiBaseUrl) {
  if (typeof apiBaseUrl !== 'string') return DEFAULT_API_BASE_URL;
  const normalized = apiBaseUrl.trim().replace(/\/+$/, '');
  return normalized || DEFAULT_API_BASE_URL;
}

function normalizeApiKey(apiKey) {
  return typeof apiKey === 'string' ? apiKey.trim() : '';
}

function normalizeAccountEmail(accountEmail) {
  return typeof accountEmail === 'string' ? accountEmail.trim() : '';
}

function normalizeConfig(config = {}) {
  return {
    ...config,
    apiBaseUrl: normalizeApiBaseUrl(config.apiBaseUrl),
    apiKey: normalizeApiKey(config.apiKey),
    defaultMode: config.defaultMode || DEFAULT_MODE,
    accountEmail: normalizeAccountEmail(config.accountEmail),
  };
}

export function readThesisConfig() {
  const path = configPath();
  if (!existsSync(path)) return normalizeConfig();

  try {
    return normalizeConfig(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    throw new Error(`Could not parse ${path}. Fix or delete config.json. ${error.message}`);
  }
}

export function requireThesisApiConfig() {
  const config = readThesisConfig();
  if (!config.apiKey) {
    throw new Error(`Missing Thesis API key in ${configPath()}. Create config.json with an apiKey to use hosted data.`);
  }
  return config;
}

export function writeThesisConfig(nextConfig) {
  const path = configPath();
  const existingConfig = existsSync(path) ? readThesisConfig() : {};
  const config = normalizeConfig({ ...existingConfig, ...nextConfig });

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);

  return { path, config };
}

export function maskApiKey(apiKey) {
  if (!apiKey) return '(missing)';
  if (apiKey.length < 12) return '***';
  return `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`;
}
