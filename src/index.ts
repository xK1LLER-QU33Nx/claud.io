#!/usr/bin/env bun
/**
 * Claude Code CLI - Unified Entry Point
 *
 * This file ensures that shims for build-time constants (MACRO)
 * are initialized before the main CLI logic starts.
 */
import '../shims/macro.js';
import { main } from './main.tsx';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
