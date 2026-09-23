import { notFound as notFoundMessage } from '@/frontend/copy';

/**
 * Missing-page message for unknown URLs.
 * @returns The not-found sentence.
 */
export default function NotFound() {
  return (
    <main className="home">
      <p>{notFoundMessage}</p>
    </main>
  );
}
