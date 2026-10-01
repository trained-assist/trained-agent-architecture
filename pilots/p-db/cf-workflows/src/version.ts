// Deploy marker for the cloud smoke test (issue #87 A1).
// The harness rewrites this constant and redeploys while an instance is waiting for a reply;
// the instance then logs PILOT_VERSION in its post-signal steps, which proves whether the
// resumed instance executed the newly deployed code (acceptance criterion "deploy during wait").
export const PILOT_VERSION = 'v1';
