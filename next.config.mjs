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
  experimental: {
    serverActions: {
      // The default is 1MB, and a photo straight off a phone is two to four.
      // Uploads were being rejected here, before the action ran, so the
      // admin saw a generic error page rather than anything useful.
      //
      // Photos are now shrunk in the browser first (components/photo-upload-
      // form.tsx), so this is the safety net rather than the fix. It stops
      // at 4MB because Vercel refuses any function request over 4.5MB
      // whatever this says, and a limit the platform will not honour is
      // worse than none.
      bodySizeLimit: '4mb',
    },
  },
};
