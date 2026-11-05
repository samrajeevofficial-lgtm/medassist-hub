// Picks a SQLite driver:
//  1. Node's built-in `node:sqlite` (Node 22.13+) - nothing to compile or install.
//  2. `better-sqlite3` (optional dependency) for older Node versions.
// Both are exposed with the same small API: exec, prepare().run/get/all, transaction, pragma.

function openBuiltin(file) {
    // Hide Node's one-time "SQLite is experimental" warning; keep all other warnings.
    const listeners = process.listeners('warning');
    process.removeAllListeners('warning');
    process.on('warning', (w) => {
        if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
        listeners.forEach((l) => l(w));
        if (!listeners.length) console.warn(w);
    });

    const { DatabaseSync } = require('node:sqlite');
    const raw = new DatabaseSync(file);

    const clean = (v) => (v === undefined ? null : v);

    function wrapStatement(sql, stmt) {
        // Named parameters used in this statement, e.g. "@name" -> "name".
        const named = new Set([...sql.matchAll(/[@:$]([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
        const prep = (args) => {
            if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
                const obj = {};
                for (const [k, v] of Object.entries(args[0])) if (named.has(k)) obj[k] = clean(v);
                return [obj];
            }
            return args.map(clean);
        };
        return {
            run: (...a) => stmt.run(...prep(a)),
            get: (...a) => stmt.get(...prep(a)),
            all: (...a) => stmt.all(...prep(a)),
        };
    }

    return {
        driver: 'node:sqlite',
        exec: (sql) => raw.exec(sql),
        prepare: (sql) => wrapStatement(sql, raw.prepare(sql)),
        pragma: (p) => raw.exec(`PRAGMA ${p}`),
        transaction: (fn) => (...args) => {
            raw.exec('BEGIN');
            try {
                const result = fn(...args);
                raw.exec('COMMIT');
                return result;
            } catch (e) {
                raw.exec('ROLLBACK');
                throw e;
            }
        },
    };
}

function openBetterSqlite(file) {
    const Database = require('better-sqlite3');
    const db = new Database(file);
    db.driver = 'better-sqlite3';
    return db;
}

function open(file) {
    try {
        return openBuiltin(file);
    } catch (builtinErr) {
        try {
            return openBetterSqlite(file);
        } catch {
            throw new Error(
                `No SQLite driver available. Use Node.js 22.13 or newer (recommended), or run "npm install better-sqlite3".\n(${builtinErr.message})`,
            );
        }
    }
}

module.exports = { open };
