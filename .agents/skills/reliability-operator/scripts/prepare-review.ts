import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, unlink, writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";

const DAY = 86_400_000;
const STORE = { kind: "reliability-operator-state", version: 1 };
const CATEGORIES = ["journal", "incidents", "decisions", "merges", "postmortems"];

export function calendarDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  const date = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return date;
}

export function todayInZone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// Check every ancestor, including existing ancestors of a newly initialized store.
async function directory(path: string, create = false): Promise<void> {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const segment of absolute
    .slice(current.length)
    .split(/[/\\]/)
    .filter(Boolean)) {
    current = join(current, segment);
    if (!(await pathExists(current)) && create) {
      await mkdir(current, { mode: 0o700 });
    }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Expected a directory without symlinks: ${current}`);
    }
  }
}

async function regularFile(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`Expected a regular file: ${path}`);
    }
    return { contents: await handle.readFile("utf8"), ino: stat.ino, dev: stat.dev };
  } finally {
    await handle.close();
  }
}

async function ensureStore(root: string, initialize: boolean) {
  const marker = join(root, "state.json");
  if (!(await pathExists(marker))) {
    if (!initialize) {
      throw new Error("State store is not initialized; explicitly use --init for a new store.");
    }
    for (const category of CATEGORIES) {
      const path = join(root, category);
      if (await pathExists(path)) {
        await directory(path);
        if ((await readdir(path)).length > 0) {
          throw new Error(`Refusing to adopt an unmarked nonempty state directory: ${category}`);
        }
      }
    }
    await writeFile(marker, `${JSON.stringify(STORE)}\n`, { flag: "wx", mode: 0o600 });
  }
  const value = JSON.parse((await regularFile(marker)).contents);
  if (value?.kind !== STORE.kind || value?.version !== STORE.version) {
    throw new Error("State marker does not identify a supported reliability-operator store.");
  }
  for (const category of CATEGORIES) {
    await directory(join(root, category), initialize);
  }
  if (initialize && !(await pathExists(join(root, "overview.md")))) {
    await writeFile(
      join(root, "overview.md"),
      "# Reliability overview\n\nNo operational review has run. Health and source access are unverified.\n\n## Active work\n\nNone recorded.\n\n## Pending decisions\n\nSee policy.md for initial configuration gaps.\n\n## Source coverage and collection cursors\n\nNo sources collected.\n",
      { flag: "wx", mode: 0o600 },
    );
  }
}

function disposable(contents: string): boolean {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(contents)?.[1];
  const lines = frontmatter?.split(/\r?\n/).filter((line) => /^retention\s*:/.test(line));
  return lines?.length === 1 && lines[0] === "retention: disposable";
}

export type PrepareOptions = {
  stateDir: string;
  initialize?: boolean;
  apply?: boolean;
  today?: string;
  timezone?: string;
};

export async function prepareReview(options: PrepareOptions) {
  const timezone = options.timezone ?? "UTC";
  const localToday = todayInZone(timezone);
  const today = options.today ?? localToday;
  // Keep today and the preceding thirteen calendar dates, independent of DST.
  const cutoff = calendarDate(today) - 13 * DAY;
  const root = resolve(options.stateDir);
  if (root === parse(root).root) {
    throw new Error("The filesystem root cannot be a state store.");
  }
  await directory(root, options.initialize);
  const lockPath = join(root, ".prepare.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        "Preparation lock already exists; inspect its owner rather than stopping an agent.",
      );
    }
    throw error;
  }
  try {
    await lock.writeFile(`pid=${process.pid}\n`);
    await ensureStore(root, options.initialize ?? false);
    const journal = join(root, "journal");
    const result = {
      stateDir: root,
      today,
      timezone,
      keepFrom: new Date(cutoff).toISOString().slice(0, 10),
      apply: options.apply ?? false,
      eligible: [] as string[],
      held: [] as string[],
      deleted: [] as string[],
    };
    const snapshots = new Map<string, Awaited<ReturnType<typeof regularFile>>>();
    for (const name of (await readdir(journal)).sort()) {
      if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) {
        continue;
      }
      let date;
      try {
        date = calendarDate(name.slice(0, -3));
      } catch {
        continue;
      }
      if (date >= cutoff) {
        continue;
      }
      const path = join(journal, name);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        continue;
      }
      const snapshot = await regularFile(path);
      if (!disposable(snapshot.contents)) {
        result.held.push(name);
        continue;
      }
      result.eligible.push(name);
      snapshots.set(name, snapshot);
    }
    if (options.apply) {
      for (const name of result.eligible) {
        await directory(journal);
        const path = join(journal, name);
        const current = await regularFile(path);
        const previous = snapshots.get(name)!;
        if (
          current.ino !== previous.ino ||
          current.dev !== previous.dev ||
          current.contents !== previous.contents
        ) {
          throw new Error(`Journal changed during preparation: ${name}`);
        }
        await unlink(path);
        result.deleted.push(name);
      }
    }
    return result;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (import.meta.main) {
  try {
    const options: PrepareOptions = { stateDir: "" };
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === "--init") {
        options.initialize = true;
      } else if (arg === "--apply") {
        options.apply = true;
      } else if (["--state-dir", "--today", "--timezone"].includes(arg!) && args[index + 1]) {
        const value = args[++index]!;
        if (arg === "--state-dir") {
          options.stateDir = value;
        } else if (arg === "--today") {
          options.today = value;
        } else {
          options.timezone = value;
        }
      } else {
        throw new Error(`Unknown or incomplete argument: ${arg}`);
      }
    }
    if (!options.stateDir) {
      throw new Error(
        "Required: --state-dir <path> [--timezone <zone>] [--init] [--apply] [--today YYYY-MM-DD]",
      );
    }
    console.log(JSON.stringify(await prepareReview(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Review preparation failed");
    process.exitCode = 1;
  }
}
