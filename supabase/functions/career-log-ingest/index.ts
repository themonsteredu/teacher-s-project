import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "npm:jose@6.1.0";
import postgres from "npm:postgres@3.4.7";

const TEAM_SLUG = "themonsteredu";
const TEAM_ID = "team_XboDIrxx45loHnmZwo54PKam";
const PROJECT_NAME = "teacher-s-project";
const PROJECT_ID = "prj_Cckc9mrsPW5njKmqEohLMAejKEM1";
const EXPECTED_AUDIENCE = `https://vercel.com/${TEAM_SLUG}`;
const ALLOWED_ISSUERS = new Set([
  "https://oidc.vercel.com",
  `https://oidc.vercel.com/${TEAM_SLUG}`,
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROGRAM_REFS = ["history-ai-01", "science-observation-ai-03", "aviation-mobility-01"] as const;
type ProgramRef = (typeof PROGRAM_REFS)[number];

type HubCareerRecord = {
  student_id: string;
  session_ref: string;
  program_ref: ProgramRef;
  occurred_at: string;
  process: string;
  artifact: string | null;
  reflection: string | null;
  source: "hub";
  verification_status: null;
  verified_by: null;
  verified_at: null;
  raw_data: Record<string, unknown>;
  source_event_id: string;
  supersedes_id: null;
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

function nullableText(value: unknown, max: number) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= max ? text : undefined;
}

function validRecord(input: unknown): HubCareerRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const studentId = typeof value.student_id === "string" ? value.student_id.toLowerCase() : "";
  const sessionRef = typeof value.session_ref === "string" ? value.session_ref : "";
  const occurredAt = typeof value.occurred_at === "string" ? new Date(value.occurred_at) : new Date(Number.NaN);
  const process = typeof value.process === "string" ? value.process.trim() : "";
  const artifact = nullableText(value.artifact, 1000);
  const reflection = nullableText(value.reflection, 1000);
  const sourceEventId = typeof value.source_event_id === "string" ? value.source_event_id.trim() : "";
  const rawData = value.raw_data;
  const programRef = typeof value.program_ref === "string" && PROGRAM_REFS.includes(value.program_ref as ProgramRef)
    ? value.program_ref as ProgramRef
    : null;
  const sourceEventSuffix = programRef && sourceEventId.startsWith(`${programRef}:`)
    ? sourceEventId.slice(programRef.length + 1)
    : "";

  if (!UUID_RE.test(studentId)) return null;
  if (!/^hub-board:\d+$/.test(sessionRef)) return null;
  if (!programRef || value.source !== "hub") return null;
  if (!Number.isFinite(occurredAt.getTime()) || Math.abs(Date.now() - occurredAt.getTime()) > 86_400_000) return null;
  if (!process || process.length > 1000 || artifact === undefined || reflection === undefined) return null;
  if (!/^[A-Za-z0-9:_-]{8,260}$/.test(sourceEventSuffix)) return null;
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null;
  if (JSON.stringify(rawData).length > 50_000) return null;
  if (value.verification_status != null || value.verified_by != null || value.verified_at != null) return null;
  if (value.supersedes_id != null) return null;

  return {
    student_id: studentId,
    session_ref: sessionRef,
    program_ref: programRef,
    occurred_at: occurredAt.toISOString(),
    process,
    artifact,
    reflection,
    source: "hub",
    verification_status: null,
    verified_by: null,
    verified_at: null,
    raw_data: rawData as Record<string, unknown>,
    source_event_id: sourceEventId,
    supersedes_id: null,
  };
}

async function verifyVercelOidc(token: string) {
  let issuer = "";
  try {
    issuer = String(decodeJwt(token).iss || "");
  } catch {
    throw new Error("invalid_oidc");
  }
  if (!ALLOWED_ISSUERS.has(issuer)) throw new Error("invalid_oidc");
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
  const { payload } = await jwtVerify(token, jwks, { issuer, audience: EXPECTED_AUDIENCE });
  if (payload.owner_id !== TEAM_ID || payload.project_id !== PROJECT_ID) throw new Error("invalid_oidc");
  const environment = String(payload.environment || "");
  if (environment !== "production" && environment !== "preview") throw new Error("invalid_oidc");
  if (payload.sub !== `owner:${TEAM_SLUG}:project:${PROJECT_NAME}:environment:${environment}`) throw new Error("invalid_oidc");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 65_536) return response(413, { error: "payload_too_large" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  try {
    await verifyVercelOidc(token);
  } catch {
    return response(401, { error: "unauthorized" });
  }

  let record: HubCareerRecord | null = null;
  try {
    record = validRecord(await request.json());
  } catch {
    // 동일한 형식 오류로 처리한다.
  }
  if (!record) return response(400, { error: "invalid_career_record" });

  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!databaseUrl) return response(503, { error: "storage_unavailable" });
  const sql = postgres(databaseUrl, { prepare: false, max: 1, idle_timeout: 2, connect_timeout: 5 });
  try {
    const persist = async (query: typeof sql | postgres.TransactionSql) => {
      const existing = await query<{ id: string; student_id: string }[]>`
        select id, student_id
          from career_log.records
         where source = ${record.source}
           and source_event_id = ${record.source_event_id}
         limit 1
      `;
      if (existing[0]) {
        if (existing[0].student_id !== record.student_id) return response(409, { error: "source_event_conflict" });
        return response(200, { ok: true, duplicate: true, record_id: existing[0].id, student_id: existing[0].student_id });
      }

      await query`insert into career_log.students (id) values (${record.student_id}) on conflict (id) do nothing`;
      const inserted = await query<{ id: string; student_id: string }[]>`
        insert into career_log.records (
          student_id, session_ref, program_ref, occurred_at, process, artifact,
          reflection, source, verification_status, verified_by, verified_at,
          raw_data, source_event_id, supersedes_id
        ) values (
          ${record.student_id}::uuid, ${record.session_ref}, ${record.program_ref},
          ${record.occurred_at}::timestamptz, ${record.process}, ${record.artifact},
          ${record.reflection}, ${record.source}, null, null, null,
          ${query.json(record.raw_data as postgres.JSONValue)}, ${record.source_event_id}, null
        )
        returning id, student_id
      `;
      if (!inserted[0]) return response(503, { error: "career_log_insert_failed" });
      return response(201, { ok: true, duplicate: false, record_id: inserted[0].id, student_id: inserted[0].student_id });
    };
    if (record.program_ref === "aviation-mobility-01") {
      // The existing table has no unique(source, source_event_id) constraint.
      // Serialize this new program's attempts across Edge workers without changing old records.
      // READ COMMITTED makes the post-lock SELECT see the previous writer's commit.
      return await sql.begin("isolation level read committed", async transaction => {
        await transaction`set local lock_timeout = '4s'`;
        await transaction`set local statement_timeout = '5s'`;
        await transaction`select pg_advisory_xact_lock(hashtext(${record.source}), hashtext(${record.source_event_id}))`;
        return persist(transaction);
      });
    }
    return await persist(sql);
  } catch (error) {
    console.error("Career Log database error", error instanceof Error ? error.message : String(error));
    return response(503, { error: "career_log_unavailable" });
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
});
