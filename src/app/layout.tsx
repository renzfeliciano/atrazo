import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import { THEME_BOOT_SCRIPT } from "@/ui/theme";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Atrazo", template: "%s · Atrazo" },
  description: "The utang ledger for sari-sari stores. Write the utang; Atrazo adds it up.",
  applicationName: "Atrazo",
  robots: { index: false, follow: false },
  // Installed on an iPhone home screen: full-screen, titled Atrazo.
  appleWebApp: { capable: true, title: "Atrazo", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1C2024",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Fonts ship inside the app (public/fonts, see src/styles/fonts.css); preload the faces every screen uses.
  preload("/fonts/archivo-latin.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  preload("/fonts/archivo-latin-ext.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  return (
    // The theme attribute is set by the boot script before React hydrates, hence the warning opt-out.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* iOS Safari only shows :active press states when the page listens for touches. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener("touchstart",function(){},{passive:true});`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
