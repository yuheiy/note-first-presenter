// Registers vitest-browser-react's automatic cleanup between tests, the same
// way react-spectrum's test/browser/setup.ts does. Importing it here rather
// than per-file keeps React-free browser tests (paste) free of the import.
import 'vitest-browser-react';
