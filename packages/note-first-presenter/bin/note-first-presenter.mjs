#!/usr/bin/env node
import { runMain } from 'citty';
import { mainCommand } from '../dist/cli.mjs';

await runMain(mainCommand);
