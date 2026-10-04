#!/usr/bin/env python3
"""Mutation checks: break the code on purpose and see whether the tests notice.

    python3 scripts/mutation/mutate.py <repo> <mutations.json>

<repo> is a directory holding a checkout of this repository with its dependencies installed (and, for the smoke and browser
layers, a build). Run it on a COPY of your working tree, not on the tree you are editing: the tool rewrites source files while
it runs and puts each one back afterwards, and a run that is killed can leave a file broken (it restores on exit and on
Ctrl-C, not on a hard kill).

<mutations.json> is a list of {name, path, old, new, layers, only?}. For each one the tool replaces the first occurrence of
`old` in `path` (relative to <repo>) with `new`, runs `node scripts/test.mjs <layers> [--only <ids>]` and prints

    CAUGHT   <name>     the tests failed, as they should
    SURVIVED <name>     every test passed with the code broken: a test is missing, or the break changes nothing that matters
    SKIP     <name>     `old` was not found (the code has changed since the file was written)

A survivor is not always a gap: a break can be equivalent to the code (nothing observable changes). Each slice's VALIDATION.md
says which survivors were closed with a test and which were shown to be equivalent. The exit code is 0 whatever the results;
read the printout.
"""
import json
import os
import signal
import subprocess
import sys


def run(layers, only=None):
    cmd = ["node", "scripts/test.mjs", *layers] + (["--only", ",".join(only)] if only else [])
    return subprocess.run(cmd, capture_output=True, text=True).returncode


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    root, mutations = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    os.chdir(root)
    with open(mutations) as f:
        items = json.load(f)

    current = {"path": None, "text": None}

    def restore(*_):
        if current["path"] is not None:
            with open(current["path"], "w") as f:
                f.write(current["text"])
            current["path"] = None

    signal.signal(signal.SIGINT, lambda *a: (restore(), sys.exit(130)))
    signal.signal(signal.SIGTERM, lambda *a: (restore(), sys.exit(143)))

    for m in items:
        with open(m["path"]) as f:
            text = f.read()
        if m["old"] not in text:
            print(f"SKIP     {m['name']}: pattern not found", flush=True)
            continue
        current.update(path=m["path"], text=text)
        try:
            with open(m["path"], "w") as f:
                f.write(text.replace(m["old"], m["new"], 1))
            code = run(m["layers"], m.get("only"))
        finally:
            restore()
        print(("CAUGHT   " if code != 0 else "SURVIVED ") + m["name"], flush=True)


if __name__ == "__main__":
    main()
