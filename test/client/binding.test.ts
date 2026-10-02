import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectBinding } from "../../src/client/binding.js";
import { EXIT_PROJECT_MISMATCH, EXIT_UNBOUND_PROJECT, EXIT_USAGE } from "../../src/shared/constants.js";

/** A minimal, schema-valid `conmuta.json` body for the given `project_id`. */
function validProjectFileJson(projectId: string): string {
  return JSON.stringify({
    schema_version: 1,
    project_id: projectId,
    group_id: -1001234567890,
    roster: [{ agent_id: "@claude", user_id: 111, username: "opuser" }],
  });
}

// ADR-0033 also keeps the pre-amendment strictness reachable for the two bindings whose argv is written
// per binding by the operator or the daemon (`conmuta-channel`, `conmuta-runner`). They opt in with
// `requireProjectFlag: true` and keep refusing `EXIT_USAGE` exactly as before, including for an
// explicitly empty `--project=`.
test("resolveProjectBinding refuses with EXIT_USAGE for a caller that set requireProjectFlag and passed no --project", () => {
  const dir = mkdtempSync(join(tmpdir(), "binding-strict-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");

    const result = resolveProjectBinding({ project: undefined, cwd: dir, requireProjectFlag: true });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.refusal.kind, "missing_project_flag");
      assert.equal(result.refusal.exitCode, EXIT_USAGE);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectBinding refuses with EXIT_USAGE for a caller that set requireProjectFlag and passed an empty --project", () => {
  const dir = mkdtempSync(join(tmpdir(), "binding-strict-empty-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");

    const result = resolveProjectBinding({ project: "", cwd: dir, requireProjectFlag: true });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.refusal.kind, "missing_project_flag");
      assert.equal(result.refusal.exitCode, EXIT_USAGE);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// B-107 (ADR-0033): `--project` is an ASSERTION, not a requirement. Absent (or empty) it means "no
// assertion", and the nearest ancestor `conmuta.json` fixes the binding — the same walk-up that was
// always there. The two tests below replace the pre-ADR-0033 `missing_project_flag`/`EXIT_USAGE`
// pair, which pinned the behaviour this amendment removes for the thin client.
test("resolveProjectBinding binds to the nearest ancestor conmuta.json when --project is undefined", () => {
  const dir = mkdtempSync(join(tmpdir(), "binding-no-flag-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");

    const result = resolveProjectBinding({ project: undefined, cwd: dir });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.file.project_id, "prj-example");
      assert.equal(result.path, join(dir, "conmuta.json"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectBinding treats an empty --project as no assertion, not as a usage error", () => {
  const dir = mkdtempSync(join(tmpdir(), "binding-empty-flag-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");

    const result = resolveProjectBinding({ project: "", cwd: dir });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.file.project_id, "prj-example");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "resolveProjectBinding binds from a nested subfolder to the enclosing tree's conmuta.json when " +
    "--project is undefined (the B-107 case: the registration no longer has to encode the project)",
  () => {
    const parentDir = mkdtempSync(join(tmpdir(), "binding-subfolder-"));
    try {
      writeFileSync(join(parentDir, "conmuta.json"), validProjectFileJson("prj-frisco"), "utf8");
      const nestedCwd = join(parentDir, "frisco-erp");
      mkdirSync(nestedCwd, { recursive: true });

      const result = resolveProjectBinding({ project: undefined, cwd: nestedCwd });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.file.project_id, "prj-frisco");
        assert.equal(result.path, join(parentDir, "conmuta.json"));
      }
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  },
);

test("resolveProjectBinding still refuses with EXIT_UNBOUND_PROJECT when --project is undefined and no conmuta.json exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "binding-no-flag-unbound-"));
  try {
    const result = resolveProjectBinding({ project: undefined, cwd: dir });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.refusal.kind, "no_project_file_found");
      assert.equal(result.refusal.exitCode, EXIT_UNBOUND_PROJECT);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "resolveProjectBinding refuses with EXIT_UNBOUND_PROJECT when no conmuta.json is found anywhere in the walk-up " +
    "(disclosed completeness addition: the requirement's third MUST clause has no named scenario)",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "binding-unbound-"));
    try {
      const result = resolveProjectBinding({ project: "prj-example", cwd: dir });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.refusal.kind, "no_project_file_found");
        assert.equal(result.refusal.exitCode, EXIT_UNBOUND_PROJECT);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "resolveProjectBinding refuses with EXIT_PROJECT_MISMATCH when the found file's project_id disagrees with " +
    "an explicit --project (canonical scenario 'An explicit --project that disagrees is refused'; the F1 delta " +
    "spec's Scenario 39 title named EXIT_UNBOUND_PROJECT, which this module never returned)",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "binding-mismatch-"));
    try {
      writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-other"), "utf8");

      const result = resolveProjectBinding({ project: "prj-example", cwd: dir });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.refusal.kind, "project_id_mismatch");
        assert.equal(result.refusal.exitCode, EXIT_PROJECT_MISMATCH);
        assert.equal(result.refusal.foundProjectId, "prj-other");
        assert.equal(result.refusal.expectedProjectId, "prj-example");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("resolveProjectBinding resolves ok:true when the nearest conmuta.json's project_id matches --project", () => {
  const dir = mkdtempSync(join(tmpdir(), "binding-match-"));
  try {
    writeFileSync(join(dir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");

    const result = resolveProjectBinding({ project: "prj-example", cwd: dir });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.file.project_id, "prj-example");
      assert.equal(result.path, join(dir, "conmuta.json"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectBinding walks up multiple directory levels to find an ancestor's conmuta.json", () => {
  const parentDir = mkdtempSync(join(tmpdir(), "binding-walkup-"));
  try {
    writeFileSync(join(parentDir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");
    const nestedCwd = join(parentDir, "a", "b", "c");
    mkdirSync(nestedCwd, { recursive: true });

    const result = resolveProjectBinding({ project: "prj-example", cwd: nestedCwd });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.path, join(parentDir, "conmuta.json"));
    }
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test(
  "resolveProjectBinding refuses with EXIT_UNBOUND_PROJECT when the nearest conmuta.json is malformed, and does " +
    "not walk past it to a valid ancestor (disclosed completeness addition)",
  () => {
    const grandparentDir = mkdtempSync(join(tmpdir(), "binding-malformed-"));
    try {
      writeFileSync(join(grandparentDir, "conmuta.json"), validProjectFileJson("prj-example"), "utf8");
      const childDir = join(grandparentDir, "child");
      mkdirSync(childDir, { recursive: true });
      writeFileSync(join(childDir, "conmuta.json"), "{ not valid json", "utf8");

      const result = resolveProjectBinding({ project: "prj-example", cwd: childDir });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.refusal.kind, "invalid_project_file");
        assert.equal(result.refusal.exitCode, EXIT_UNBOUND_PROJECT);
        assert.equal(result.refusal.path, join(childDir, "conmuta.json"));
      }
    } finally {
      rmSync(grandparentDir, { recursive: true, force: true });
    }
  },
);

test(
  "resolveProjectBinding refuses with EXIT_UNBOUND_PROJECT (unreadable_project_file) instead of throwing when " +
    "conmuta.json exists as a directory rather than a file (existsSync returns true for any filesystem entry)",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "binding-unreadable-"));
    try {
      mkdirSync(join(dir, "conmuta.json"));

      const result = resolveProjectBinding({ project: "prj-example", cwd: dir });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.refusal.kind, "unreadable_project_file");
        assert.equal(result.refusal.exitCode, EXIT_UNBOUND_PROJECT);
        assert.equal(result.refusal.path, join(dir, "conmuta.json"));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
