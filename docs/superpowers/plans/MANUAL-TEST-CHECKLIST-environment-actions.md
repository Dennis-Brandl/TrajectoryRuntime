# Manual Test Checklist — Environment Actions (Phase 1)

Setup:
1. TrajectoryActions container running on `http://localhost:3002`.
2. Deploy kitchen scenario: `cd C:\Trajectory\TrajectoryActions && npx tsx scripts/scenarios/cli.ts deploy kitchen --server http://localhost:3002`
3. A workflow `.WFmasterX` package with at least one ACTION PROXY step referencing the kitchen environment.
4. Web-UI dev server running: `cd engines/web-ui && npm run dev` (typically on :5173).

Server picker:
- [ ] Open a workflow with one registered server → no picker appears (silent bind).
- [ ] Open a workflow with two registered servers → picker appears, both listed with name/uri/description.
- [ ] Click "Abandon workflow" on the picker → workflow does not start; UI returns to the start screen.
- [ ] Pick a server → workflow starts and the action step appears with "Connecting…" then "Starting"/"Running".
- [ ] Open a workflow with zero registered servers → ad-hoc URI picker appears with a text input.
- [ ] Enter an invalid URL → "Connect" button is disabled and red helper text appears.
- [ ] Enter a valid URL and click Connect → workflow starts.

Action step card:
- [ ] Card shows the step's local_id as title.
- [ ] Card shows current state label ("Starting", "Running", etc.).
- [ ] Card shows the resolved input parameters.
- [ ] Action self-pauses with HELD → card shows "Held" in warning color.
- [ ] Action resumes from HELD on its own → label returns to "Running" automatically.

Command dropdown:
- [ ] While Running → dropdown shows PAUSE, HOLD, ABORT, STOP.
- [ ] While Paused → dropdown shows RESUME, ABORT, STOP.
- [ ] While Held → dropdown shows ONLY STOP and ABORT.
- [ ] After Completed → dropdown shows CLEAR.
- [ ] After ABORT click → toast appears if 409; otherwise card moves to ABORTED state.
- [ ] Opaque action → dropdown shows only ABORT regardless of state.

Reload mid-flight:
- [ ] Start a long-running action, reload the browser → card reappears in last-known state and SSE reconnects.
  (NOTE: Phase 1 implements the reconnectPersistedInstances() hook on the coordinator but does not wire it into a workflow-rehydrate path yet — this checkbox covers a future activation.)
- [ ] Delete the instance via curl while reloaded → card transitions to "Instance lost on server".

Abandon workflow:
- [ ] Click Abandon while an ACTION PROXY is RUNNING → all active instances receive ABORT then DELETE; instance ids disappear from the server.
- [ ] Use `curl http://localhost:3002/trajectory/v1/instances?status=active` before and after to verify cleanup.

Log panel:
- [ ] Open StepDetailPopup for a Running ACTION PROXY → log panel shows messages or "No log messages."
- [ ] Trigger an action that emits stderr → message appears in red.
