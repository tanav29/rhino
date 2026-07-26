Fix the top 3 React Doctor issues in wterm on this pass — leave the rest for a follow-up.

1. WARN Security: Weak localhost native bridge boundary (×1)
   Code appears to bridge browser code to localhost/native capabilities with weak origin or update/install checks.
   Curl with no cache & follow the canonical fix and false positive check recipe before fixing: https://react.doctor/docs/rules/react-doctor/local-rpc-native-bridge-risk
   - server.ts:4
2. WARN Performance: await inside a loop (×1)
   This makes the for…of loop slow because each await runs one after another, so collect the independent calls & run them together with `await Promise.all(items.map(...))`
   Curl with no cache & follow the canonical fix and false positive check recipe before fixing: https://react.doctor/docs/rules/react-doctor/async-await-in-loop
   - server.ts:36
3. WARN Performance: Chained array iterations (×1)
   This loops over your list twice because .filter().map() makes two passes, so do it in one pass with .reduce() or a for...of loop
   Curl with no cache & follow the canonical fix and false positive check recipe before fixing: https://react.doctor/docs/rules/react-doctor/js-combine-iterations
   - server.ts:361

Full results for all 42 issues (diagnostics.json + a .txt per rule): C:\Users\TANAVP~1\AppData\Local\Temp\react-doctor-39b63f64-9edf-4e37-bc4c-f7071c1dd828

Read each file and fix the root cause — don't suppress or silence the rule.

Findings that share a `fixGroupId` (in diagnostics.json) are one root cause — a single fix clears all of them, so treat each `fixGroupId` as ONE task, not one per site.

Verify against the real thing, don't assume: confirm each change matches the canonical fix recipe you fetched for that rule, then re-run `npx react-doctor@latest --verbose` and check the issue is actually gone against the real tool before moving on.

Teach me as you go: for every issue you touch, explain it in plain language (no jargon) — what the problem is, why it's a problem, and how serious it is in human terms. Describe the real-world impact and severity concretely (e.g. "this crashes the page for users on Safari" vs. "this is a minor cleanup with no user impact") so I understand why it matters, not just what changed.

Then work through the rest from the full results above.
