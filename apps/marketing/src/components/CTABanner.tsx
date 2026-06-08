import { DownloadBadges } from '@/components/DownloadBadges';
import { APP_REGISTER_URL } from '@/lib/constants';

export function CTABanner() {
  return (
    <section className="bg-indigo-600 px-6 py-20 text-center text-white">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-bold sm:text-4xl">Ready to actually enjoy studying?</h2>
        <p className="mt-4 text-lg text-indigo-100">
          Join thousands of students turning boring PDFs into games.
        </p>
        <a
          href={APP_REGISTER_URL}
          className="mt-8 inline-block rounded-xl bg-white px-8 py-4 font-semibold text-indigo-600 shadow-lg transition hover:bg-indigo-50"
        >
          Create Your Free Account
        </a>
        <div className="mt-8 flex justify-center ">
          <DownloadBadges />
        </div>
      </div>
    </section>
  );
}
