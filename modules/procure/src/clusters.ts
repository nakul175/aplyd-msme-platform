// The clusters an owner can ask for a requirement in. SYNTHETIC: the first sector and cluster have not been chosen (OQ-03),
// so these are three invented places. A requirement is pooled only with others in the same cluster.
export const CLUSTERS = [
  { id: "synthetic-cluster-1", label: "SYNTHETIC cluster 1" },
  { id: "synthetic-cluster-2", label: "SYNTHETIC cluster 2" },
  { id: "synthetic-cluster-3", label: "SYNTHETIC cluster 3" },
] as const;

export type ClusterId = (typeof CLUSTERS)[number]["id"];

export const isCluster = (value: unknown): value is ClusterId => typeof value === "string" && CLUSTERS.some((c) => c.id === value);

export const clusterLabel = (id: string): string => CLUSTERS.find((c) => c.id === id)?.label ?? id;
