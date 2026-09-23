'use client';

import { globalError } from '@/frontend/copy';
import './globals.css';

/**
 * Last-resort error page with its own document shell.
 * @returns The reload message inside `html` and `body`.
 */
export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <main className="home">
          <p>{globalError}</p>
        </main>
      </body>
    </html>
  );
}
