import { github, linkedin } from '@/frontend/copy';

type FooterProps = {
  fullName: string;
  githubUrl: string;
  linkedinUrl: string;
};

/**
 * One line under a hairline rule: full name, GitHub, and LinkedIn.
 * @param props - Footer text and profile links from configuration.
 * @param props.fullName - The person's full name.
 * @param props.githubUrl - Destination for the GitHub link.
 * @param props.linkedinUrl - Destination for the LinkedIn link.
 * @returns The footer line.
 */
export function Footer({ fullName, githubUrl, linkedinUrl }: FooterProps) {
  return (
    <footer className="site-footer">
      <p>
        {fullName}
        {' · '}
        <a href={githubUrl}>{github}</a>
        {' · '}
        <a href={linkedinUrl}>{linkedin}</a>
      </p>
    </footer>
  );
}
