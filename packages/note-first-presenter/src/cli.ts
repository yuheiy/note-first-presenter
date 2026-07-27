import { runMain } from 'citty';
import { main } from './commands/index.ts';

// The entry, and only the entry. The command tree lives in commands/index.ts so
// that a test can import it and drive a command without this line starting a
// CLI as a side effect of the import (docs/adr/0021).
await runMain(main);
