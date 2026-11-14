// Every test file in test/ is actually run by `npm test`.
//
// The suite is a hand-typed chain of `node test/… && node test/…` in package.json, which means a new test file
// protects nothing until somebody remembers to add it to that line — and a test nobody runs is indistinguishable
// from a test that does not exist. Found while adding test/worker-pages.test.js on 2026-11-14: nothing anywhere
// would have said if the line had been left alone.
//
// This is deliberately not a change of runner. `node --test` would find the files by itself, but it would also
// swallow the one line each of these files prints when it passes, and those lines are how the owner reads the
// suite's result. A list that is checked is as good as a list that is generated, and costs nothing else.
// Run: node test/suite-is-whole.test.js
import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";

const command = JSON.parse(readFileSync("package.json", "utf8")).scripts.test;
const onDisk = readdirSync("test").filter((name) => name.endsWith(".test.js")).sort();
const missing = onDisk.filter((name) => !command.includes(`test/${name}`));

assert.deepStrictEqual(missing, [],
  `these test files exist and npm test never runs them — add them to the "test" script in package.json`);

// And the other way: the line must not name a file that was deleted, which would stop the whole suite at that point.
const named = [...command.matchAll(/test\/([\w-]+\.test\.js)/g)].map((m) => m[1]);
const ghosts = named.filter((name) => !onDisk.includes(name));
assert.deepStrictEqual(ghosts, [], "npm test names test files that are not on disk; the suite would stop there");

console.log(`suite-is-whole: all ${onDisk.length} test files are in the npm test chain`);
