#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const registryPath = new URL('../contracts/SANDBOX-LANES.json', import.meta.url);
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
const accountId = registry.provider?.accountId;
if (registry.schemaVersion !== 1 || registry.provider?.kind !== 'cloudflare-workers' || typeof accountId !== 'string') throw new Error('invalid sandbox lane registry');

const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, {
  headers: { authorization: `Bearer ${token}` },
});
const payload = await response.json();
if (!response.ok || !payload.success || !Array.isArray(payload.result)) throw new Error('Cloudflare Workers list failed');
const deployed = new Set(payload.result.map((script) => script.id).filter((id) => typeof id === 'string'));
const declared = new Set(registry.lanes.flatMap((lane) => [lane.gatewayWorker, lane.controlPlaneWorker, lane.runnerWorker]));
const lanes = registry.lanes.map((lane) => ({ ...lane, status: [lane.gatewayWorker, lane.controlPlaneWorker, lane.runnerWorker].every((worker) => deployed.has(worker)) ? 'known' : 'incomplete' }));
const unclassified = [...deployed].filter((worker) => worker.includes('sandbox') && !declared.has(worker)).sort();
console.log(JSON.stringify({ schemaVersion: 1, accountId, lanes, unclassifiedWorkers: unclassified }, null, 2));
