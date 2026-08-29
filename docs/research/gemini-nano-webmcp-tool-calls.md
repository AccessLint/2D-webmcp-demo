# Gemini Nano as a WebMCP tool caller

Research date: 2026-08-28

## Bottom line

Gemini Nano can plausibly orchestrate WebMCP tools **inside a page**, but this is not a production-ready, built-in Chrome integration today.

- Chrome's Prompt API is shipped for the web from Chrome 148 and uses the browser-provided Gemini Nano model. Chrome's current documentation, updated 2026-08-26, still documents only text output and does not document tool calling. The April 2026 Intent to Ship explicitly described tool use as a possible future additive enhancement ([Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api), [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/iR6R7-nQeHI)).
- Tool use exists in the Prompt API community draft and in Chromium source, but Chromium marks `AIPromptAPIToolUse` as **experimental**, and its implementation shape is not the same as the current draft. This is evidence of an experiment, not a stable Chrome contract ([Prompt API draft](https://webmachinelearning.github.io/prompt-api/), [Chromium runtime feature definition](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/platform/runtime_enabled_features.json5), [Chromium Prompt API IDL](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/ai/language_model_create_options.idl)).
- WebMCP is itself a proposed standard. Chrome began an origin trial in Chrome 149 and supports local development behind `chrome://flags/#enable-webmcp-testing`; it is not a generally available cross-browser surface ([Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp), [origin-trial announcement](https://developer.chrome.com/blog/ai-webmcp-origin-trial)).
- Chrome has announced that **Gemini in Chrome** will support WebMCP “soon”; that statement concerns Chrome's browser agent, not the page-level Gemini Nano Prompt API. It should not be read as evidence that `LanguageModel` currently discovers or invokes `document.modelContext` tools ([Google I/O 2026 Chrome announcement](https://developer.chrome.com/blog/chrome-at-io26)).

The recommended proof is therefore an explicit page-owned adapter:

1. Discover WebMCP tools with `document.modelContext.getTools()`.
2. Give their names, descriptions, and schemas to Gemini Nano.
3. Let the model propose a tool call.
4. Validate and authorize it in page code.
5. Invoke it with `document.modelContext.executeTool()`.
6. Return the result to the model for a final response.

Run that adapter in two modes: experimental native Prompt API tool use when available, and text-plus-JSON-Schema planning as the practical fallback.

## The two APIs and the missing bridge

WebMCP is outward-facing: a page registers JavaScript tools so an agent can discover and invoke them. The draft explicitly defines `getTools()` and `executeTool()` for in-page JavaScript agents, while browser-owned agents use an internal mechanism. It also says the browser is free to translate tools into MCP, proprietary function calling, or another representation ([WebMCP draft, `ModelContext`](https://webmachinelearning.github.io/webmcp/#modelcontext-interface), [interaction with browser agents](https://webmachinelearning.github.io/webmcp/#page-observations)).

The Prompt API is inward-facing: page code prompts a browser-provided language model to enhance that page. Chrome's original function-calling Intent makes this distinction explicitly and calls Prompt API function calling and page-exposed tools complementary rather than automatically connected ([Intent to Prototype: Prompt API Function Calling](https://groups.google.com/a/chromium.org/g/blink-dev/c/i0rxY1MIg6U)).

That leaves orchestration to the application. Neither current Chrome documentation says that a `LanguageModel` session automatically observes `document.modelContext`, nor does WebMCP require a browser agent to use Gemini Nano.

Chrome's Model Context Tool Inspector does not fill this gap: its chat uses the cloud `gemini-3-flash-preview` model by default, and Chrome explicitly says the inspector is separate from Gemini in Chrome ([Chrome WebMCP inspector documentation](https://developer.chrome.com/docs/ai/webmcp#imitate_agent_chat_with_the_inspector_extension)).

## API status and implementation mismatch

### Prompt API

Chrome's supported surface is `LanguageModel.availability()`, `LanguageModel.create()`, `prompt()`, `promptStreaming()`, structured output through `responseConstraint`, session cloning, and lifecycle controls. Chrome's current docs say `expectedOutputs` accepts text only ([Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api)).

The current Prompt API community draft goes farther. It defines a `tools` creation option whose entries include a name, description, JSON Schema, and an `execute` function; during generation the user agent may call those functions ([Prompt API draft IDL](https://webmachinelearning.github.io/prompt-api/#api), [generation algorithm](https://webmachinelearning.github.io/prompt-api/#generate)).

Current Chromium source instead implements an experimental **open loop**:

- `LanguageModel.create({ tools: [...] })` receives declarations without execute callbacks.
- The model may return structured `tool-call` content.
- JavaScript executes the requested operation.
- JavaScript sends a `LanguageModelToolSuccess` or `LanguageModelToolError` back as `tool-response` content.

The relevant Chromium IDL is gated by `RuntimeEnabled=AIPromptAPIToolUse`; Chromium's virtual test suite enables it explicitly with `--enable-features=AIPromptAPIToolUse` ([current IDL](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/ai/language_model_create_options.idl), [virtual test configuration](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/web_tests/VirtualTestSuites), [browser-side implementation commit](https://chromium.googlesource.com/chromium/src/+/baf59974af4f469204ce113c2e4d05a63d5aa799)).

This divergence matters: code written against the community draft's automatic `execute` callback will not necessarily run against Chrome's experimental open-loop implementation. Feature detection must test behavior, not only whether a `tools` property exists.

### WebMCP

WebMCP's imperative API registers tools at `document.modelContext`. The current draft also exposes `getTools()` and `executeTool()` specifically for an in-page agent. Current Chromium source contains those methods, although its `executeTool()` IDL currently takes serialized JSON rather than the object-shaped argument in the latest community draft ([WebMCP draft](https://webmachinelearning.github.io/webmcp/#modelcontext-interface), [current Chromium `ModelContext` IDL](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/script_tools/model_context.idl)).

Chrome's WebMCP origin trial started in 149. Local development uses the WebMCP testing flag. As of Chrome 153, Chrome documents improved unregistration behavior that no longer breaks in-flight executions; the locally installed Chrome inspected for this report is 152.0.7977.65, so that improvement is not available in the current test browser ([Chrome imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api)).

## Security, permissions, and user activation

Both APIs require secure contexts.

For the Prompt API:

- It is allowed in top-level and same-origin frames by default. A cross-origin iframe needs `allow="language-model"`; workers are not currently supported ([Prompt API permissions section](https://developer.chrome.com/docs/ai/prompt-api#permission_policy_iframes_and_web_workers)).
- If the model is `downloadable` or `downloading`, `LanguageModel.create()` requires meaningful user activation. Chrome recommends checking `navigator.userActivation.isActive` ([built-in AI user activation guidance](https://developer.chrome.com/docs/ai/get-started#user_activation)).
- Inference runs locally after model download; Chrome says no prompt data is sent to Google or a third party. The initial model download requires an unmetered connection ([Prompt API requirements](https://developer.chrome.com/docs/ai/prompt-api#review_the_hardware_requirements)).

For WebMCP:

- The API is restricted to origin-keyed documents, and is disabled when a page opts out of origin isolation through `document.domain`/`Origin-Agent-Cluster: ?0`.
- The `tools` Permissions Policy defaults to `self`; cross-origin frames require `allow="tools"` ([Chrome WebMCP security and permissions](https://developer.chrome.com/docs/ai/webmcp#security_and_permissions)).
- The draft has no per-call user-activation or consent requirement. `readOnlyHint` and `untrustedContentHint` are advisory metadata, not authorization. The draft explicitly discusses tool poisoning, injected tool output, misleading intent, over-parameterization, and cross-origin data leakage as unresolved or partly mitigated risks ([WebMCP security considerations](https://webmachinelearning.github.io/webmcp/#security-and-privacy-considerations)).

The adapter must therefore supply its own policy. It should allow automatic execution only for a small read-only allowlist, require a visible user confirmation for state-changing tools, validate arguments again in the handler, limit call count and payload size, display the exact proposed action, propagate abort signals, and treat tool output as untrusted model input. These controls align with Chrome's official recommendations for deterministic guardrails, origin restrictions, confirmation, token limits, and untrusted-output handling ([WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools), [agent security considerations](https://developer.chrome.com/docs/agents/security)).

## Availability and fallback

Gemini Nano is not universally available. Chrome currently requires desktop Windows 10/11, macOS 13+, Linux, or Chromebook Plus; at least 22 GB of free storage; and either more than 4 GB VRAM or at least 16 GB RAM with four CPU cores. Android, iOS, and non-Plus Chromebooks are unsupported. `LanguageModel.availability(options)` returns `unavailable`, `downloadable`, `downloading`, or `available` ([Chrome built-in AI requirements and availability](https://developer.chrome.com/docs/ai/get-started)).

Use progressive enhancement in this order:

1. Experimental native tool use, only after a behavioral probe succeeds.
2. Shipped Prompt API structured output: ask Nano for a JSON `{name, arguments}` plan constrained by a schema, then validate and execute the selected WebMCP tool in page code. This is not native function calling, but it preserves local inference.
3. A cloud or extension agent with function calling, if the product permits network processing.
4. The application's visible/manual controls. In this repository, the development fallback already invokes the same handlers as WebMCP, which is a good final fallback.

Do not treat `LanguageModel` existing as proof that the model is installed, that the requested languages/modalities are supported, or that tool use is enabled. Call `availability()` with the same options intended for `create()`, and separately feature-detect `document.modelContext`, `getTools`, and `executeTool`.

## Sample adapter shape

The following is illustrative because both experimental signatures are still changing. In Chromium's current open-loop shape, `executeTool()` takes a JSON string; the latest WebMCP draft takes an object.

```js
const context = document.modelContext;
const webTools = await context.getTools();

const declarations = webTools.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema: inputSchema ?? { type: "object", properties: {} },
}));

const session = await LanguageModel.create({
  expectedInputs: [
    { type: "text", languages: ["en"] },
    { type: "tool-response" },
  ],
  expectedOutputs: [
    { type: "text", languages: ["en"] },
    { type: "tool-call" },
  ],
  tools: declarations,
});

let result = await session.prompt(userRequest);

while (Array.isArray(result)) {
  const calls = result.filter((item) => item.type === "tool-call");
  if (!calls.length) break;

  const responses = [];
  for (const { value: call } of calls) {
    const tool = webTools.find((candidate) => candidate.name === call.name);
    if (!tool) throw new Error(`Unknown tool: ${call.name}`);

    await authorizeCall(tool, call.arguments); // app-owned policy and UI

    try {
      const raw = await context.executeTool(
        tool,
        JSON.stringify(call.arguments ?? {}) // current Chromium shape
      );
      responses.push({
        type: "tool-response",
        value: new LanguageModelToolSuccess({
          callID: call.callID,
          name: call.name,
          result: [{ type: "object", value: JSON.parse(raw) }],
        }),
      });
    } catch (error) {
      responses.push({
        type: "tool-response",
        value: new LanguageModelToolError({
          callID: call.callID,
          name: call.name,
          errorMessage: String(error),
        }),
      });
    }
  }

  result = await session.prompt([{ role: "user", content: responses }]);
}
```

For the shipped structured-output fallback, create a JSON Schema whose `name` is an enum of the currently allowed tools and whose `arguments` is an object. Pass it as `responseConstraint`, parse the returned text, validate the chosen tool's own input schema, authorize the call, invoke `executeTool()`, then prompt the model again with the untrusted result. Restrict this mode to one proposed call per turn unless the user explicitly authorizes a multi-step plan.

## Concrete experiment plan for this repository

### 1. Establish the feature matrix

Use a disposable Chrome profile and this app over HTTPS or localhost. Record:

- Chrome version and OS.
- `typeof LanguageModel`, `await LanguageModel.availability({ expectedInputs: [{type: "text", languages: ["en"]}], expectedOutputs: [{type: "text", languages: ["en"]}] })`.
- Presence of `document.modelContext`, `.getTools`, and `.executeTool`.
- Behavior with WebMCP testing enabled and disabled.
- Behavior with `AIPromptAPIToolUse` enabled and disabled. Chromium's own tests use `--enable-features=AIPromptAPIToolUse`; use this only in the disposable experimental profile.

### 2. Prove each half independently

First list the repository's eight WebMCP tools and manually invoke the read-only `get_workflow_summary` through `executeTool()`. This proves discovery and invocation without an LLM.

Next create a synthetic `echo_value` or calculator declaration directly in the Prompt API and confirm that Nano returns a structured tool call and accepts a tool response. This separates model tool-use failures from WebMCP failures.

### 3. Bridge one read-only tool

Expose only `get_workflow_summary` to Nano. Use deterministic prompts such as “How many nodes are in this workflow?” Capture the proposed call, arguments, raw tool result, and final answer. Require zero mutation and no network access.

### 4. Add one consequential tool with confirmation

Add `apply_workflow_changes`, but stop at a visible confirmation containing the exact commands and base revision. Execute only after a fresh click. Confirm revision-conflict behavior, receipt rendering, cancellation, and that a rejected confirmation produces no state change.

### 5. Test adversarial and failure cases

Cover an unknown tool name, invalid arguments, oversized arguments, tool exception, cancellation, stale revision, malicious instructions in tool output, repeated-call loops, unavailable/downloadable model states, model eviction, unsupported browser, and a cross-origin iframe lacking `language-model` or `tools` delegation.

### 6. Evaluate, do not demo once

Run at least 20 paraphrases each for a read question, an unanswerable question, and a mutation request. Track correct tool selection, schema-valid arguments, unnecessary calls, confirmation bypasses, final-answer accuracy, latency, and completed state verified from the application's receipt. WebMCP's own Chrome guidance recommends probabilistic evals before production ([Chrome WebMCP eval guidance](https://developer.chrome.com/docs/ai/webmcp/evals)).

## Decision

Proceed as a research proof, not a production dependency. The most valuable result is to show that a local on-device model can choose among the app's existing typed WebMCP tools while the application retains authorization, validation, and visible completion evidence. Keep the adapter behind capability checks and preserve the existing manual handler path. Reassess when Chrome documents Prompt API tool use as shipped and when Chrome's Gemini/WebMCP integration has an explicit release status.
