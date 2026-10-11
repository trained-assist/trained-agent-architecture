#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const registry = JSON.parse(await readFile(new URL('../contracts/SANDBOX-LANES.json', import.meta.url), 'utf8'));
if (registry.schemaVersion !== 1 || registry.provider?.kind !== 'cloudflare-workers' || !Array.isArray(registry.lanes)) throw new Error('invalid sandbox lane registry');
const ids = new Set();
const workers = new Set();
for (const lane of registry.lanes) {
  for (const field of ['laneId', 'entrypoint', 'gatewayWorker', 'controlPlaneWorker', 'runnerWorker', 'executionProfile', 'occupancyProbe', 'resetProcedure']) {
    if (typeof lane[field] !== 'string' || !lane[field].trim()) throw new Error(`invalid ${field} for a sandbox lane`);
  }
  if (!Array.isArray(lane.sharedStateGroups) || !lane.sharedStateGroups.length) throw new Error(`missing sharedStateGroups for ${lane.laneId}`);
  if (ids.has(lane.laneId)) throw new Error(`duplicate laneId ${lane.laneId}`);
  ids.add(lane.laneId);
  for (const worker of [lane.gatewayWorker, lane.controlPlaneWorker, lane.runnerWorker]) workers.add(worker);
}
console.log(JSON.stringify({ status: 'ok', lanes: ids.size, workers: workers.size }));
