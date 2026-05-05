// Shared types mirroring the snapshot.json schema produced by the exporter.

export interface Device {
  device_id: number;
  hostname: string;
  sysName: string | null;
  ip: string | null;
  location: string | null;
  type: string | null;
  os: string | null;
  hardware: string | null;
  vendor: string | null;
  status: number;
  status_type: string;
  ignore: number;
  disabled: number;
  uptime: number | null;
  last_polled: string | null;
  sysDescr: string | null;
  purpose: string | null;
  asset_tag: string | null;
}

export interface Edge {
  id: number;
  a: number;
  b: number;
  a_port: number | null;
  b_port: number | null;
  protocol: string | null;
}

export interface GhostEndpoint {
  id: number;
  device_id: number;
  port_id: number | null;
  remote_hostname: string;
  remote_port: string;
  platform: string | null;
  protocol: string | null;
}

// Endpoint = an IP/MAC harvested from `ip_mac` (Observium ARP/bridge tables).
// `device_id` is the *managed* switch the endpoint was learned on (or null if
// that switch is outside our exported set). `hostname` is populated from the
// reverse-DNS cache when available.
export interface Endpoint {
  id: number;
  device_id: number | null;
  port_id: number | null;
  ifIndex: number | null;
  mac: string;
  ip: string;
  ip_version: number | null;
  hostname: string | null;
}

export interface TreeNode {
  id: string;
  name: string;
  device_ids: number[];
  children: TreeNode[];
}

export type TreeSource = "location" | "groups" | "topology";

export interface Snapshot {
  meta: {
    generated_at: number;
    device_count: number;
    edge_count: number;
    ghost_endpoint_count: number;
    endpoint_count?: number;
    endpoint_resolved?: number;
  };
  devices: Device[];
  edges: Edge[];
  ghost_endpoints: GhostEndpoint[];
  endpoints?: Endpoint[];
  trees: Record<TreeSource, TreeNode>;
}

export interface DeviceDetail {
  device: Device;
  ports: Port[];
  neighbours: NeighbourRow[];
  processors: Processor[];
  mempools: Mempool[];
  endpoints?: Endpoint[];
}

export interface Port {
  port_id: number;
  device_id: number;
  ifIndex: string | number | null;
  ifName: string | null;
  ifDescr: string | null;
  ifAlias: string | null;
  ifType: string | null;
  ifSpeed: number | null;
  ifHighSpeed: number | null;
  ifMtu: number | null;
  ifOperStatus: string | null;
  ifAdminStatus: string | null;
  ifPhysAddress: string | null;
  ifVlan: string | null;
  ifInOctets_rate: number | null;
  ifOutOctets_rate: number | null;
  ignore: number;
  disabled: number;
  deleted: number;
  port_label: string | null;
  port_label_short: string | null;
}

export interface NeighbourRow {
  neighbour_id: number;
  device_id: number | null;
  port_id: number | null;
  remote_device_id: number | null;
  remote_port_id: number | null;
  active: number;
  protocol: string | null;
  remote_hostname: string;
  remote_port: string;
  remote_platform: string | null;
  remote_address: string | null;
}

export interface Processor {
  processor_id: number;
  processor_type: string;
  processor_descr: string;
  processor_usage: number;
  processor_polled: number;
}

export interface Mempool {
  mempool_id: number;
  mempool_descr: string;
  mempool_perc: number;
  mempool_used: number;
  mempool_total: number;
  mempool_polled: number;
}

export interface MeUser {
  username: string;
  level: number;
}
