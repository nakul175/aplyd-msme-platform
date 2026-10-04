# Mutation checks

A passing test suite shows that the code agrees with the tests, not that the tests would notice a mistake. A mutation check breaks
the code on purpose (one small change at a time) and runs the tests: if they still pass, either a test is missing or the change
does not matter.

- The tool is [`mutate.py`](mutate.py). Its header says how to run it. Run it on a copy of the working tree.
- Each slice keeps the breaks it ran in `modules/<name>/mutations/*.json`, and its `VALIDATION.md` says how many were caught, which
  survived, and what was done about each survivor.
- The files are a record of what was run at the commit named in `VALIDATION.md`. After the code changes, some `old` strings no
  longer match and the tool prints `SKIP` for them; update the file when that happens rather than ignoring it.
- This is a check the author runs, not a continuous one: nothing in CI runs it, because a run takes tens of minutes on the layers
  that start a Worker.
