import type { NextConfig } from "next";
import { withEve } from "eve/next";

const config: NextConfig = {
  transpilePackages: ["@eve-thai-ocr/extractor"],
};

// Next.js serves the web demo; withEve runs the eve agent in agent/ beside it, on /eve/v1/*.
export default withEve(config);
