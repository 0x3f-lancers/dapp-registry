import path from "path";
import validate from "./validate";

const appsDir = path.join(process.cwd(), "source", "apps");
validate(appsDir).catch(() => {
  process.exit(1);
});
