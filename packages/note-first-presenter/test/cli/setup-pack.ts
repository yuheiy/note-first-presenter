import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function setup() {
  const pkgDir = path.resolve(import.meta.dirname, '../..');
  execFileSync('vp', ['pack'], { cwd: pkgDir, stdio: 'pipe' });
}
