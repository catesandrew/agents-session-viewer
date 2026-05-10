import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Session Discovery',
    description: (
      <>
        Automatically scans your <code>~/.codex/sessions/</code> directory and
        discovers all JSONL session files. New sessions appear in real-time via
        file watching with chokidar.
      </>
    ),
  },
  {
    title: 'Fuzzy Search',
    description: (
      <>
        Search across all sessions simultaneously with Fuse.js-powered fuzzy
        matching. Results highlight matched messages with context and let you
        jump directly to the source conversation.
      </>
    ),
  },
  {
    title: 'Vim Navigation',
    description: (
      <>
        Full keyboard-driven workflow inspired by Vim. Use <code>j</code>/
        <code>k</code> for messages, <code>J</code>/<code>K</code> for sessions,{' '}
        <code>gg</code>/<code>G</code> for jumping, <code>y</code> to yank, and{' '}
        <code>/</code> to search.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md padding-vert--lg">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
