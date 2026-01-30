# Perplexica "is empty" Error - Debug Findings

**Date:** 2026-01-30
**Error:** `Error: is empty`
**Status:** Root cause identified

---

## Error Summary

Perplexica intermittently crashes with an unhandled promise rejection error: `Error: is empty`

### Error Stack Trace
```
⨯ unhandledRejection: Error: is empty
    at <unknown> (webpack://perplexica/src/lib/models/providers/openai/openaiLLM.ts:184:35)
    at Array.map (<anonymous>)
    at q.streamText (webpack://perplexica/src/lib/models/providers/openai/openaiLLM.ts:170:24)
    at async i.research (webpack://perplexica/src/lib/agents/search/researcher/index.ts:86:24)
    at async m.searchAsync (webpack://perplexica/src/lib/agents/search/index.ts:92:44)
  182 |                 return {
  183 |                   ...existingCall,
> 184 |                   arguments: parse(existingCall.arguments),
      |                                   ^
  185 |                 };
  186 |               }
  187 |             }) || [],
```

---

## Root Cause

The error occurs in `openaiLLM.ts:184` when processing **streaming tool calls** from LLM responses.

### The Problem

When LLMs stream tool calls, they send the data incrementally in chunks:

**Chunk 1 (17:19:29.849):**
```json
{
  "tool_calls": [{
    "id": "tooluse_-D2zIhePTqSQgXm7NPFUAw",
    "function": {
      "name": "web_search",
      "arguments": ""  // ← EMPTY on first chunk
    },
    "type": "function",
    "index": 0
  }]
}
```

**Chunk 2 (17:19:29.852):**
```json
{
  "tool_calls": [{
    "id": null,
    "function": {
      "name": null,
      "arguments": "{\"que"  // ← Partial JSON
    }
  }]
}
```

**Subsequent Chunks:**
Arguments continue streaming: `'{"query":'` → `'{"query":"news"}'`

### Code Issue

At `openaiLLM.ts:184`, the code attempts to parse the arguments on **every chunk**:

```typescript
arguments: parse(existingCall.arguments),
```

When the first chunk arrives with `arguments: ""` (empty string), the `parse()` function throws:
```
Error: is empty
```

This is because the code doesn't check if:
1. The arguments field is empty/incomplete before parsing
2. The JSON is valid before attempting to parse
3. The streaming is still in progress

---

## Affected Code Flow

```
/api/chat endpoint (POST request)
  ↓
search/index.ts:92 - searchAsync()
  ↓
researcher/index.ts:86 - research()
  ↓
openaiLLM.ts:170 - streamText()
  ↓
openaiLLM.ts:184 - parse(existingCall.arguments) ← FAILS HERE
```

---

## LiteLLM Log Evidence

**Time:** 2026-01-30 17:19:29

**Initial Tool Call Announcement (empty arguments):**
```json
{
  "message": "async_data_generator: received streaming chunk",
  "level": "DEBUG",
  "timestamp": "2026-01-30T17:19:29.849376",
  "tool_calls": [
    {
      "id": "tooluse_-D2zIhePTqSQgXm7NPFUAw",
      "function": {
        "arguments": "",
        "name": "web_search"
      }
    }
  ]
}
```

**Subsequent Chunk (arguments start streaming):**
```json
{
  "message": "async_data_generator: received streaming chunk",
  "level": "DEBUG",
  "timestamp": "2026-01-30T17:19:29.852971",
  "tool_calls": [
    {
      "function": {
        "arguments": "{\"que",
        "name": null
      }
    }
  ]
}
```

---

## The Fix Needed

The `openaiLLM.ts` code needs to handle streaming tool calls properly:

### Option 1: Skip Empty Arguments
```typescript
if (existingCall.arguments && existingCall.arguments.trim() !== '') {
  return {
    ...existingCall,
    arguments: parse(existingCall.arguments),
  };
}
// Return without parsing if arguments are empty
return existingCall;
```

### Option 2: Safe Parse with Try-Catch
```typescript
try {
  return {
    ...existingCall,
    arguments: parse(existingCall.arguments || '{}'),
  };
} catch (error) {
  // Log warning but don't crash - arguments may still be streaming
  console.warn('Failed to parse tool call arguments (may be incomplete):', error);
  return existingCall;
}
```

### Option 3: Accumulate Before Parsing
Wait for the entire argument string to be received before parsing (check for `finish_reason` or complete JSON).

---

## Debugging Configuration Applied

To get these detailed traces, the following was configured:

### Perplexica Container
- `NODE_ENV: 'development'`
- `LOG_LEVEL: 'debug'`
- `NODE_OPTIONS: '--enable-source-maps --trace-warnings --trace-uncaught'`
- `DEBUG: '*'`
- `VERBOSE: 'true'`

### Next.js Configuration (next.config.mjs)
- `productionBrowserSourceMaps: true`
- `webpack.devtool: 'source-map'`

### LiteLLM Container
- `LITELLM_LOG: 'DEBUG'`
- `SET_VERBOSE: 'True'`
- `JSON_LOGS: 'True'`

### SearXNG Container
- `LITELLM_LOG: 'DEBUG'`
- `JSON_LOGS: 'True'`

---

## Frequency of Error

Error occurs during normal search operations when:
- User submits a query requiring web search
- LLM attempts to call the `web_search` tool
- The streaming response sends tool call metadata before arguments

**Observed Occurrences:**
- 2026-01-30 15:58:54
- 2026-01-30 16:07:27
- 2026-01-30 16:41:41
- 2026-01-30 16:43:14
- 2026-01-30 16:46:32
- 2026-01-30 17:13:31
- 2026-01-30 17:19:30

---

## CloudWatch Log Groups

**Perplexica Logs:**
- `PerplexicaStack-PerplexicaTaskDefperplexicaLogGroup808052E0-iCgI98UPjnzF`

**LiteLLM Logs:**
- Check CloudWatch for litellm log groups

**Search Pattern:**
```bash
aws logs filter-log-events \
  --log-group-name "<LOG_GROUP>" \
  --filter-pattern "is empty" \
  --start-time <EPOCH_MS>
```

---

## Next Steps

1. **Immediate Fix**: Patch `src/lib/models/providers/openai/openaiLLM.ts:184` to handle empty/incomplete arguments
2. **Testing**: Verify the fix handles all streaming scenarios:
   - Empty arguments
   - Partial JSON
   - Multiple tool calls
   - Complete arguments
3. **Upstream**: Consider opening an issue/PR with the Perplexica project
4. **Monitoring**: Keep debug logging enabled until fix is confirmed stable

---

## Related Files

- `src/lib/models/providers/openai/openaiLLM.ts` (line 170-187)
- `src/lib/agents/search/researcher/index.ts` (line 86)
- `src/lib/agents/search/index.ts` (line 92)
- `config/next.config.mjs`
- `config/perplexity-entrypoint.sh`
- `lib/perplexica-stack.ts`

---

## Additional Notes

- The error is **not** related to the LiteLLM or Bedrock configuration
- The error is **not** related to the LLM model itself
- The error is a **client-side parsing issue** in Perplexica's streaming handler
- This is a race condition that occurs when processing incremental streaming chunks

---

**End of Report**
