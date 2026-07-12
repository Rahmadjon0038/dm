import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Message Assistant',
  description: 'Privacy policy and data deletion instructions for Message Assistant',
};

// Meta App Review uchun ochiq sahifa — login talab qilinmaydi.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-gray-800">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: July 12, 2026</p>

      <section className="mt-8 space-y-4">
        <p>
          Message Assistant (&quot;we&quot;, &quot;our&quot;, &quot;the app&quot;) is a customer
          messaging tool that allows a business to receive and reply to its own Instagram Direct
          messages from a web dashboard.
        </p>

        <h2 className="pt-4 text-xl font-semibold">1. Information we collect</h2>
        <p>
          When a business connects its Instagram professional account, we receive and store, via
          the official Meta / Instagram API: the connected account&apos;s ID and username, incoming
          and outgoing Direct messages of that account, and the public profile information
          (username, name, profile picture) of people who message the account.
        </p>

        <h2 className="pt-4 text-xl font-semibold">2. How we use information</h2>
        <p>
          The data is used solely to display conversations in the business&apos;s inbox and to send
          replies on the business&apos;s behalf. We do not sell data, show advertising, or share
          data with third parties.
        </p>

        <h2 className="pt-4 text-xl font-semibold">3. Storage and security</h2>
        <p>
          Data is stored in a private database. Access tokens are encrypted at rest (AES-256-GCM).
          Access to the dashboard requires authentication.
        </p>

        <h2 className="pt-4 text-xl font-semibold">4. Data deletion</h2>
        <p>
          You may request deletion of your data at any time. Contact us at{' '}
          <a className="text-blue-600 underline" href="mailto:abdullayevrahmadjon821@gmail.com">
            abdullayevrahmadjon821@gmail.com
          </a>{' '}
          and we will delete all messages, contact records and tokens related to your account
          within 30 days. Disconnecting the app in Instagram (Settings → Apps and websites →
          Remove) immediately revokes the app&apos;s access to your account.
        </p>

        <h2 className="pt-4 text-xl font-semibold">5. Contact</h2>
        <p>
          Questions about this policy:{' '}
          <a className="text-blue-600 underline" href="mailto:abdullayevrahmadjon821@gmail.com">
            abdullayevrahmadjon821@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
