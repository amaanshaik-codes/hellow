
import './globals.css';
import AppleProviders from '../components/AppleProviders';

export const metadata = {
  title: 'Hellow Chat',
  description: 'Private peer-to-peer chat for two users',
  manifest: '/manifest.json',
  themeColor: '#007AFF',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Hellow'
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#007AFF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Hellow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className="bg-system-background min-h-screen">
        <AppleProviders>
          {children}
        </AppleProviders>
      </body>
    </html>
  );
}
