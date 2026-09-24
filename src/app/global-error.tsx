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
        <div className="home">
          <p>{globalError}</p>
          <p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Back to home</a>
          </p>
        </div>
      </body>
    </html>
  );
}
