const { spawnSync } = require("child_process");

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
}

function getStagedMetaPaths() {
  const output = runGit([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
    "--",
    "src/apps",
  ]);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^src\/apps\/[^/]+\/meta\.json$/.test(line));
}

function getStagedMeta(path) {
  const stagedContent = runGit(["show", `:${path}`]);
  return JSON.parse(stagedContent);
}

function main() {
  const stagedMetaPaths = getStagedMetaPaths();
  if (stagedMetaPaths.length === 0) {
    return;
  }

  const errors = [];

  for (const metaPath of stagedMetaPaths) {
    const folderName = metaPath.split("/")[2];
    const meta = getStagedMeta(metaPath);
    const expectedFolderName = String(meta.slug || "");

    if (folderName !== folderName.toLowerCase()) {
      errors.push(
        `${metaPath}: folder name must be lowercase. Rename '${folderName}' to '${folderName.toLowerCase()}' with a two-step git mv.`,
      );
    }

    if (expectedFolderName !== folderName) {
      errors.push(
        `${metaPath}: slug '${expectedFolderName}' does not match folder '${folderName}'.`,
      );
    }
  }

  if (errors.length > 0) {
    console.error("Pre-commit app folder check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
}

main();
