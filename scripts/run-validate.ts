import path from "path";
import validate from "./validate";

const appsDir = path.join(process.cwd(), "data", "apps");
validate(appsDir).catch(() => {
  process.exit(1);
});
