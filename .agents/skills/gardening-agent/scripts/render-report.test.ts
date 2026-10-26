import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderReport, validateDossier, writeReport } from "./render-report";

const empty = () => ({
  version: 1,
  project: "Mibba",
  repositoryUrl: "https://github.com/the-agentic-company/mibba",
  timezone: "Europe/Paris",
  summary: "No baseline",
  changes: [],
  runs: [],
  findings: [],
  decisions: [],
});

test("embedded report data cannot close the data script or expand replacement tokens", () => {
  const dossier = validateDossier(
    { ...empty(), summary: "</script><script>alert(1)</script> $& $`" },
    new Set(),
  );
  const report = renderReport(
    dossier,
    [],
    '<script type="application/json">{{REPORT_DATA}}</script>',
  );
  expect(report.match(/<script/g)).toHaveLength(1);
  const data = report.slice(report.indexOf(">") + 1, report.lastIndexOf("</script>"));
  expect(JSON.parse(data).dossier.summary).toBe(dossier.summary);
});

test("an unsupported evidence-free finding cannot be reported as supported", async () => {
  const finding = JSON.parse(
    await Bun.file(new URL("../templates/finding.json", import.meta.url)).text(),
  );
  expect(() =>
    validateDossier(
      { ...empty(), findings: [{ ...finding, state: "supported" }] },
      new Set(["god-module"]),
    ),
  ).toThrow("source evidence");
});

test("unknown decision ownership and repeated finding identities are rejected", async () => {
  const finding = JSON.parse(
    await Bun.file(new URL("../templates/finding.json", import.meta.url)).text(),
  );
  expect(() =>
    validateDossier({ ...empty(), findings: [finding, finding] }, new Set(["god-module"])),
  ).toThrow("unique");
  expect(() =>
    validateDossier(
      {
        ...empty(),
        decisions: [
          {
            at: "2026-10-09T09:00:00+02:00",
            finding: "G-999",
            choice: "defer",
            reconsiderWhen: "new evidence",
          },
        ],
      },
      new Set(),
    ),
  ).toThrow("unknown finding");
});

test("rendering preserves the dossier, replaces an existing report, and rejects symlink outputs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gardening-report-"));
  try {
    const input = join(dir, "dossier.json");
    const output = join(dir, "report.html");
    const text = JSON.stringify(empty());
    await writeFile(input, text);
    await writeFile(output, "old report");
    await writeReport(input, output);
    expect(await readFile(input, "utf8")).toBe(text);
    expect(await readFile(output, "utf8")).toContain("No baseline");
    expect(await readFile(output, "utf8")).not.toContain("{{REPORT_DATA}}");
    await expect(writeReport(input, input)).rejects.toThrow("overwrite");
    const outside = join(dir, "preserve.html");
    const linked = join(dir, "linked.html");
    await writeFile(outside, "preserve");
    await symlink(outside, linked);
    await expect(writeReport(input, linked)).rejects.toThrow("regular file");
    expect(await readFile(outside, "utf8")).toBe("preserve");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
