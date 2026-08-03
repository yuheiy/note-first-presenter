import { runMain } from 'citty';
import { main } from './commands/index.ts';

// The entry, and only the entry — commands/index.ts says why it is this thin.
await runMain(main);
