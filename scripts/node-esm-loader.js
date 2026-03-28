// Custom Node.js ESM loader for Vite-style imports
// Resolves extension-less imports by trying .js, .mjs, /index.js
// Also handles JSON imports without { type: 'json' } assertion (Vite allows bare JSON imports)
// Also patches import.meta.env for Vite compatibility
// Used by: node --loader ./scripts/node-esm-loader.js scripts/assemble-data.js
//
// Vite resolves imports without extensions (e.g., './edgar' -> './edgar.js')
// and allows JSON imports without assertions. Node.js native ESM requires both
// explicit extensions and import assertions for JSON. This loader bridges the gap
// so engine files run in Node without modification.

import { resolve as pathResolve, extname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';

const EXTENSIONS = ['.js', '.mjs', '.jsx', '/index.js', '/index.mjs'];

// Pre-load: patch import.meta.env with process.env values (Vite compatibility)
// This is picked up by the initialize hook
export async function initialize() {
  // Nothing needed here — env patching happens in load()
  // For .env.local loading, use: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config
  // The dotenv preload runs before the loader and populates process.env with VITE_* keys.
}

export async function resolve(specifier, context, nextResolve) {
  // Handle JSON imports: add the import attribute automatically
  if (specifier.endsWith('.json')) {
    const result = await nextResolve(specifier, {
      ...context,
      importAttributes: { ...context.importAttributes, type: 'json' },
    });
    return { ...result, importAttributes: { type: 'json' } };
  }

  // Handle extension-less relative imports
  if (specifier.startsWith('.') && !extname(specifier)) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const parentDir = parentPath.endsWith('/') ? parentPath : pathResolve(parentPath, '..');

    for (const ext of EXTENSIONS) {
      const candidate = pathResolve(parentDir, specifier + ext);
      if (existsSync(candidate)) {
        return {
          shortCircuit: true,
          url: pathToFileURL(candidate).href,
        };
      }
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
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

  // For .js files: wrap source to inject import.meta.env shim
  // This makes Vite-style import.meta.env.DEV / import.meta.env.VITE_* work in Node
  if (url.endsWith('.js') && !url.includes('node_modules') && url.startsWith('file://')) {
    const result = await nextLoad(url, context);
    if (result.source) {
      const source = typeof result.source === 'string'
        ? result.source
        : new TextDecoder().decode(result.source);

      // Only inject if the file uses import.meta.env
      if (source.includes('import.meta.env')) {
        const envShim = `
if (!import.meta.env) {
  import.meta.env = {
    DEV: false,
    PROD: true,
    MODE: 'production',
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k.startsWith('VITE_'))
    ),
  };
}
`;
        return {
          ...result,
          source: envShim + source,
        };
      }
    }
    return result;
  }

  return nextLoad(url, context);
}
