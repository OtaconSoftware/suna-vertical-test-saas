import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Worker Conversation | Otacon',
  description: 'Interactive Worker conversation powered by Otacon',
  openGraph: {
    title: 'Worker Conversation | Otacon',
    description: 'Interactive Worker conversation powered by Otacon',
    type: 'website',
  },
};

export default async function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
