## Storage notes

- Bundle installs one sqlite backend at `dshHomePath('storages','pentest-sessions.db')` and routes only the `pentest` domain to it; other storage domains keep the host `json` backend.
- Node.js `node:sqlite` is required (host runtime >= 22.5).
- Each record is keyed `sessionId:id`; `pentest_add_goal` wipes only the calling session's rows.
