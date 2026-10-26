import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Evidence = {
  path: string;
  symbol: string;
  line: number;
  revision: string;
  note: string;
};
type Observation = { at: string; run: string; note: string };
type Finding = {
  id: string;
  term: string;
  title: string;
  state: string;
  priority: string;
  rationale: string;
  confidence: string;
  effort: string;
  problem: string;
  consequence: string;
  direction: string;
  counterevidence: string;
  nextCheck: string;
  evidence: Evidence[];
  observations: Observation[];
};
type Run = {
  id: string;
  at: string;
  phase: string;
  revision: string;
  dirtyPaths: string[];
  scope: string[];
  gaps: string[];
  summary: string;
};
type Decision = { at: string; finding: string; choice: string; reconsiderWhen: string };
export type Dossier = {
  version: 1;
  project: string;
  repositoryUrl: string;
  timezone: string;
  summary: string;
  changes: string[];
  runs: Run[];
  findings: Finding[];
  decisions: Decision[];
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a record");
  }
  return value as Record<string, unknown>;
}

function strings(value: unknown): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Expected an array of strings");
  }
}

function fields(value: Record<string, unknown>, names: string[]): void {
  for (const name of names) {
    if (typeof value[name] !== "string" || !(value[name] as string).trim()) {
      throw new Error(`Missing text field: ${name}`);
    }
  }
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of records");
  }
  return value.map(object);
}

function timestamp(value: unknown): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("Invalid evidence timestamp");
  }
}

function revision(value: unknown): void {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error("Evidence needs an immutable full Git revision");
  }
}

export function validateDossier(value: unknown, terms: Set<string>): Dossier {
  const dossier = object(value);
  if (dossier.version !== 1) {
    throw new Error("Unsupported dossier version");
  }
  fields(dossier, ["project", "repositoryUrl", "timezone", "summary"]);
  const repository = new URL(dossier.repositoryUrl as string);
  if (
    repository.protocol !== "https:" ||
    repository.username ||
    repository.password ||
    repository.search ||
    repository.hash
  ) {
    throw new Error("Repository URL must be an ordinary HTTPS repository URL");
  }
  new Intl.DateTimeFormat("en", { timeZone: dossier.timezone as string });
  strings(dossier.changes);
  const runIds = new Set<string>();
  for (const run of records(dossier.runs)) {
    fields(run, ["id", "at", "phase", "revision", "summary"]);
    if (runIds.has(run.id as string)) {
      throw new Error("Duplicate run ID");
    }
    runIds.add(run.id as string);
    if (!["discover", "investigate", "reconcile"].includes(run.phase as string)) {
      throw new Error("Unknown review phase");
    }
    timestamp(run.at);
    revision(run.revision);
    for (const key of ["dirtyPaths", "scope", "gaps"]) {
      strings(run[key]);
    }
  }
  const findingIds = new Set<string>();
  for (const finding of records(dossier.findings)) {
    fields(finding, [
      "id",
      "term",
      "title",
      "state",
      "priority",
      "rationale",
      "confidence",
      "effort",
      "problem",
      "consequence",
      "direction",
      "counterevidence",
      "nextCheck",
    ]);
    if (!/^G-\d{3,}$/.test(finding.id as string) || findingIds.has(finding.id as string)) {
      throw new Error("Finding IDs must be stable and unique");
    }
    findingIds.add(finding.id as string);
    if (!terms.has(finding.term as string)) {
      throw new Error(`Unknown glossary term: ${finding.term}`);
    }
    if (
      !["candidate", "supported", "deferred", "dismissed", "resolved"].includes(
        finding.state as string,
      )
    ) {
      throw new Error("Unknown finding state");
    }
    for (const key of ["priority", "confidence"]) {
      if (!["high", "medium", "low"].includes(finding[key] as string)) {
        throw new Error(`Unknown ${key}`);
      }
    }
    const evidence = records(finding.evidence);
    if (finding.state === "supported" && evidence.length === 0) {
      throw new Error("Supported findings require source evidence");
    }
    for (const item of evidence) {
      fields(item, ["path", "symbol", "revision", "note"]);
      if (!Number.isInteger(item.line) || (item.line as number) < 1) {
        throw new Error("Evidence line must be a positive integer");
      }
      if (
        !/^[\w./-]+$/.test(item.path as string) ||
        (item.path as string).split("/").includes("..") ||
        (item.path as string).startsWith("/")
      ) {
        throw new Error("Evidence path must be repository-relative");
      }
      revision(item.revision);
    }
    for (const observation of records(finding.observations)) {
      fields(observation, ["at", "run", "note"]);
      timestamp(observation.at);
      if (!runIds.has(observation.run as string)) {
        throw new Error("Observation refers to an unknown run");
      }
    }
  }
  for (const decision of records(dossier.decisions)) {
    fields(decision, ["at", "finding", "choice", "reconsiderWhen"]);
    timestamp(decision.at);
    if (!findingIds.has(decision.finding as string)) {
      throw new Error("Decision refers to an unknown finding");
    }
  }
  return value as Dossier;
}

export function renderReport(dossier: Dossier, glossary: unknown, template: string): string {
  const marker = "{{REPORT_DATA}}";
  if (template.split(marker).length !== 2) {
    throw new Error("Report template needs exactly one data marker");
  }
  const json = JSON.stringify({ dossier, glossary })
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return template.replace(marker, () => json);
}

async function regular(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Expected a regular file: ${path}`);
  }
}

export async function writeReport(input: string, output: string): Promise<void> {
  if (resolve(input) === resolve(output)) {
    throw new Error("Report cannot overwrite the dossier");
  }
  await regular(input);
  const parent = await lstat(dirname(output));
  if (!parent.isDirectory() || parent.isSymbolicLink()) {
    throw new Error("Report directory must be a real directory");
  }
  try {
    await regular(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  const skill = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const glossary = JSON.parse(await readFile(join(skill, "references/glossary.json"), "utf8")) as {
    term: string;
  }[];
  const dossier = validateDossier(
    JSON.parse(await readFile(input, "utf8")),
    new Set(glossary.map((entry) => entry.term)),
  );
  const html = renderReport(
    dossier,
    glossary,
    await readFile(join(skill, "templates/report.html"), "utf8"),
  );
  const staging = `${output}.${process.pid}.next`;
  try {
    await writeFile(staging, html, { mode: 0o600, flag: "wx" });
    await rename(staging, output);
  } finally {
    await unlink(staging).catch(() => {});
  }
}

if (import.meta.main) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    throw new Error("Usage: bun render-report.ts dossier.json report.html");
  }
  await writeReport(input, output);
  console.log(`Gardening report: ${resolve(output)}`);
}
