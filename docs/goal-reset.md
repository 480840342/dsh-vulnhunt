# docs: clarify pentest_add_goal reset behavior

`pentest_add_goal` resets the whole exploration graph of the calling session. A new goal call wipes intents/facts/findings/assets/edges of that session and restarts deterministic counters from `<kind>-1`.

- Any agent with tool access in the session can trigger the wipe — treat it as a privileged destructive operation.
- To preserve data, export via `pentest_state` / `pentest_graph` / `pentest_report` before resetting.
- Cross-session isolation holds: the reset never touches other sessions' rows (keys are `sessionId:id`).

See `src/dsh-pentest/src/store.ts:clearSession` / `initGoal` and `src/dsh-pentest/README.md` § Tools.
