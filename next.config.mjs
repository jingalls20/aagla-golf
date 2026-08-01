/** @type {import('next').NextConfig} */
export default {
  eslint: {
    // Lint runs in CI as its own step (npm run lint). Letting it also gate the
    // production build means a style rule can block a deploy, which is the
    // wrong trade for a league app that needs to be fixable on a Sunday.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type errors DO block the build, deliberately. They catch real defects.
    ignoreBuildErrors: false,
  },
};
