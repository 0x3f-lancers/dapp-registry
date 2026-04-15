const { existsSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const repoRoot = process.cwd();
const gitDir = path.join(repoRoot, ".git");
const hooksPath = ".githooks";

if (!existsSync(gitDir)) {
  process.exit(0);
}

const result = spawnSync("git", ["config", "core.hooksPath", hooksPath], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
