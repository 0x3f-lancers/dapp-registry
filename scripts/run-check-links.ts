import path from "path";
import checkLinksScript from "./check-links";

const appsDir = path.join(process.cwd(), "data", "apps");

const slugsToProcess = process.argv.slice(2);

checkLinksScript(
  appsDir,
  slugsToProcess.length > 0 ? slugsToProcess : undefined,
)
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
