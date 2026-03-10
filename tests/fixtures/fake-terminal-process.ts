#!/usr/bin/env node
/**
 * Fake terminal process for integration tests.
 * Echoes all stdin input back to stdout.
 * To exit: send the line "EXIT" (with newline).
 */

import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, terminal: false });

process.stdout.write('READY\r\n');

rl.on('line', (line) => {
  if (line.trim() === 'EXIT') {
    process.stdout.write('BYE\r\n');
    rl.close();
    process.exit(0);
  }
  process.stdout.write(`ECHO: ${line}\r\n`);
});

rl.on('close', () => {
  process.exit(0);
});
