## Pentest mode quick start

1. In the new session picker, choose **渗透模式**.
2. State your target and objective (and authorization note):
   `pentest_add_goal { target: "example.com", objective: "map web surface", authorization: "CTO written approval #123" }`
3. Create intents anchored to the goal: `pentest_add_intent { goalId: "goal-1", title: "enumerate endpoints" }`
4. Record facts/assets/findings as subagents return, or let the commander delegate via `subagent` / `subagent_fork` and have children call `pentest_submit`.
5. Review `pentest_state` / `pentest_graph` during the run; finish with `pentest_report` for a Markdown report with reproducible steps and the asset graph.

The Web **渗透** tab (per-session) shows the same graph live: chain / findings / assets / report.
