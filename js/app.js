// app.js - Main Application Entry Point

import { getLang, setLang, t as getT, applyLanguage } from './i18n.js';
import { calculatePopulationPK, calculatePeakSS, calculateTroughSS, calculateAUC24 } from './pk-calculations.js';
import { multiPointBayesianFit } from './bayesian-fitting.js';
import { updateChartExtended, updateChartTheme, updateChartLanguage } from './chart.js';
import { validateAllInputs, validateRegimens, setupRealtimeValidation, validateField } from './validation.js';
import { appendHistory, getHistory, filterByDateRange, deleteHistory, clearHistory, exportToCsv } from './history.js';

let currentTheme = localStorage.getItem('theme') || 'light';
let individualizedPK = null;

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // Disclaimer Modal
    // ==========================================
    const disclaimerModal = document.getElementById('disclaimerModal');
    const disclaimerCheckbox = document.getElementById('disclaimerCheckbox');
    const disclaimerAcceptBtn = document.getElementById('disclaimerAcceptBtn');

    if (sessionStorage.getItem('disclaimerAccepted')) {
        disclaimerModal.classList.add('hidden');
    }

    function updateDisclaimerBtn() {
        disclaimerAcceptBtn.disabled = !disclaimerCheckbox.checked;
    }
    disclaimerCheckbox.addEventListener('change', updateDisclaimerBtn);
    disclaimerCheckbox.addEventListener('click', updateDisclaimerBtn);

    disclaimerAcceptBtn.addEventListener('click', () => {
        if (disclaimerCheckbox.checked) {
            disclaimerModal.classList.add('hidden');
            sessionStorage.setItem('disclaimerAccepted', 'true');
        }
    });

    // ==========================================
    // DOM Elements
    // ==========================================
    const calculateBtn = document.getElementById('calculateBtn');
    const inputs = {
        ageYears: document.getElementById('ageYears'),
        ageMonths: document.getElementById('ageMonths'),
        sex: document.getElementById('sex'),
        height: document.getElementById('height'),
        weight: document.getElementById('weight'),
        scr: document.getElementById('scr')
    };
    const pediatricHint = document.getElementById('pediatricHint');

    // Show/hide pediatric hint based on age
    function updatePediatricHint() {
        const years = parseInt(inputs.ageYears.value) || 0;
        pediatricHint.style.display = years < 18 ? 'block' : 'none';
    }
    inputs.ageYears.addEventListener('input', updatePediatricHint);
    inputs.ageMonths.addEventListener('input', updatePediatricHint);

    const outputs = {
        aucValue: document.getElementById('aucValue'),
        aucStatus: document.getElementById('aucStatus'),
        troughValue: document.getElementById('troughValue'),
        troughStatus: document.getElementById('troughStatus'),
        clValue: document.getElementById('clValue'),
        halflifeValue: document.getElementById('halflifeValue'),
        effectivenessText: document.getElementById('effectivenessText'),
        toxicityText: document.getElementById('toxicityText'),
        recommendationText: document.getElementById('recommendationText')
    };

    const themeToggle = document.getElementById('themeToggle');
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    const langToggle = document.getElementById('langToggle');
    const langText = document.getElementById('langText');

    // ==========================================
    // Theme & Language
    // ==========================================
    function applyTheme() {
        const t = getT();
        const themeToggleText = document.querySelector('#themeToggle span[data-i18n]');
        document.documentElement.setAttribute('data-theme', currentTheme);

        if (currentTheme === 'dark') {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
            if (themeToggleText) themeToggleText.textContent = t.themeToggleBright;
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
            if (themeToggleText) themeToggleText.textContent = t.themeToggle;
        }
    }

    // ==========================================
    // Regimen Management
    // ==========================================
    function createRegimenEntry(index) {
        const t = getT();
        const entry = document.createElement('div');
        entry.className = 'regimen-entry';
        entry.dataset.index = index;

        const startLabel = index === 0 ? t.startTime : t.regimenChangeTime;

        entry.innerHTML = `
            <div class="regimen-header">
                <span class="regimen-label">${t.regimenLabel} #${index + 1}</span>
                ${index > 0 ? `<button type="button" class="btn-remove">${t.remove}</button>` : ''}
            </div>
            <div class="grid-2">
                <div class="input-group">
                    <label>${t.dose}</label>
                    <input type="number" class="regimen-dose" required step="250" placeholder="${t.dosePlaceholder}">
                </div>
                <div class="input-group">
                    <label>${t.interval}</label>
                    <input type="number" class="regimen-interval" required step="6" placeholder="${t.intervalPlaceholder}">
                </div>
                <div class="input-group full-width">
                    <label>${startLabel}</label>
                    <input type="datetime-local" class="regimen-start" required>
                </div>
            </div>
        `;

        const removeBtn = entry.querySelector('.btn-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => removeRegimen(index));
        }

        // Real-time validation on dose/interval (start time validated at calculate-time
        // because order depends on sibling regimens)
        entry.querySelector('.regimen-dose').addEventListener('blur', (e) =>
            validateField(e.target, 'dose'));
        entry.querySelector('.regimen-interval').addEventListener('blur', (e) =>
            validateField(e.target, 'interval'));

        return entry;
    }

    function addRegimen() {
        const container = document.getElementById('regimensContainer');
        const index = container.children.length;
        const entry = createRegimenEntry(index);
        container.appendChild(entry);
        entry.classList.add('highlight');
        setTimeout(() => entry.classList.remove('highlight'), 1000);
    }

    function removeRegimen(index) {
        const container = document.getElementById('regimensContainer');
        const entries = container.querySelectorAll('.regimen-entry');
        if (entries.length > 1) {
            entries[index].remove();
            reindexRegimens();
        }
    }

    function reindexRegimens() {
        const t = getT();
        const container = document.getElementById('regimensContainer');
        const entries = container.querySelectorAll('.regimen-entry');

        entries.forEach((entry, i) => {
            entry.dataset.index = i;
            entry.querySelector('.regimen-label').textContent = `${t.regimenLabel} #${i + 1}`;

            // Update start time label (first vs subsequent)
            const startLabel = entry.querySelector('.regimen-start')
                .closest('.input-group').querySelector('label');
            startLabel.textContent = i === 0 ? t.startTime : t.regimenChangeTime;

            let removeBtn = entry.querySelector('.btn-remove');
            if (i === 0 && removeBtn) {
                removeBtn.remove();
            } else if (i > 0 && !removeBtn) {
                const header = entry.querySelector('.regimen-header');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-remove';
                btn.textContent = t.remove;
                btn.addEventListener('click', () => removeRegimen(i));
                header.appendChild(btn);
            }
        });
    }

    function collectRegimens() {
        const entries = document.querySelectorAll('#regimensContainer .regimen-entry');
        const regimens = [];
        entries.forEach(entry => {
            const dose = parseFloat(entry.querySelector('.regimen-dose').value);
            const interval = parseFloat(entry.querySelector('.regimen-interval').value);
            const startStr = entry.querySelector('.regimen-start').value;
            if (dose && interval && startStr) {
                regimens.push({
                    dose,
                    interval,
                    startTime: new Date(startStr)
                });
            }
        });
        return regimens.sort((a, b) => a.startTime - b.startTime);
    }

    // ==========================================
    // Measurement Management
    // ==========================================
    function createMeasurementEntry(index) {
        const t = getT();
        const entry = document.createElement('div');
        entry.className = 'measurement-entry';
        entry.dataset.index = index;

        entry.innerHTML = `
            <div class="measurement-header">
                <span class="measurement-label">${t.measurementLabel} #${index + 1}</span>
                ${index > 0 ? `<button type="button" class="btn-remove">${t.remove}</button>` : ''}
            </div>
            <div class="grid-2">
                <div class="input-group">
                    <label>${t.sampleTime}</label>
                    <input type="datetime-local" class="sample-time" required>
                    <small class="hint">${t.sampleTimeHint}</small>
                </div>
                <div class="input-group">
                    <label>${t.measuredConc}</label>
                    <input type="number" class="measured-conc" required step="0.1" min="0" placeholder="${t.measuredConcPlaceholder}">
                    <small class="hint">${t.measuredConcHint}</small>
                </div>
            </div>
        `;

        const removeBtn = entry.querySelector('.btn-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => removeMeasurement(index));
        }
        return entry;
    }

    function addMeasurement() {
        const container = document.getElementById('measurementsContainer');
        const index = container.children.length;
        const entry = createMeasurementEntry(index);
        container.appendChild(entry);
        entry.classList.add('highlight');
        setTimeout(() => entry.classList.remove('highlight'), 1000);
    }

    function removeMeasurement(index) {
        const container = document.getElementById('measurementsContainer');
        const entries = container.querySelectorAll('.measurement-entry');
        if (entries.length > 1) {
            entries[index].remove();
            reindexMeasurements();
        }
    }

    function reindexMeasurements() {
        const t = getT();
        const container = document.getElementById('measurementsContainer');
        const entries = container.querySelectorAll('.measurement-entry');

        entries.forEach((entry, i) => {
            entry.dataset.index = i;
            entry.querySelector('.measurement-label').textContent = `${t.measurementLabel} #${i + 1}`;

            let removeBtn = entry.querySelector('.btn-remove');
            if (i === 0 && removeBtn) {
                removeBtn.remove();
            } else if (i > 0 && !removeBtn) {
                const header = entry.querySelector('.measurement-header');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-remove';
                btn.textContent = t.remove;
                btn.addEventListener('click', () => removeMeasurement(i));
                header.appendChild(btn);
            }
        });
    }

    function collectMeasurements() {
        const entries = document.querySelectorAll('#measurementsContainer .measurement-entry');
        const measurements = [];

        entries.forEach(entry => {
            const timeInput = entry.querySelector('.sample-time');
            const concInput = entry.querySelector('.measured-conc');
            if (timeInput.value && concInput.value) {
                measurements.push({
                    time: new Date(timeInput.value),
                    concentration: parseFloat(concInput.value)
                });
            }
        });

        return measurements.sort((a, b) => a.time - b.time);
    }

    // ==========================================
    // Main TDM Calculation
    // ==========================================
    function calculateTDM() {
        const t = getT();
        const lang = getLang();

        const ageYears = parseInt(inputs.ageYears.value) || 0;
        const ageMonths = parseInt(inputs.ageMonths.value) || 0;
        const age = ageYears + ageMonths / 12;
        const sex = inputs.sex.value;
        const height = parseFloat(inputs.height.value);
        const weight = parseFloat(inputs.weight.value);
        const scr = parseFloat(inputs.scr.value);

        if (inputs.ageYears.value === '' || !height || !weight || !scr) {
            alert(t.fillAllFields);
            return;
        }

        // Validate patient demographics first (no regimens passed yet for warnings)
        const { valid: demoValid } = validateAllInputs(inputs, null);
        if (!demoValid) return;

        // Per-regimen validation (dose/interval ranges + chronological order)
        if (!validateRegimens()) return;

        const regimens = collectRegimens();
        if (regimens.length === 0) {
            alert(t.noRegimens);
            return;
        }
        const firstRegimen = regimens[0];
        const lastRegimen = regimens[regimens.length - 1];

        // Clinical warnings (now with regimens, e.g. unusual mg/kg dose)
        const { warnings } = validateAllInputs(inputs, regimens);
        if (warnings.length > 0) {
            const proceed = confirm(warnings.join('\n') + '\n\n' +
                (lang === 'en' ? 'Do you want to proceed?' : '계속 진행하시겠습니까?'));
            if (!proceed) return;
        }

        const measurements = collectMeasurements();
        if (measurements.length === 0) {
            alert(t.noMeasurements);
            return;
        }

        for (const m of measurements) {
            if (m.time < firstRegimen.startTime) {
                alert(lang === 'en'
                    ? 'All sample times must be after the first dose time!'
                    : '모든 채혈 시간은 첫 투약 시간 이후여야 합니다!');
                return;
            }
        }

        // Population PK (patient-level, regimen-independent)
        const popPK = calculatePopulationPK(age, sex, height, weight, scr);
        const populationPK = { kel: popPK.kel, vd: popPK.vd };

        // Bayesian fitting using the full regimen sequence
        individualizedPK = multiPointBayesianFit({ regimens }, measurements, populationPK);
        const { kel, vd, cl, halfLife, fitQuality } = individualizedPK;

        // Steady-state metrics reflect the LAST regimen — what the patient is now on
        const peakSS = calculatePeakSS(lastRegimen.dose, vd, kel, lastRegimen.interval);
        const troughSS = calculateTroughSS(peakSS, kel, lastRegimen.interval);
        const auc24 = calculateAUC24(lastRegimen.dose, lastRegimen.interval, cl);

        outputs.aucValue.textContent = auc24.toFixed(1);
        outputs.troughValue.textContent = troughSS.toFixed(1);
        outputs.clValue.textContent = cl.toFixed(2);
        outputs.halflifeValue.textContent = halfLife.toFixed(1);

        updateStatus(auc24, troughSS);
        displayFitQuality(fitQuality);
        updateChartExtended(peakSS, kel, vd, regimens, measurements, currentTheme, individualizedPK);
        generateSpecificDoseRecommendations(individualizedPK, lastRegimen.dose, lastRegimen.interval);

        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('simulationBox').style.display = 'block';
        document.getElementById('doseRecommendationsBox').style.display = 'block';

        let watermark = document.querySelector('.results-watermark');
        if (!watermark) {
            watermark = document.createElement('div');
            watermark.className = 'results-watermark';
            document.getElementById('resultsSection').appendChild(watermark);
        }
        watermark.textContent = t.resultsWatermark;

        appendHistory({
            patient: {
                ageYears, ageMonths, sex, height, weight, scr,
                pediatric: popPK.pediatric
            },
            regimens: regimens.map(r => ({
                dose: r.dose,
                interval: r.interval,
                startTime: r.startTime.toISOString()
            })),
            measurements: measurements.map(m => ({
                time: m.time.toISOString(),
                concentration: m.concentration
            })),
            results: {
                auc24, trough: troughSS, peakSS, cl, halfLife, kel, vd,
                crcl: popPK.crcl,
                fitQuality: {
                    rSquared: fitQuality.rSquared,
                    rmse: fitQuality.rmse,
                    measurementCount: fitQuality.measurementCount
                }
            }
        });
    }

    // ==========================================
    // Fit Quality Display
    // ==========================================
    function displayFitQuality(fitQuality) {
        const t = getT();
        let indicator = document.querySelector('.fit-quality-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'fit-quality-indicator';
            document.querySelector('.results-grid').after(indicator);
        }

        let qualityClass, qualityText;
        if (fitQuality.measurementCount === 1) {
            qualityClass = 'moderate';
            qualityText = t.fitQualitySinglePoint;
        } else if (fitQuality.rSquared > 0.9) {
            qualityClass = 'good';
            qualityText = `${t.fitQualityGood} (R² = ${fitQuality.rSquared.toFixed(3)})`;
        } else if (fitQuality.rSquared > 0.7) {
            qualityClass = 'moderate';
            qualityText = `${t.fitQualityModerate} (R² = ${fitQuality.rSquared.toFixed(3)})`;
        } else {
            qualityClass = 'poor';
            qualityText = `${t.fitQualityPoor} (R² = ${fitQuality.rSquared.toFixed(3)})`;
        }

        indicator.innerHTML = `
            <span class="fit-quality-label">${t.fitQualityLabel}:</span>
            <span class="fit-quality-value ${qualityClass}">${qualityText}</span>
            <span class="fit-quality-details">(RMSE: ${fitQuality.rmse.toFixed(2)} mg/L, n=${fitQuality.measurementCount})</span>
        `;
    }

    // ==========================================
    // Dose Recommendations
    // ==========================================
    function generateSpecificDoseRecommendations(pk, currentDose, currentInterval) {
        const t = getT();
        const container = document.getElementById('doseOptions');

        const doseOptions = [
            { dose: 500, interval: 8 }, { dose: 750, interval: 8 }, { dose: 1000, interval: 8 },
            { dose: 500, interval: 12 }, { dose: 750, interval: 12 }, { dose: 1000, interval: 12 },
            { dose: 1250, interval: 12 }, { dose: 1500, interval: 12 },
            { dose: 1000, interval: 24 }, { dose: 1250, interval: 24 },
            { dose: 1500, interval: 24 }, { dose: 1750, interval: 24 },
            { dose: currentDose, interval: currentInterval, isCurrent: true }
        ];

        const results = doseOptions.map(option => {
            const totalDailyDose = (24 / option.interval) * option.dose;
            const auc24 = totalDailyDose / pk.cl;
            const peak = (option.dose / pk.vd) * (1 / (1 - Math.exp(-pk.kel * option.interval)));
            const trough = peak * Math.exp(-pk.kel * option.interval);

            let status, statusClass;
            if (auc24 >= 400 && auc24 <= 600 && trough >= 10 && trough <= 20) {
                status = t.doseStatusOptimal; statusClass = 'success';
            } else if (auc24 < 400) {
                status = t.doseStatusSubtherapeutic; statusClass = 'warning';
            } else if (auc24 > 600 || trough > 20) {
                status = t.doseStatusToxicRisk; statusClass = 'danger';
            } else {
                status = t.doseStatusAcceptable; statusClass = 'success';
            }

            return {
                ...option, auc24, peak, trough, status, statusClass,
                isRecommended: auc24 >= 400 && auc24 <= 600 && trough >= 10 && trough <= 20
            };
        });

        results.sort((a, b) => Math.abs(a.auc24 - 500) - Math.abs(b.auc24 - 500));
        const filtered = results.filter(r => r.auc24 >= 250 && r.auc24 <= 900);

        container.innerHTML = `
            <div class="dose-options-header">
                <span>${t.doseOptionDose}</span><span>${t.doseOptionAUC}</span>
                <span>${t.doseOptionTrough}</span><span>${t.doseOptionStatus}</span>
            </div>
            ${filtered.slice(0, 8).map(r => `
                <div class="dose-option ${r.isRecommended ? 'recommended' : ''} ${r.isCurrent ? 'current' : ''}">
                    <div class="dose-option-label">
                        ${r.dose}mg q${r.interval}h
                        ${r.isCurrent ? `<span class="current-badge">${t.currentRegimen}</span>` : ''}
                    </div>
                    <div class="dose-option-auc"><strong>${r.auc24.toFixed(0)}</strong> mg·h/L</div>
                    <div class="dose-option-trough">${r.trough.toFixed(1)} mg/L</div>
                    <div class="dose-option-status"><span class="status-badge ${r.statusClass}">${r.status}</span></div>
                </div>
            `).join('')}
        `;

        // Update main recommendation
        const bestOption = filtered.find(r => r.isRecommended && !r.isCurrent);
        const currentResult = results.find(r => r.isCurrent);

        let recText = '';
        if (currentResult && currentResult.isRecommended) {
            recText = t.recAppropriate;
        } else if (bestOption && currentResult) {
            recText = t.recommendChange
                .replace('%CURRENT%', `${currentDose}mg q${currentInterval}h`)
                .replace('%RECOMMENDED%', `${bestOption.dose}mg q${bestOption.interval}h`)
                .replace('%NEWAUC%', bestOption.auc24.toFixed(0))
                .replace('%OLDAUC%', currentResult.auc24.toFixed(0));
        } else if (currentResult) {
            recText = currentResult.auc24 < 400 ? t.recIncrease : t.recDecrease;
        }
        outputs.recommendationText.textContent = recText;
    }

    // ==========================================
    // Dose Simulation
    // ==========================================
    function simulateDose() {
        const t = getT();
        const lang = getLang();

        if (!individualizedPK) {
            alert(lang === 'en'
                ? 'Please calculate TDM first before simulating doses.'
                : '먼저 TDM을 계산한 후 용량 시뮬레이션을 실행하세요.');
            return;
        }

        const simDose = parseFloat(document.getElementById('simDose').value);
        const simInterval = parseFloat(document.getElementById('simInterval').value);

        if (!simDose) {
            alert(lang === 'en' ? 'Please enter a dose to simulate.' : '시뮬레이션할 용량을 입력하세요.');
            return;
        }

        const pk = individualizedPK;
        const totalDailyDose = (24 / simInterval) * simDose;
        const auc24 = totalDailyDose / pk.cl;
        const peak = (simDose / pk.vd) * (1 / (1 - Math.exp(-pk.kel * simInterval)));
        const trough = peak * Math.exp(-pk.kel * simInterval);

        let aucStatusText, aucStatusClass;
        if (auc24 >= 400 && auc24 <= 600) { aucStatusText = t.aucTarget; aucStatusClass = 'success'; }
        else if (auc24 < 400) { aucStatusText = t.aucLow; aucStatusClass = 'warning'; }
        else { aucStatusText = t.aucHigh; aucStatusClass = 'danger'; }

        let troughStatusText, troughStatusClass;
        if (trough >= 10 && trough <= 20) { troughStatusText = t.troughAcceptable; troughStatusClass = 'success'; }
        else if (trough < 10) { troughStatusText = t.troughLow; troughStatusClass = 'warning'; }
        else { troughStatusText = t.troughHigh; troughStatusClass = 'danger'; }

        document.getElementById('simulationResults').innerHTML = `
            <div class="simulation-result-grid">
                <div class="sim-result-item">
                    <span class="sim-result-label">${t.auc24}:</span>
                    <span class="sim-result-value">${auc24.toFixed(0)} mg·h/L</span>
                    <span class="status-badge ${aucStatusClass}">${aucStatusText}</span>
                </div>
                <div class="sim-result-item">
                    <span class="sim-result-label">${lang === 'en' ? 'Peak (Cmax)' : '최고 농도'}:</span>
                    <span class="sim-result-value">${peak.toFixed(1)} mg/L</span>
                </div>
                <div class="sim-result-item">
                    <span class="sim-result-label">${t.trough}:</span>
                    <span class="sim-result-value">${trough.toFixed(1)} mg/L</span>
                    <span class="status-badge ${troughStatusClass}">${troughStatusText}</span>
                </div>
            </div>
        `;
    }

    // ==========================================
    // Status & Interpretation
    // ==========================================
    function updateStatus(auc, trough) {
        const t = getT();

        let aucClass, aucMsg;
        if (auc < 400) { aucClass = 'warning'; aucMsg = t.aucLow; }
        else if (auc <= 600) { aucClass = 'success'; aucMsg = t.aucTarget; }
        else { aucClass = 'danger'; aucMsg = t.aucHigh; }

        outputs.aucStatus.className = `status-badge ${aucClass}`;
        outputs.aucStatus.textContent = aucMsg;

        let troughClass, troughMsg;
        if (trough < 10) { troughClass = 'warning'; troughMsg = t.troughLow; }
        else if (trough <= 20) { troughClass = 'success'; troughMsg = t.troughAcceptable; }
        else { troughClass = 'danger'; troughMsg = t.troughHigh; }

        outputs.troughStatus.className = `status-badge ${troughClass}`;
        outputs.troughStatus.textContent = troughMsg;

        if (auc < 400) {
            outputs.effectivenessText.textContent = t.effectivenessLow;
            outputs.effectivenessText.style.color = '#d97706';
        } else {
            outputs.effectivenessText.textContent = t.effectivenessGood;
            outputs.effectivenessText.style.color = '#059669';
        }

        if (auc > 600 || trough > 20) {
            outputs.toxicityText.textContent = t.toxicityHigh;
            outputs.toxicityText.style.color = '#dc2626';
        } else {
            outputs.toxicityText.textContent = t.toxicityLow;
            outputs.toxicityText.style.color = '#059669';
        }
    }

    // ==========================================
    // Initialize
    // ==========================================
    applyTheme();
    applyLanguage();
    langText.textContent = getLang() === 'en' ? '한국어' : 'English';
    addRegimen();
    addMeasurement();
    setupRealtimeValidation();

    // ==========================================
    // Save / Load / Print
    // ==========================================
    function savePatientData() {
        const t = getT();
        const data = {};
        for (const [key, input] of Object.entries(inputs)) {
            data[key] = input.value;
        }

        data.regimens = [];
        document.querySelectorAll('#regimensContainer .regimen-entry').forEach(entry => {
            data.regimens.push({
                dose: entry.querySelector('.regimen-dose').value,
                interval: entry.querySelector('.regimen-interval').value,
                startTime: entry.querySelector('.regimen-start').value
            });
        });

        data.measurements = [];
        document.querySelectorAll('#measurementsContainer .measurement-entry').forEach(entry => {
            data.measurements.push({
                time: entry.querySelector('.sample-time').value,
                conc: entry.querySelector('.measured-conc').value
            });
        });

        localStorage.setItem('tdm_patient_data', JSON.stringify(data));
        alert(t.dataSaved);
    }

    function loadPatientData() {
        const t = getT();
        const saved = localStorage.getItem('tdm_patient_data');
        if (!saved) {
            alert(t.noSavedData);
            return;
        }

        if (!confirm(t.confirmLoad)) return;

        const data = JSON.parse(saved);
        for (const [key, input] of Object.entries(inputs)) {
            if (data[key] !== undefined) input.value = data[key];
        }

        // Restore regimens (with backward compat for legacy single-regimen schema)
        let regimensData = data.regimens;
        if (!regimensData && data.dose) {
            regimensData = [{
                dose: data.dose,
                interval: data.interval,
                startTime: data.startTime
            }];
        }
        if (!regimensData || regimensData.length === 0) {
            regimensData = [{ dose: '', interval: '', startTime: '' }];
        }
        const regContainer = document.getElementById('regimensContainer');
        regContainer.innerHTML = '';
        regimensData.forEach((r, i) => {
            const entry = createRegimenEntry(i);
            regContainer.appendChild(entry);
            entry.querySelector('.regimen-dose').value = r.dose || '';
            entry.querySelector('.regimen-interval').value = r.interval || '';
            entry.querySelector('.regimen-start').value = r.startTime || '';
        });

        if (data.measurements && data.measurements.length > 0) {
            const container = document.getElementById('measurementsContainer');
            container.innerHTML = '';

            data.measurements.forEach((m, i) => {
                const entry = createMeasurementEntry(i);
                container.appendChild(entry);
                if (m.time) entry.querySelector('.sample-time').value = m.time;
                if (m.conc) entry.querySelector('.measured-conc').value = m.conc;
            });
        }

        updatePediatricHint();
        alert(t.dataLoaded);
    }

    function resetPatientData() {
        const t = getT();
        if (!confirm(t.confirmReset)) return;

        for (const input of Object.values(inputs)) {
            input.value = '';
        }

        const regContainer = document.getElementById('regimensContainer');
        regContainer.innerHTML = '';
        regContainer.appendChild(createRegimenEntry(0));

        const container = document.getElementById('measurementsContainer');
        container.innerHTML = '';
        container.appendChild(createMeasurementEntry(0));

        document.getElementById('resultsSection').style.display = 'none';
        document.getElementById('simulationBox').style.display = 'none';
        document.getElementById('doseRecommendationsBox').style.display = 'none';
        document.getElementById('recommendationText').textContent = t.recommendationPlaceholder;

        updatePediatricHint();
    }

    // ==========================================
    // History Modal
    // ==========================================
    const historyModal = document.getElementById('historyModal');
    const historyFrom = document.getElementById('historyFrom');
    const historyTo = document.getElementById('historyTo');
    const historyTableBody = document.getElementById('historyTableBody');
    const historySummary = document.getElementById('historySummary');

    function currentFilteredRecords() {
        const from = historyFrom.value || null;
        const to = historyTo.value || null;
        if (!from && !to) return getHistory();
        return filterByDateRange(from, to);
    }

    function formatTs(iso) {
        const d = new Date(iso);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function renderHistoryTable() {
        const t = getT();
        const records = currentFilteredRecords().slice().reverse();
        historySummary.textContent = `${t.historyCount}: ${records.length}`;

        if (records.length === 0) {
            historyTableBody.innerHTML = `<tr><td colspan="6" class="history-empty">${t.historyEmpty}</td></tr>`;
            return;
        }

        historyTableBody.innerHTML = records.map(r => {
            const p = r.patient || {};
            const res = r.results || {};
            // Backward compat: pre-multi-regimen records used `r.dosing`
            const regimens = r.regimens || (r.dosing ? [r.dosing] : []);
            const last = regimens[regimens.length - 1] || {};
            const regimenLabel = regimens.length > 1
                ? `${last.dose}mg q${last.interval}h (×${regimens.length})`
                : `${last.dose}mg q${last.interval}h`;
            const ageLabel = p.pediatric && p.ageMonths
                ? `${p.ageYears}y${p.ageMonths}m`
                : `${p.ageYears}y`;
            return `
                <tr>
                    <td>${formatTs(r.timestamp)}</td>
                    <td>${ageLabel} / ${p.sex === 'male' ? 'M' : 'F'} / ${p.weight}kg</td>
                    <td>${regimenLabel}</td>
                    <td>${typeof res.auc24 === 'number' ? res.auc24.toFixed(1) : '-'}</td>
                    <td>${typeof res.trough === 'number' ? res.trough.toFixed(1) : '-'}</td>
                    <td><button class="history-delete-btn" data-id="${r.id}" aria-label="Delete">✕</button></td>
                </tr>
            `;
        }).join('');
    }

    function openHistoryModal() {
        historyModal.classList.remove('hidden');
        renderHistoryTable();
    }

    function closeHistoryModal() {
        historyModal.classList.add('hidden');
    }

    historyTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.history-delete-btn');
        if (!btn) return;
        const t = getT();
        if (!confirm(t.historyConfirmDelete)) return;
        deleteHistory(btn.dataset.id);
        renderHistoryTable();
    });

    document.getElementById('historyApplyBtn').addEventListener('click', renderHistoryTable);
    document.getElementById('historyResetFilterBtn').addEventListener('click', () => {
        historyFrom.value = '';
        historyTo.value = '';
        renderHistoryTable();
    });
    document.getElementById('historyExportBtn').addEventListener('click', () => {
        const t = getT();
        const records = currentFilteredRecords();
        if (records.length === 0) {
            alert(t.historyNothingToExport);
            return;
        }
        const stamp = new Date().toISOString().slice(0, 10);
        exportToCsv(records, `tdm_history_${stamp}.csv`, getLang());
    });
    document.getElementById('historyClearBtn').addEventListener('click', () => {
        const t = getT();
        if (!confirm(t.historyConfirmClear)) return;
        clearHistory();
        renderHistoryTable();
    });
    document.getElementById('historyCloseBtn').addEventListener('click', closeHistoryModal);
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) closeHistoryModal();
    });

    // Event Listeners
    document.getElementById('addRegimenBtn').addEventListener('click', addRegimen);
    document.getElementById('addMeasurementBtn').addEventListener('click', addMeasurement);
    document.getElementById('simulateBtn').addEventListener('click', simulateDose);
    calculateBtn.addEventListener('click', calculateTDM);
    document.getElementById('saveDataBtn').addEventListener('click', savePatientData);
    document.getElementById('loadDataBtn').addEventListener('click', loadPatientData);
    document.getElementById('printBtn').addEventListener('click', () => window.print());
    document.getElementById('resetBtn').addEventListener('click', resetPatientData);
    document.getElementById('historyBtn').addEventListener('click', openHistoryModal);

    themeToggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme();
        localStorage.setItem('theme', currentTheme);
        updateChartTheme(currentTheme);
    });

    langToggle.addEventListener('click', () => {
        const newLang = getLang() === 'en' ? 'ko' : 'en';
        setLang(newLang);
        applyLanguage();
        applyTheme();
        langText.textContent = newLang === 'en' ? '한국어' : 'English';
        localStorage.setItem('language', newLang);
        reindexRegimens();
        reindexMeasurements();
        updateChartLanguage();
    });
});
