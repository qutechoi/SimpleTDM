// history.js - Calculation history storage, CSV export, JSON backup/restore

const STORAGE_KEY = 'tdm_history';
const MAX_RECORDS = 1000;

// JSON backup envelope. CSV is a lossy report format (measurements collapse to
// a count, regimens to a prose string); this keeps records verbatim so a backup
// can actually be restored — including on a different device.
const BACKUP_FORMAT = 'simpletdm-backup';
const BACKUP_VERSION = 1;

function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getHistory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function appendHistory(record) {
    const history = getHistory();
    const entry = { id: newId(), timestamp: new Date().toISOString(), ...record };
    history.push(entry);
    if (history.length > MAX_RECORDS) history.splice(0, history.length - MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    return entry;
}

export function deleteHistory(id) {
    const history = getHistory().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
}

export function filterByDateRange(from, to) {
    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : -Infinity;
    const toTs = to ? new Date(to + 'T23:59:59').getTime() : Infinity;
    return getHistory().filter(r => {
        const ts = new Date(r.timestamp).getTime();
        return ts >= fromTs && ts <= toTs;
    });
}

const CSV_LOCALES = {
    en: {
        headers: [
            'Name', 'Timestamp', 'AgeYears', 'AgeMonths', 'Sex', 'Pediatric',
            'Height_cm', 'Weight_kg', 'SCr_mg_dL',
            'CurrentDose_mg', 'CurrentInterval_h', 'FirstDoseTime', 'RegimenCount', 'Regimens', 'MeasurementCount',
            'AUC24', 'Trough_mg_L', 'Peak_mg_L', 'Clearance_L_h',
            'HalfLife_h', 'Kel_per_h', 'Vd_L', 'CrCl_mL_min',
            'R_squared', 'RMSE', 'Effectiveness', 'Toxicity'
        ],
        sex: { male: 'male', female: 'female' },
        pediatric: { true: 'yes', false: 'no' },
        effectiveness: { good: 'Good', low: 'Low' },
        toxicity: { low: 'Low', high: 'High' },
        heldLabel: 'held'
    },
    ko: {
        headers: [
            '이름', '일시', '나이(세)', '나이(개월)', '성별', '환자구분',
            '키(cm)', '체중(kg)', '혈청크레아티닌(mg/dL)',
            '현재용량(mg)', '현재간격(h)', '첫투약시간', '요법수', '요법내역', '측정횟수',
            'AUC24', 'Trough(mg/L)', 'Peak(mg/L)', '청소율(L/h)',
            '반감기(h)', 'Kel(1/h)', 'Vd(L)', 'CrCl(mL/min)',
            'R제곱', 'RMSE', '효과예측', '독성평가'
        ],
        sex: { male: '남', female: '여' },
        pediatric: { true: '소아', false: '성인' },
        effectiveness: { good: '양호', low: '저하' },
        toxicity: { low: '낮음', high: '위험' },
        heldLabel: '누락'
    }
};

function assessEffectiveness(auc24) {
    if (!isFinite(auc24)) return null;
    return auc24 < 400 ? 'low' : 'good';
}

function assessToxicity(auc24, trough) {
    if (!isFinite(auc24) || !isFinite(trough)) return null;
    return (auc24 > 600 || trough > 20) ? 'high' : 'low';
}

/**
 * Render a regimen's held doses as clock times, e.g. "held: 5/13 08:00, 5/13 20:00".
 * Times are derived from start + index × interval, matching enumerateSchedule().
 */
function formatSkips(regimen, label) {
    if (!Array.isArray(regimen.skips) || regimen.skips.length === 0) return '';
    const start = new Date(regimen.startTime).getTime();
    if (isNaN(start)) return '';
    const pad = n => String(n).padStart(2, '0');
    const times = regimen.skips
        .slice()
        .sort((a, b) => a - b)
        .map(n => {
            const d = new Date(start + n * regimen.interval * 3600000);
            return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        });
    return ` (${label}: ${times.join(', ')})`;
}

function csvEscape(value) {
    if (value == null) return '';
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function num(v, digits) {
    return typeof v === 'number' && isFinite(v) ? v.toFixed(digits) : '';
}

function recordToRow(r, locale) {
    const p = r.patient || {};
    const res = r.results || {};
    const fq = res.fitQuality || {};
    // Backward compat: legacy records used `r.dosing` (single regimen)
    const regimens = r.regimens || (r.dosing ? [r.dosing] : []);
    const first = regimens[0] || {};
    const last = regimens[regimens.length - 1] || {};
    const regimensSummary = regimens
        .map(g => `${g.dose}mg q${g.interval}h @${g.startTime}${formatSkips(g, locale.heldLabel)}`)
        .join(' | ');
    const effKey = assessEffectiveness(res.auc24);
    const toxKey = assessToxicity(res.auc24, res.trough);
    return [
        p.name ?? '',
        r.timestamp,
        p.ageYears, p.ageMonths ?? '',
        locale.sex[p.sex] ?? p.sex ?? '',
        locale.pediatric[p.pediatric ? 'true' : 'false'],
        p.height, p.weight, p.scr,
        last.dose, last.interval, first.startTime, regimens.length, regimensSummary, (r.measurements || []).length,
        num(res.auc24, 1), num(res.trough, 1), num(res.peakSS, 1), num(res.cl, 2),
        num(res.halfLife, 2), num(res.kel, 5), num(res.vd, 2), num(res.crcl, 1),
        fq.rSquared != null ? fq.rSquared.toFixed(3) : '',
        num(fq.rmse, 3),
        effKey ? locale.effectiveness[effKey] : '',
        toxKey ? locale.toxicity[toxKey] : ''
    ];
}

/**
 * Hand a generated file to the user: native share sheet when available,
 * plain download otherwise. Shared by CSV export and JSON backup.
 */
async function deliverFile(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });

    // On mobile, the OS share sheet surfaces KakaoTalk (and other messaging
    // apps) as a target. Kakao has no public web-SDK for sending files, so
    // routing through the native share sheet is the only viable path.
    // It doubles as the phone -> PC transfer path for backups.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: filename, text: filename });
            return;
        } catch (err) {
            // User dismissed the sheet — don't silently re-download behind their back.
            if (err.name === 'AbortError') return;
            // Other failures fall through to the download fallback below.
        }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function exportToCsv(records, filename = 'tdm_history.csv', lang = 'en') {
    const locale = CSV_LOCALES[lang] || CSV_LOCALES.en;
    const header = locale.headers.join(',');
    const rows = records.map(r => recordToRow(r, locale).map(csvEscape).join(','));
    const csv = '\uFEFF' + [header, ...rows].join('\r\n');

    await deliverFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

// =====================================================
// JSON backup / restore
// =====================================================

export function buildBackup(records, exportedAt = new Date().toISOString()) {
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt,
        recordCount: records.length,
        records
    };
}

export async function exportToJson(records, filename = 'tdm_backup.json') {
    const json = JSON.stringify(buildBackup(records), null, 2);
    await deliverFile(new Blob([json], { type: 'application/json' }), filename);
}

/**
 * Parse and validate a backup file's contents.
 * Returns { ok: true, records, dropped } or { ok: false, error }.
 * `error` is a code, not a message — the caller localizes it.
 * Individual malformed records are dropped rather than failing the whole
 * import, so one corrupt entry can't cost the user the other 999.
 */
export function parseBackup(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return { ok: false, error: 'parse' };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, error: 'format' };
    }
    if (data.format !== BACKUP_FORMAT) return { ok: false, error: 'format' };
    // Older backups stay readable; a newer file may carry fields we'd silently
    // discard, so refuse it instead of quietly degrading the user's data.
    if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
        return { ok: false, error: 'version' };
    }
    if (!Array.isArray(data.records)) return { ok: false, error: 'format' };

    const records = [];
    let dropped = 0;
    for (const r of data.records) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) { dropped++; continue; }
        if (isNaN(new Date(r.timestamp).getTime())) { dropped++; continue; }
        // A record with no usable id would defeat duplicate detection
        records.push(typeof r.id === 'string' && r.id ? r : { ...r, id: newId() });
    }
    return { ok: true, records, dropped };
}

/**
 * Merge imported records into stored history, skipping ids already present.
 * Existing records are never overwritten or dropped; the only loss case is the
 * MAX_RECORDS trim, which is reported back so the caller can warn about it.
 */
export function mergeHistory(incoming) {
    const history = getHistory();
    const seen = new Set(history.map(r => r.id));
    let added = 0;
    let skipped = 0;

    for (const record of incoming) {
        if (seen.has(record.id)) { skipped++; continue; }
        seen.add(record.id);
        history.push(record);
        added++;
    }

    history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let trimmed = 0;
    if (history.length > MAX_RECORDS) {
        trimmed = history.length - MAX_RECORDS;
        history.splice(0, trimmed);
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
        // Quota exceeded — localStorage keeps its previous contents, so the
        // stored history survives intact and only the import is lost.
        return { ok: false, error: 'quota' };
    }
    return { ok: true, added, skipped, trimmed };
}
