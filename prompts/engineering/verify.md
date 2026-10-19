# Verify result

Issue: {{ISSUE_URL}}
Implementation revision: {{IMPLEMENTATION_REF}}
Target: {{TARGET}}
Read DoD, scenarios, diff and Environment Contract. Map requirements to checks.
Report semantic fit, component probes, E2E and production verification separately:
PASS/FAIL/UNCLEAR or justified N/A. Verify actual output/publication readback,
revision and IDs, not just terminal success/HTTP 200. Sandbox PASS is not
production PASS. Record evidence in owning issue.

For #285 require at least three consecutive successful Run requests on the agreed
test account, each with its own ID and verified outcome. An intentional publication
in a separate test is not an accidental duplicate; check extra effects within each
request/retry. Failure resets the consecutive-success count; preserve failed runs.
