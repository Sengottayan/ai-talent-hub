/**
 * Development-only logger utility
 * Wraps console methods to only log in development mode
 * Usage: import { logger } from '@/lib/logger'
 *        logger.log('message')
 *        logger.error('error message')
 */

const isDev = import.meta.env.DEV;

export const logger = {
    log: (...args: any[]) => {
        if (isDev) {
            console.log(...args);
        }
    },

    error: (...args: any[]) => {
        // Always log errors, even in production
        console.error(...args);
    },

    warn: (...args: any[]) => {
        if (isDev) {
            console.warn(...args);
        }
    },

    debug: (...args: any[]) => {
        if (isDev) {
            console.debug(...args);
        }
    },

    info: (...args: any[]) => {
        if (isDev) {
            console.info(...args);
        }
    },

    // Group related logs together
    group: (label: string, fn: () => void) => {
        if (isDev) {
            console.group(label);
            fn();
            console.groupEnd();
        }
    },

    // Table format for objects/arrays
    table: (data: any) => {
        if (isDev) {
            console.table(data);
        }
    },
};

export default logger;
