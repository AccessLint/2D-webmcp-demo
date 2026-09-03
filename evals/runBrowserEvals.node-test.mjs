import assert from "node:assert/strict";
import test from "node:test";
import { runBrowserEvals } from "./runBrowserEvals.mjs";

test("summarizes the newest report even when the browser eval fails", () => {
  const calls = [];
  const exitCode = runBrowserEvals((command, args) => {
    calls.push({ command, args });
    return { status: calls.length === 1 ? 2 : 0 };
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].args[0], /webmcp-evals\.js$/);
  assert.match(calls[1].args[0], /summarizeLatency\.mjs$/);
  assert.equal(exitCode, 2);
});

test("propagates a summary failure after a successful browser eval", () => {
  const statuses = [0, 3];
  const exitCode = runBrowserEvals(() => ({ status: statuses.shift() }));

  assert.equal(exitCode, 3);
});
