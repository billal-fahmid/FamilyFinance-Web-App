import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Family Finance — Smarter Finances, Happier Families',
    template: '%s · Family Finance',
  },
  description:
    'Family Finance — manage your family income, expenses, savings and debt. Built for Bangladesh.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Family Finance',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Family Finance' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0EA5E9' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1220' },
  ],
};

// Runs before hydration to set the theme class — avoids a flash of the wrong theme.
const themeScript = `(function(){try{var p=localStorage.getItem('famfinance:theme')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';var l=localStorage.getItem('famfinance:locale');if(l==='bn'||l==='en')e.lang=l;}catch(_){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
