import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Keys | Otacon',
  description: 'Manage your API keys for programmatic access to Otacon',
  openGraph: {
    title: 'API Keys | Otacon',
    description: 'Manage your API keys for programmatic access to Otacon',
    type: 'website',
  },
};

export default async function APIKeysLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
