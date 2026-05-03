import { helloWorld } from './hello-world.js';
import { onePagerFn } from './one-pager.js';
import { pitchDeckFn } from './pitch-deck.js';

export const functions = [helloWorld, onePagerFn, pitchDeckFn] as const;
