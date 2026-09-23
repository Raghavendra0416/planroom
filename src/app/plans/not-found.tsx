import { notFound as notFoundMessage } from '@/frontend/copy';

/**
 * Missing-page message inside the plans segment.
 * @returns The not-found sentence.
 */
export default function PlansNotFound() {
  return (
    <main className="home">
      <p>{notFoundMessage}</p>
    </main>
  );
}
