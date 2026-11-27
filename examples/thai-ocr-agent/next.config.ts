import type { NextConfig } from "next";
<<<<<<< Updated upstream
import { withEve } from "eve/next";
=======
>>>>>>> Stashed changes

const config: NextConfig = {
  transpilePackages: ["@eve-thai-ocr/extractor"],
};

<<<<<<< Updated upstream
// Next.js serves the web demo; withEve runs the eve agent in agent/ beside it, on /eve/v1/*.
export default withEve(config);
=======
export default config;
>>>>>>> Stashed changes
