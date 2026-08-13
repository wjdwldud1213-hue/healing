import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types";
import { departmentsRoute } from "./routes/departments";
import { employeesRoute } from "./routes/employees";
import { jobGradesRoute, jobTitlesRoute } from "./routes/reference";
import { rolesRoute } from "./routes/roles";
import { permissionsRoute } from "./routes/permissions";
import { authRoute } from "./routes/auth";
import { leaveRoute } from "./routes/leave";
import { runLeaveAccrualBatch } from "./lib/leaveAccrual";
import { getDb } from "./lib/db";
import type { Bindings } from "./types";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://healingfood.healingfood.workers.dev",
    ],
    credentials: true,
  }),
);

// 이 값은 각 라우트에 걸린 requireAuth 미들웨어가 로그인 세션을 확인한 뒤
// 실제 사번으로 덮어쓴다. 로그인 없이 접근 가능한 라우트에서는 항상 null이다.
app.use("*", async (c, next) => {
  c.set("currentUserId", null);
  await next();
});

app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", authRoute);
app.route("/departments", departmentsRoute);
app.route("/employees", employeesRoute);
app.route("/job-grades", jobGradesRoute);
app.route("/job-titles", jobTitlesRoute);
app.route("/roles", rolesRoute);
app.route("/permissions", permissionsRoute);
app.route("/leave", leaveRoute);

export default {
  fetch: app.fetch,
  // 매일 KST 00:00(UTC 15:00, wrangler.toml의 crons 설정)에 Cloudflare가 자동으로 호출한다.
  // 1년 미만 직원 월 연차 + 1월 1일 연간 연차 발생을 한 번에 처리한다(leaveAccrual.ts).
  async scheduled(_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) {
    const db = getDb(env.DB);
    await runLeaveAccrualBatch(db);
  },
};
