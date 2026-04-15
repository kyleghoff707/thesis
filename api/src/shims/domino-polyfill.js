// Polyfill for browser DOM APIs in Cloudflare Workers.
// Workers have no `window`, `document`, or `DOMParser`. This shim uses
// @mixmark-io/domino (a server-side DOM implementation) to provide them.
//
// Two consumers:
// 1. Turndown (filing markdown) — checks `window.DOMParser` at module load
// 2. compensation.js — calls `new DOMParser()` + iterates `element.children`
//
// Domino's ChildrenCollection doesn't implement Symbol.iterator (browser
// HTMLCollection does). We patch it here so `for...of` works on .children.

import domino from '@mixmark-io/domino';

// ─── Patch ChildrenCollection to be iterable ─────────────────
// Domino's element.children returns a ChildrenCollection that has .length
// and .item() but no Symbol.iterator. Browser HTMLCollection has it.
// Compensation.js (and other shared code) uses `for (const child of el.children)`.
const dummyDoc = domino.createDocument('<html><body><div></div></body></html>');
const dummyEl = dummyDoc.body.firstChild;
const childrenProto = Object.getPrototypeOf(dummyEl.children);
if (!childrenProto[Symbol.iterator]) {
  childrenProto[Symbol.iterator] = function () {
    let i = 0;
    const self = this;
    return {
      next() {
        return i < self.length
          ? { value: self.item(i++), done: false }
          : { done: true };
      },
    };
  };
}

// ─── Patch NodeList to support .forEach() ────────────────────
// Browser NodeList has .forEach(), .entries(), etc. Domino's NodeList extends
// Array in ES6 mode but querySelectorAll may return a plain NodeList without
// Array methods. Patch it to be safe.
const dummyList = dummyDoc.querySelectorAll('div');
const nodeListProto = Object.getPrototypeOf(dummyList);
if (nodeListProto && !nodeListProto.forEach) {
  nodeListProto.forEach = Array.prototype.forEach;
}
if (nodeListProto && !nodeListProto[Symbol.iterator]) {
  nodeListProto[Symbol.iterator] = Array.prototype[Symbol.iterator];
}

// ─── DOMParser polyfill ──────────────────────────────────────
class DominoDOMParser {
  parseFromString(html, mimeType) {
    return domino.createDocument(html);
  }
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = DominoDOMParser;
}
