import { loadEnv } from "./load-env";
import { getDb, one } from "../src/lib/db";
import { ensureCycles } from "../src/lib/engine";
import { currentMonthKey } from "../src/lib/dates";

loadEnv();

function main() {
  getDb();
  const month = currentMonthKey();
  const created = ensureCycles(month);

  const bills = one<{ count: number }>("SELECT COUNT(*) AS count FROM bills");
  const users = one<{ count: number }>("SELECT COUNT(*) AS count FROM users");

  console.log("[BillOps] Database ready.");
  console.log(`[BillOps] Users: ${Number(users?.count ?? 0)}`);
  console.log(`[BillOps] Bills: ${Number(bills?.count ?? 0)}`);
  console.log(`[BillOps] Cycles created for ${month}: ${created}`);
  console.log(
    `[BillOps] Sign in with ${process.env.BILLOPS_ADMIN_EMAIL || "admin@billops.local"}`,
  );
}

main();
