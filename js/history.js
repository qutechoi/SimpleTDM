// history.js - Calculation history storage and CSV export

const STORAGE_KEY = 'tdm_history';
const MAX_RECORDS = 1000;

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

const CSV_COLUMNS = [
    'Timestamp', 'AgeYears', 'AgeMonths', 'Sex', 'Pediatric',
    'Height_cm', 'Weight_kg', 'SCr_mg_dL',
    'Dose_mg', 'Interval_h', 'FirstDoseTime', 'MeasurementCount',
    'AUC24', 'Trough_mg_L', 'Peak_mg_L', 'Clearance_L_h',
    'HalfLife_h', 'Kel_per_h', 'Vd_L', 'CrCl_mL_min',
    'R_squared', 'RMSE'
];

function csvEscape(value) {
    if (value == null) return '';
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function recordToRow(r) {
    const p = r.patient || {};
    const d = r.dosing || {};
    const res = r.results || {};
    const fq = res.fitQuality || {};
    return [
        r.timestamp,
        p.ageYears, p.ageMonths ?? '', p.sex, p.pediatric ? 'yes' : 'no',
        p.height, p.weight, p.scr,
        d.dose, d.interval, d.startTime, (r.measurements || []).length,
        num(res.auc24, 1), num(res.trough, 1), num(res.peakSS, 1), num(res.cl, 2),
        num(res.halfLife, 2), num(res.kel, 5), num(res.vd, 2), num(res.crcl, 1),
        fq.rSquared != null ? fq.rSquared.toFixed(3) : '',
        num(fq.rmse, 3)
    ];
}

function num(v, digits) {
    return typeof v === 'number' && isFinite(v) ? v.toFixed(digits) : '';
}

export function exportToCsv(records, filename = 'tdm_history.csv') {
    const header = CSV_COLUMNS.join(',');
    const rows = records.map(r => recordToRow(r).map(csvEscape).join(','));
    const csv = '\uFEFF' + [header, ...rows].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
