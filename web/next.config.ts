import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl({
  serverExternalPackages: ["pg"],
  outputFileTracingRoot: path.resolve(import.meta.dirname, ".."),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
});
