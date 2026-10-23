const hostport = process.env.BILLOPS_WEB_HOSTPORT?.trim();
const secret = process.env.CRON_SECRET?.trim();

const ENDPOINTS = ["/api/cron/daily", "/api/worker/email"];

async function hit(base, bearer, path) {
  const response = await fetch(`http://${base}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}` },
  });
  const text = await response.text();
  console.log(`[BillOps] ${path} -> ${response.status} ${text.slice(0, 500)}`);
  return response.ok;
}

async function main() {
  if (!hostport) throw new Error("BILLOPS_WEB_HOSTPORT is not set");
  if (!secret) throw new Error("CRON_SECRET is not set");

  let ok = true;
  for (const path of ENDPOINTS) {
    try {
      if (!(await hit(hostport, secret, path))) ok = false;
    } catch (error) {
      console.error(
        `[BillOps] ${path} failed: ${error instanceof Error ? error.message : error}`,
      );
      ok = false;
    }
  }

  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    `[BillOps] scheduler run failed: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
});
