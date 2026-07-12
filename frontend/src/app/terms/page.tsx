import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Message Assistant',
  description: 'Terms of service for Message Assistant',
};

// Meta App Review uchun ochiq sahifa — login talab qilinmaydi.
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-gray-800">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: July 12, 2026</p>

      <section className="mt-8 space-y-4">
        <p>
          Message Assistant is a dashboard that lets a business manage Direct messages of its own
          Instagram professional account through the official Meta / Instagram API.
        </p>
        <p>
          By connecting your Instagram account you confirm that you are authorized to manage that
          account and that you will use the service in accordance with Instagram&apos;s Terms of
          Use and Meta Platform Policies.
        </p>
        <p>
          The service is provided &quot;as is&quot;, without warranties. We may suspend access in
          case of abuse or violation of platform policies.
        </p>
        <p>
          Contact:{' '}
          <a className="text-blue-600 underline" href="mailto:abdullayevrahmadjon821@gmail.com">
            abdullayevrahmadjon821@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
