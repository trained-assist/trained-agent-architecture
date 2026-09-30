// Executor process: launches DBOS (which recovers PENDING workflows of this executor)
// and dequeues from the pilot queue. Killed with kill -9 by the driver.
import { DBOS } from '@dbos-inc/dbos-sdk';
import { makePool, migrate, DB_URL } from './taskstore';
import { definePlan } from './workflow';
import { QUEUE, APP } from './port';

async function main() {
  const pool = makePool();
  await migrate(pool);
  DBOS.setConfig({ name: APP, systemDatabaseUrl: DB_URL, applicationVersion: 'pilot-v1', logLevel: 'warn' } as any);
  definePlan(pool);
  await DBOS.launch();
  await DBOS.registerQueue(QUEUE, { minPollingIntervalMs: 200 } as any);
  console.log(new Date().toISOString(), `[exec ${process.pid}] READY`);
}
main().catch(e => { console.error('executor failed', e); process.exit(1); });
