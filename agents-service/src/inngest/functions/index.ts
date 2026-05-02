import { helloWorld } from './hello-world.js';
import { onePagerFn } from './one-pager.js';

export const functions = [helloWorld, onePagerFn] as const;
