// Custom Node.js ESM loader for legacy bundler-style imports
// Resolves extension-less imports by trying .js, .mjs, /index.js
// Also handles JSON imports without { type: 'json' } assertion.
// Used by: node --loader ./scripts/node-esm-loader.js scripts/assemble-data.js
//
// Bundlers often resolve imports without extensions (e.g., './edgar' -> './edgar.js')
// and allow JSON imports without assertions. Node.js native ESM requires both
// explicit extensions and import assertions for JSON. This loader bridges the gap
// so engine files run in Node without modification.

import { resolve as pathResolve, extname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';

const EXTENSIONS = ['.js', '.mjs', '/index.js', '/index.mjs'];

// ?raw suffix — strip before resolve, flag for text loading
function stripRawSuffix(specifier) {
  if (specifier.endsWith('?raw')) {
    return { specifier: specifier.slice(0, -4), isRaw: true };
  }
  return { specifier, isRaw: false };
}

export async function initialize() {
  // Reserved for future loader initialization.
}

export async function resolve(specifier, context, nextResolve) {
  // Handle ?raw imports: strip suffix, resolve, tag URL
  const { specifier: cleanSpec, isRaw } = stripRawSuffix(specifier);

  // Handle JSON imports: add the import attribute automatically
  if (cleanSpec.endsWith('.json')) {
    const result = await nextResolve(cleanSpec, {
      ...context,
      importAttributes: { ...context.importAttributes, type: 'json' },
    });
    return { ...result, importAttributes: { type: 'json' } };
  }

  // Handle .md (and other text) imports — resolve to file URL with ?raw tag
  if (isRaw && cleanSpec.startsWith('.')) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const parentDir = parentPath.endsWith('/') ? parentPath : pathResolve(parentPath, '..');
    const candidate = pathResolve(parentDir, cleanSpec);
    if (existsSync(candidate)) {
      return {
        shortCircuit: true,
        url: pathToFileURL(candidate).href + '?raw',
      };
    }
  }

  // Handle extension-less relative imports
  if (cleanSpec.startsWith('.') && !extname(cleanSpec)) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const parentDir = parentPath.endsWith('/') ? parentPath : pathResolve(parentPath, '..');

    for (const ext of EXTENSIONS) {
      const candidate = pathResolve(parentDir, cleanSpec + ext);
      if (existsSync(candidate)) {
        return {
          shortCircuit: true,
          url: pathToFileURL(candidate).href,
        };
      }
    }
  }

  return nextResolve(cleanSpec, context);
}

export async function load(url, context, nextLoad) {
  // Handle ?raw imports — return file contents as a default-exported string
  if (url.includes('?raw')) {
    const filePath = fileURLToPath(url.replace('?raw', ''));
    const source = readFileSync(filePath, 'utf8');
    return {
      shortCircuit: true,
      format: 'module',
      source: `export default ${JSON.stringify(source)};`,
    };
  }

  // Auto-load JSON files with json type if not already set
  if (url.endsWith('.json')) {
    const filePath = fileURLToPath(url);
    const source = readFileSync(filePath, 'utf8');
    return {
      shortCircuit: true,
      format: 'json',
      source,
    };
  }

  return nextLoad(url, context);
}
