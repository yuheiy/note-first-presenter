#!/usr/bin/env node
import { runMain } from 'citty';
import { mainCommand } from '../dist/index.mjs';

await runMain(mainCommand);
