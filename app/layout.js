
import './globals.css';
import AppleProviders from '../components/AppleProviders';

export const metadata = {
  title: 'Hellow Chat',
  description: 'Private peer-to-peer chat for two users',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-system-background min-h-screen">
        <AppleProviders>
          {children}
        </AppleProviders>
      </body>
    </html>
  );
}
