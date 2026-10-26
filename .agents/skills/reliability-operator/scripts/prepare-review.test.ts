import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calendarDate, prepareReview, todayInZone } from "./prepare-review";

const roots: string[] = [];
const DAY = 86_400_000;
const promoted =
  "---\nretention: disposable\n---\nLasting findings are linked in incidents/example.md.\n";
async function fixture() {
  const base = await mkdtemp(join(await realpath(tmpdir()), "reliability-operator-"));
  roots.push(base);
  const stateDir = join(base, "state");
  await prepareReview({ stateDir, initialize: true, today: "2026-10-08" });
  const journal = join(stateDir, "journal");
  return {
    base,
    stateDir,
    journal,
    put: (name: string, contents = promoted) => writeFile(join(journal, name), contents),
  };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("review preparation and retention", () => {
  test("initializes an empty store without inventing health, and preserves overview on repeat", async () => {
    const { stateDir } = await fixture();
    const path = join(stateDir, "overview.md");
    expect(await readFile(path, "utf8")).toContain("unverified");
    await writeFile(path, "Real prior review\n");
    await prepareReview({ stateDir, initialize: true, today: "2026-10-08" });
    expect(await readFile(path, "utf8")).toBe("Real prior review\n");
    expect(await readdir(stateDir)).not.toContain(".prepare.lock");
  });

  test("dry run keeps fourteen dates including today, ignores mtimes, and deletes nothing", async () => {
    const { stateDir, journal, put } = await fixture();
    for (const date of ["2026-09-24", "2026-09-25", "2026-10-08", "2026-10-09"]) {
      await put(`${date}.md`);
    }
    const before = await readdir(journal);
    const result = await prepareReview({ stateDir, today: "2026-10-08" });
    expect(result.keepFrom).toBe("2026-09-25");
    expect(result.eligible).toEqual(["2026-09-24.md"]);
    expect(result.deleted).toEqual([]);
    expect(await readdir(journal)).toEqual(before);
  });

  test("apply prunes only old promoted journals and is idempotent", async () => {
    const { stateDir, journal, put } = await fixture();
    await put("2026-09-24.md");
    await put("2026-09-25.md");
    for (const category of ["incidents", "decisions", "merges"]) {
      await writeFile(join(stateDir, category, "2020-01-01.md"), promoted);
    }
    await writeFile(join(stateDir, "policy.md"), "Personal policy\n");
    await writeFile(join(stateDir, "postmortems/2020-01-01.html"), "<h1>Permanent history</h1>");
    expect((await prepareReview({ stateDir, today: "2026-10-08", apply: true })).deleted).toEqual([
      "2026-09-24.md",
    ]);
    expect(await readdir(journal)).toEqual(["2026-09-25.md"]);
    expect((await prepareReview({ stateDir, today: "2026-10-08", apply: true })).deleted).toEqual(
      [],
    );
    expect(await readFile(join(stateDir, "incidents/2020-01-01.md"), "utf8")).toBe(promoted);
    expect(await readFile(join(stateDir, "decisions/2020-01-01.md"), "utf8")).toBe(promoted);
    expect(await readFile(join(stateDir, "merges/2020-01-01.md"), "utf8")).toBe(promoted);
    expect(await readFile(join(stateDir, "postmortems/2020-01-01.html"), "utf8")).toBe(
      "<h1>Permanent history</h1>",
    );
    expect(await readFile(join(stateDir, "policy.md"), "utf8")).toBe("Personal policy\n");
    expect(await readFile(join(stateDir, "overview.md"), "utf8")).toContain("unverified");
  });

  test("holds old pending, missing, body-only, and duplicate retention markers", async () => {
    const { stateDir, journal, put } = await fixture();
    const contents = [
      "---\nretention: pending\n---\n",
      "# An unpromoted journal\n",
      "# Journal\nretention: disposable\n",
      "---\nretention: disposable\nretention: pending\n---\n",
    ];
    for (let index = 0; index < contents.length; index++) {
      await put(`2020-01-0${index + 1}.md`, contents[index]);
    }
    const result = await prepareReview({ stateDir, today: "2026-10-08", apply: true });
    expect(result.held).toHaveLength(4);
    expect(result.deleted).toEqual([]);
    expect(await readdir(journal)).toHaveLength(4);
  });

  test("accepts CRLF frontmatter", async () => {
    const { stateDir, put } = await fixture();
    await put("2020-01-01.md", promoted.replaceAll("\n", "\r\n"));
    expect((await prepareReview({ stateDir, today: "2026-10-08", apply: true })).deleted).toEqual([
      "2020-01-01.md",
    ]);
  });

  test("preserves invalid dates, nested files, unrelated names, and symlink targets", async () => {
    const { base, stateDir, journal, put } = await fixture();
    await put("2020-02-30.md");
    await put("notes.md");
    await mkdir(join(journal, "nested"));
    await writeFile(join(journal, "nested/2020-01-01.md"), promoted);
    const outside = join(base, "outside.md");
    await writeFile(outside, promoted);
    await symlink(outside, join(journal, "2020-01-01.md"));
    const result = await prepareReview({ stateDir, today: "2026-10-08", apply: true });
    expect(result.deleted).toEqual([]);
    expect(await readFile(outside, "utf8")).toBe(promoted);
    expect(await readFile(join(journal, "nested/2020-01-01.md"), "utf8")).toBe(promoted);
    expect(await readdir(journal)).toHaveLength(4);
  });

  test.each(["journal", "incidents", "decisions", "merges", "postmortems"])(
    "rejects a symlinked %s directory",
    async (category) => {
      const { base, stateDir } = await fixture();
      await rm(join(stateDir, category), { recursive: true });
      const outside = join(base, "outside");
      await mkdir(outside);
      await writeFile(join(outside, "2020-01-01.md"), promoted);
      await symlink(outside, join(stateDir, category));
      await expect(prepareReview({ stateDir, today: "2026-10-08", apply: true })).rejects.toThrow(
        "symlinks",
      );
      expect(await readFile(join(outside, "2020-01-01.md"), "utf8")).toBe(promoted);
      expect(await readdir(stateDir)).not.toContain(".prepare.lock");
    },
  );

  test("rejects a symlinked state ancestor", async () => {
    const { base, stateDir } = await fixture();
    await symlink(stateDir, join(base, "alias"));
    await expect(prepareReview({ stateDir: join(base, "alias"), apply: true })).rejects.toThrow(
      "symlinks",
    );
  });

  test("requires a valid marker and refuses adopting existing journals", async () => {
    const { stateDir, put } = await fixture();
    await put("2020-01-01.md");
    await rm(join(stateDir, "state.json"));
    await expect(prepareReview({ stateDir, apply: true })).rejects.toThrow("not initialized");
    await expect(prepareReview({ stateDir, initialize: true, apply: true })).rejects.toThrow(
      "nonempty",
    );
    await writeFile(join(stateDir, "state.json"), '{"kind":"another-store","version":1}');
    await expect(prepareReview({ stateDir, apply: true })).rejects.toThrow("supported");
    expect(await readFile(join(stateDir, "journal/2020-01-01.md"), "utf8")).toBe(promoted);
  });

  test("rejects a symlinked marker without deleting its target", async () => {
    const { base, stateDir } = await fixture();
    const marker = join(stateDir, "state.json");
    const content = await readFile(marker, "utf8");
    await rm(marker);
    await writeFile(join(base, "marker.json"), content);
    await symlink(join(base, "marker.json"), marker);
    await expect(prepareReview({ stateDir, apply: true })).rejects.toThrow();
    expect(await readFile(join(base, "marker.json"), "utf8")).toBe(content);
  });

  test("does not steal a preparation lock or delete journals while locked", async () => {
    const { stateDir, put } = await fixture();
    await put("2020-01-01.md");
    await writeFile(join(stateDir, ".prepare.lock"), "Existing preparation\n");
    await expect(prepareReview({ stateDir, apply: true })).rejects.toThrow("lock already exists");
    expect(await readFile(join(stateDir, ".prepare.lock"), "utf8")).toBe("Existing preparation\n");
    expect(await readFile(join(stateDir, "journal/2020-01-01.md"), "utf8")).toBe(promoted);
  });

  test.each(["2026-02-29", "2026-13-01", "invalid", "2026-1-01"])(
    "rejects invalid date %s before mutation",
    async (today) => {
      const { stateDir, put } = await fixture();
      await put("2020-01-01.md");
      await expect(prepareReview({ stateDir, today, apply: true })).rejects.toThrow(
        "calendar date",
      );
      expect(await readFile(join(stateDir, "journal/2020-01-01.md"), "utf8")).toBe(promoted);
      expect(await readdir(stateDir)).not.toContain(".prepare.lock");
    },
  );

  test("handles leap years and year boundaries", async () => {
    const { stateDir, put } = await fixture();
    for (const date of ["2024-02-29", "2024-03-01", "2024-12-18", "2024-12-19"]) {
      await put(`${date}.md`);
    }
    expect((await prepareReview({ stateDir, today: "2024-03-14" })).eligible).toEqual([
      "2024-02-29.md",
    ]);
    const result = await prepareReview({ stateDir, today: "2025-01-01" });
    expect(result.eligible).toContain("2024-12-18.md");
    expect(result.eligible).not.toContain("2024-12-19.md");
    expect(calendarDate("2024-03-01") - calendarDate("2024-02-29")).toBe(DAY);
  });

  test("uses the configured timezone across midnight and DST changes", () => {
    expect(todayInZone("Europe/Paris", new Date("2026-10-07T22:30:00Z"))).toBe("2026-10-08");
    expect(todayInZone("Europe/Paris", new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
    expect(todayInZone("Europe/Paris", new Date("2026-03-29T22:30:00Z"))).toBe("2026-03-30");
    expect(todayInZone("UTC", new Date("2026-10-07T22:30:00Z"))).toBe("2026-10-07");
    expect(() => todayInZone("not-a-timezone")).toThrow();
  });
});
