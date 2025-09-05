
import './globals.css';
import AppleProviders from '../components/AppleProviders';
import CacheBuster from '../components/CacheBuster';

export const metadata = {
  title: 'Hellow Chat',
  description: 'Private peer-to-peer chat for two users',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Hellow'
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#007AFF'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Hellow" />
      </head>
      <body className="bg-system-background min-h-screen">
        <CacheBuster />
        <AppleProviders>
          {children}
        </AppleProviders>
      </body>
    </html>
  );
}
