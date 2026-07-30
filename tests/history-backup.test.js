// history-backup.test.js - Unit tests for JSON backup / restore
// Run: node tests/history-backup.test.js

// history.js touches localStorage only inside functions, so a stub installed
// before the first call is enough — no import-time shim needed.
function installStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    globalThis.localStorage = {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => { store.set(key, String(value)); },
        removeItem: key => { store.delete(key); }
    };
    return store;
}

installStorage();

const { buildBackup, parseBackup, mergeHistory, getHistory } = await import('../js/history.js');

let passed = 0;
let failed = 0;

function assertTrue(condition, testName) {
    if (condition) {
        passed++;
        console.log(`  PASS: ${testName}`);
    } else {
        failed++;
        console.error(`  FAIL: ${testName}`);
    }
}

function assertEqual(actual, expected, testName) {
    if (actual === expected) {
        passed++;
        console.log(`  PASS: ${testName}`);
    } else {
        failed++;
        console.error(`  FAIL: ${testName} — expected ${expected}, got ${actual}`);
    }
}

function record(id, timestamp, extra = {}) {
    return {
        id,
        timestamp,
        patient: { name: `P-${id}`, ageYears: 60, sex: 'male', weight: 70, scr: 1.0 },
        regimens: [{ dose: 1000, interval: 12, startTime: timestamp, skips: [] }],
        measurements: [{ time: timestamp, concentration: 12.5 }],
        results: { auc24: 480, trough: 12.1 },
        ...extra
    };
}

const STORAGE_KEY = 'tdm_history';

// =====================================================
// buildBackup
// =====================================================
console.log('\n--- buildBackup ---');

const sample = [record('a', '2026-05-01T08:00:00.000Z'), record('b', '2026-05-02T08:00:00.000Z')];
const envelope = buildBackup(sample, '2026-05-03T00:00:00.000Z');

assertEqual(envelope.format, 'simpletdm-backup', 'Envelope carries the format tag');
assertEqual(envelope.version, 1, 'Envelope carries the schema version');
assertEqual(envelope.recordCount, 2, 'Envelope reports the record count');
assertEqual(envelope.exportedAt, '2026-05-03T00:00:00.000Z', 'Envelope keeps the given timestamp');
assertEqual(envelope.records.length, 2, 'Envelope carries all records');

// =====================================================
// parseBackup — happy path and round-trip
// =====================================================
console.log('\n--- parseBackup: valid input ---');

const roundTrip = parseBackup(JSON.stringify(envelope));
assertTrue(roundTrip.ok, 'Round-trip of a generated backup parses');
assertEqual(roundTrip.records.length, 2, 'Round-trip preserves record count');
assertEqual(roundTrip.dropped, 0, 'Round-trip drops nothing');
assertEqual(
    JSON.stringify(roundTrip.records),
    JSON.stringify(sample),
    'Round-trip preserves records verbatim (measurements, regimens, results)'
);

// =====================================================
// parseBackup — rejections
// =====================================================
console.log('\n--- parseBackup: rejections ---');

assertEqual(parseBackup('not json{').error, 'parse', 'Malformed JSON → parse error');
assertEqual(parseBackup('null').error, 'format', 'JSON null → format error');
assertEqual(parseBackup('[1,2,3]').error, 'format', 'Bare array → format error');
assertEqual(
    parseBackup(JSON.stringify({ format: 'something-else', version: 1, records: [] })).error,
    'format',
    'Foreign format tag → format error'
);
assertEqual(
    parseBackup(JSON.stringify({ format: 'simpletdm-backup', version: 99, records: [] })).error,
    'version',
    'Newer schema version → version error'
);
assertEqual(
    parseBackup(JSON.stringify({ format: 'simpletdm-backup', version: 1, records: 'nope' })).error,
    'format',
    'Non-array records → format error'
);
// A CSV export is the most likely wrong file for a user to pick
assertEqual(parseBackup('Name,Timestamp\nfoo,bar').error, 'parse', 'CSV file → parse error, not a crash');

// =====================================================
// parseBackup — per-record salvage
// =====================================================
console.log('\n--- parseBackup: per-record salvage ---');

const messy = parseBackup(JSON.stringify({
    format: 'simpletdm-backup',
    version: 1,
    records: [
        record('good', '2026-05-01T08:00:00.000Z'),
        null,
        'string-instead-of-object',
        { id: 'no-timestamp' },
        { id: 'bad-timestamp', timestamp: 'not-a-date' },
        { timestamp: '2026-05-02T08:00:00.000Z' }   // valid but id-less
    ]
}));

assertTrue(messy.ok, 'A file with some bad records still imports');
assertEqual(messy.records.length, 2, 'Only the salvageable records survive');
assertEqual(messy.dropped, 4, 'Dropped count reports the rejected records');
assertTrue(
    typeof messy.records[1].id === 'string' && messy.records[1].id.length > 0,
    'An id-less record is assigned a generated id'
);

// =====================================================
// mergeHistory
// =====================================================
console.log('\n--- mergeHistory ---');

installStorage();
let result = mergeHistory([record('a', '2026-05-01T08:00:00.000Z')]);
assertTrue(result.ok, 'Merge into empty history succeeds');
assertEqual(result.added, 1, 'One record added');
assertEqual(result.skipped, 0, 'Nothing skipped');
assertEqual(getHistory().length, 1, 'History now holds one record');

result = mergeHistory([
    record('a', '2026-05-01T08:00:00.000Z'),   // already present
    record('b', '2026-05-02T08:00:00.000Z')
]);
assertEqual(result.added, 1, 'Only the new record is added');
assertEqual(result.skipped, 1, 'The duplicate id is skipped');
assertEqual(getHistory().length, 2, 'History holds two records, not three');

// Existing records must survive an import
installStorage({
    [STORAGE_KEY]: JSON.stringify([record('local', '2026-05-05T08:00:00.000Z')])
});
mergeHistory([record('imported', '2026-05-06T08:00:00.000Z')]);
const merged = getHistory();
assertEqual(merged.length, 2, 'Import keeps the pre-existing record');
assertTrue(merged.some(r => r.id === 'local'), 'Pre-existing record still present after import');

// Chronological order regardless of import order
installStorage();
mergeHistory([
    record('late', '2026-05-09T08:00:00.000Z'),
    record('early', '2026-05-01T08:00:00.000Z'),
    record('mid', '2026-05-05T08:00:00.000Z')
]);
assertEqual(
    getHistory().map(r => r.id).join(','),
    'early,mid,late',
    'Merged history is sorted chronologically'
);

// =====================================================
// mergeHistory — limits and failure
// =====================================================
console.log('\n--- mergeHistory: limits and failure ---');

installStorage();
const bulk = [];
for (let i = 0; i < 1005; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    bulk.push(record(`r${i}`, `2026-05-${day}T08:00:00.000Z`));
}
result = mergeHistory(bulk);
assertEqual(result.added, 1005, 'All incoming records are counted as added');
assertEqual(result.trimmed, 5, 'Overflow past the 1000-record cap is reported');
assertEqual(getHistory().length, 1000, 'History is capped at 1000 records');

// Quota failure must leave the stored history untouched
installStorage({
    [STORAGE_KEY]: JSON.stringify([record('keep', '2026-05-01T08:00:00.000Z')])
});
const workingSetItem = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
result = mergeHistory([record('new', '2026-05-02T08:00:00.000Z')]);
globalThis.localStorage.setItem = workingSetItem;

assertTrue(!result.ok, 'Quota failure is reported as a failure');
assertEqual(result.error, 'quota', 'Quota failure carries the quota error code');
assertEqual(getHistory().length, 1, 'Stored history is unchanged after a failed import');
assertEqual(getHistory()[0].id, 'keep', 'The surviving record is the original one');

// =====================================================
// Summary
// =====================================================
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
