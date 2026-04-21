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

const CSV_LOCALES = {
    en: {
        headers: [
            'Timestamp', 'AgeYears', 'AgeMonths', 'Sex', 'Pediatric',
            'Height_cm', 'Weight_kg', 'SCr_mg_dL',
            'Dose_mg', 'Interval_h', 'FirstDoseTime', 'MeasurementCount',
            'AUC24', 'Trough_mg_L', 'Peak_mg_L', 'Clearance_L_h',
            'HalfLife_h', 'Kel_per_h', 'Vd_L', 'CrCl_mL_min',
            'R_squared', 'RMSE', 'Effectiveness', 'Toxicity'
        ],
        sex: { male: 'male', female: 'female' },
        pediatric: { true: 'yes', false: 'no' },
        effectiveness: { good: 'Good', low: 'Low' },
        toxicity: { low: 'Low', high: 'High' }
    },
    ko: {
        headers: [
            '일시', '나이(세)', '나이(개월)', '성별', '환자구분',
            '키(cm)', '체중(kg)', '혈청크레아티닌(mg/dL)',
            '용량(mg)', '투약간격(h)', '첫투약시간', '측정횟수',
            'AUC24', 'Trough(mg/L)', 'Peak(mg/L)', '청소율(L/h)',
            '반감기(h)', 'Kel(1/h)', 'Vd(L)', 'CrCl(mL/min)',
            'R제곱', 'RMSE', '효과예측', '독성평가'
        ],
        sex: { male: '남', female: '여' },
        pediatric: { true: '소아', false: '성인' },
        effectiveness: { good: '양호', low: '저하' },
        toxicity: { low: '낮음', high: '위험' }
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
    const d = r.dosing || {};
    const res = r.results || {};
    const fq = res.fitQuality || {};
    const effKey = assessEffectiveness(res.auc24);
    const toxKey = assessToxicity(res.auc24, res.trough);
    return [
        r.timestamp,
        p.ageYears, p.ageMonths ?? '',
        locale.sex[p.sex] ?? p.sex ?? '',
        locale.pediatric[p.pediatric ? 'true' : 'false'],
        p.height, p.weight, p.scr,
        d.dose, d.interval, d.startTime, (r.measurements || []).length,
        num(res.auc24, 1), num(res.trough, 1), num(res.peakSS, 1), num(res.cl, 2),
        num(res.halfLife, 2), num(res.kel, 5), num(res.vd, 2), num(res.crcl, 1),
        fq.rSquared != null ? fq.rSquared.toFixed(3) : '',
        num(fq.rmse, 3),
        effKey ? locale.effectiveness[effKey] : '',
        toxKey ? locale.toxicity[toxKey] : ''
    ];
}

export async function exportToCsv(records, filename = 'tdm_history.csv', lang = 'en') {
    const locale = CSV_LOCALES[lang] || CSV_LOCALES.en;
    const header = locale.headers.join(',');
    const rows = records.map(r => recordToRow(r, locale).map(csvEscape).join(','));
    const csv = '\uFEFF' + [header, ...rows].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const file = new File([blob], filename, { type: 'text/csv;charset=utf-8' });

    // On mobile, the OS share sheet surfaces KakaoTalk (and other messaging
    // apps) as a target. Kakao has no public web-SDK for sending files, so
    // routing through the native share sheet is the only viable path.
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
