// validation.js - Input Validation Module

import { translations, getLang } from './i18n.js';

export const validationRules = {
    ageYears:  { min: 0,   max: 120, key: 'valAgeRange' },
    ageMonths: { min: 0,   max: 11,  key: 'valAgeMonthsRange' },
    height:    { min: 20,  max: 250, key: 'valHeightRange' },
    weight:    { min: 0.5, max: 300, key: 'valWeightRange' },
    scr:       { min: 0.1, max: 15,  key: 'valScrRange' },
    dose:      { min: 1,   max: 5000, key: 'valDoseRange' },
    interval:  { min: 4,   max: 72,  key: 'valIntervalRange' }
};

/**
 * Validate a single field against its rule
 */
export function validateField(input, ruleName) {
    const rule = validationRules[ruleName];
    if (!rule) return true;

    // ageMonths is always optional — skip validation if empty
    if (ruleName === 'ageMonths' && input.value === '') {
        const group = input.closest('.input-group');
        if (group) {
            const errorEl = group.querySelector('.validation-error');
            if (errorEl) errorEl.textContent = '';
            group.classList.remove('has-error');
        }
        return true;
    }

    const value = parseFloat(input.value);
    const group = input.closest('.input-group');
    if (!group) return true;

    let errorEl = group.querySelector('.validation-error');
    if (!errorEl) {
        errorEl = document.createElement('small');
        errorEl.className = 'validation-error';
        group.appendChild(errorEl);
    }

    if (isNaN(value) || value < rule.min || value > rule.max) {
        const t = translations[getLang()];
        errorEl.textContent = t[rule.key];
        group.classList.add('has-error');
        return false;
    }

    errorEl.textContent = '';
    group.classList.remove('has-error');
    return true;
}

/**
 * Validate patient demographic inputs and return { valid, warnings }.
 * ageMonths is always optional — Schwartz equation applies up to age 18 (conventional cutoff).
 * If ageYears >= 18, months field is irrelevant and skipped entirely.
 *
 * @param {Object} inputs - patient demographic input elements
 * @param {Array}  [regimens] - parsed regimens for cross-cutting clinical warnings
 */
export function validateAllInputs(inputs, regimens) {
    const t = translations[getLang()];
    let valid = true;
    const warnings = [];

    const ageYears = parseInt((inputs.ageYears || {}).value) || 0;

    for (const [name, input] of Object.entries(inputs)) {
        // ageMonths: skip if adult (≥18) or if field is empty (months always optional)
        if (name === 'ageMonths' && (ageYears >= 18 || input.value === '')) continue;
        if (validationRules[name]) {
            valid = validateField(input, name) && valid;
        }
    }

    // Check concentration values
    const concInputs = document.querySelectorAll('.measured-conc');
    concInputs.forEach(input => {
        const val = parseFloat(input.value);
        if (input.value && (isNaN(val) || val < 0.1 || val > 100)) {
            const group = input.closest('.input-group');
            let errorEl = group.querySelector('.validation-error');
            if (!errorEl) {
                errorEl = document.createElement('small');
                errorEl.className = 'validation-error';
                group.appendChild(errorEl);
            }
            errorEl.textContent = t.valConcRange;
            group.classList.add('has-error');
            valid = false;
        }
    });

    // Clinical warnings (non-blocking)
    const weight = parseFloat(inputs.weight.value);
    if (regimens && weight) {
        for (const r of regimens) {
            if (r.dose / weight > 30) {
                warnings.push(t.valDoseWarning);
                break; // surface once even if multiple regimens exceed
            }
        }
    }

    const scr = parseFloat(inputs.scr.value);
    if ((ageYears > 85) || (weight && weight > 150) || (scr && scr < 0.4)) {
        warnings.push(t.valCrclWarning);
    }

    return { valid, warnings };
}

/**
 * Validate every regimen entry in the DOM.
 * - Dose and interval use the shared validationRules.
 * - Start time is required and must be strictly later than the previous regimen's.
 */
export function validateRegimens() {
    const t = translations[getLang()];
    const entries = document.querySelectorAll('#regimensContainer .regimen-entry');
    let valid = true;
    let prevStart = null;

    entries.forEach(entry => {
        const doseInput = entry.querySelector('.regimen-dose');
        const intervalInput = entry.querySelector('.regimen-interval');
        const startInput = entry.querySelector('.regimen-start');

        valid = validateField(doseInput, 'dose') && valid;
        valid = validateField(intervalInput, 'interval') && valid;

        const startGroup = startInput.closest('.input-group');
        let errorEl = startGroup.querySelector('.validation-error');
        if (!errorEl) {
            errorEl = document.createElement('small');
            errorEl.className = 'validation-error';
            startGroup.appendChild(errorEl);
        }

        if (!startInput.value) {
            errorEl.textContent = t.valStartTimeRequired;
            startGroup.classList.add('has-error');
            valid = false;
        } else {
            const startTime = new Date(startInput.value);
            if (prevStart && startTime <= prevStart) {
                errorEl.textContent = t.valRegimenOrder;
                startGroup.classList.add('has-error');
                valid = false;
            } else {
                errorEl.textContent = '';
                startGroup.classList.remove('has-error');
                prevStart = startTime;
            }
        }
    });

    return valid;
}

/**
 * Set up real-time validation on blur for all validatable fields
 */
export function setupRealtimeValidation() {
    Object.keys(validationRules).forEach(fieldName => {
        const input = document.getElementById(fieldName);
        if (input) {
            input.addEventListener('blur', () => validateField(input, fieldName));
        }
    });
}
