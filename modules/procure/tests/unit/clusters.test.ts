import assert from "node:assert/strict";
import { test } from "node:test";
import { CLUSTERS, clusterLabel, isCluster } from "../../src/clusters.ts";

test("only a listed cluster id is a cluster, and every cluster says it is SYNTHETIC", () => {
  for (const c of CLUSTERS) {
    assert.equal(isCluster(c.id), true);
    assert.match(c.label, /SYNTHETIC/);
    assert.equal(clusterLabel(c.id), c.label);
  }
  for (const bad of ["", " synthetic-cluster-1", "SYNTHETIC-CLUSTER-1", "synthetic-cluster-9", "__proto__", "toString", "constructor", undefined, null, 1, {}, ["synthetic-cluster-1"]]) {
    assert.equal(isCluster(bad), false, String(bad));
  }
});

test("a cluster id is not shown as a label by accident", () => {
  assert.equal(clusterLabel("nowhere"), "nowhere");
});
