// pk-calculations.js - Pharmacokinetic Calculation Functions

/**
 * Calculate Ideal Body Weight (Devine formula)
 */
export function calculateIBW(sex, height) {
    return sex === 'male'
        ? 50 + 0.9 * (height - 152)
        : 45.5 + 0.9 * (height - 152);
}

/**
 * Calculate Adjusted Body Weight
 */
export function calculateAdjBW(ibw, actualWeight) {
    return ibw + 0.4 * (actualWeight - ibw);
}

/**
 * Determine weight for CrCl calculation
 */
export function getWeightForCrCl(weight, ibw, adjBw) {
    if (weight < ibw) return weight;
    if (weight > 1.2 * ibw) return adjBw;
    return weight;
}

/**
 * Calculate Creatinine Clearance (Cockcroft-Gault)
 */
export function calculateCrCl(age, weight, scr, sex) {
    let crcl = ((140 - age) * weight) / (72 * scr);
    if (sex === 'female') crcl *= 0.85;
    return crcl;
}

/**
 * Calculate population elimination rate constant (Matzke equation)
 */
export function calculateKelPop(crcl) {
    return 0.00083 * crcl + 0.0044;
}

/**
 * Calculate population Volume of Distribution
 */
export function calculateVdPop(weight) {
    return 0.7 * weight;
}

/**
 * Calculate steady-state peak concentration
 */
export function calculatePeakSS(dose, vd, kel, interval) {
    return (dose / vd) * (1 / (1 - Math.exp(-kel * interval)));
}

/**
 * Calculate steady-state trough concentration
 */
export function calculateTroughSS(peakSS, kel, interval) {
    return peakSS * Math.exp(-kel * interval);
}

/**
 * Calculate AUC over 24 hours
 */
export function calculateAUC24(dose, interval, cl) {
    const totalDailyDose = (24 / interval) * dose;
    return totalDailyDose / cl;
}

/**
 * Calculate half-life from elimination rate constant
 */
export function calculateHalfLife(kel) {
    return 0.693 / kel;
}

/**
 * Determine if patient is pediatric (< 18 years)
 */
export function isPediatric(ageInYears) {
    return ageInYears < 18;
}

/**
 * Calculate Schwartz CrCl for pediatric patients
 * CrCl (mL/min/1.73m²) = k × Height(cm) / SCr(mg/dL)
 *
 * k values:
 * - Preterm neonate: 0.33
 * - Full-term neonate (< 1 year): 0.45
 * - Child 1-12 years: 0.55
 * - Adolescent female 13-17: 0.55
 * - Adolescent male 13-17: 0.70
 */
export function calculateSchwartzCrCl(ageInYears, height, scr, sex) {
    let k;
    if (ageInYears < 1) {
        k = 0.45; // full-term infant
    } else if (ageInYears <= 12) {
        k = 0.55;
    } else {
        // adolescent 13-17
        k = sex === 'male' ? 0.70 : 0.55;
    }
    return (k * height) / scr;
}

/**
 * Calculate pediatric population Vd
 * Neonates/infants tend to have higher Vd per kg
 * - Neonate (< 1 month): 0.5-0.7 L/kg
 * - Infant (1 month - 1 year): 0.7 L/kg
 * - Child (1-12 years): 0.7 L/kg
 * - Adolescent: 0.7 L/kg
 */
export function calculateVdPopPediatric(weight, ageInYears) {
    if (ageInYears < 1 / 12) {
        return 0.6 * weight; // neonates
    }
    return 0.7 * weight; // infants and children same as adult per-kg
}

/**
 * Calculate all population PK parameters for a patient.
 * Routes to neonatal (Frymoyer) → pediatric (Schwartz) → adult (Cockcroft-Gault) by precedence.
 *
 * @param {number} age - Age in years (can be fractional, e.g. 0.5 for 6 months)
 * @param {Object} [neonatal] - Optional neonatal context {gaWeeks, pnaDays}; when present, uses Frymoyer model
 */
export function calculatePopulationPK(age, sex, height, weight, scr, neonatal) {
    if (neonatal && typeof neonatal.gaWeeks === 'number' && typeof neonatal.pnaDays === 'number') {
        return calculateNeonatalPK(neonatal.gaWeeks, neonatal.pnaDays, weight, scr);
    }
    if (isPediatric(age)) {
        return calculatePediatricPK(age, sex, height, weight, scr);
    }

    const ibw = calculateIBW(sex, height);
    const adjBw = calculateAdjBW(ibw, weight);
    const weightForCrCl = getWeightForCrCl(weight, ibw, adjBw);
    const crcl = calculateCrCl(age, weightForCrCl, scr, sex);
    const kel = calculateKelPop(crcl);
    const vd = calculateVdPop(weight);
    const cl = kel * vd;

    return { ibw, adjBw, crcl, kel, vd, cl, halfLife: calculateHalfLife(kel), pediatric: false, neonate: false };
}

/**
 * Calculate population PK for pediatric patients
 */
export function calculatePediatricPK(age, sex, height, weight, scr) {
    const crcl = calculateSchwartzCrCl(age, height, scr, sex);
    const kel = calculateKelPop(crcl);
    const vd = calculateVdPopPediatric(weight, age);
    const cl = kel * vd;

    return {
        ibw: weight, // not applicable for pediatrics
        adjBw: weight,
        crcl,
        kel,
        vd,
        cl,
        halfLife: calculateHalfLife(kel),
        pediatric: true,
        neonate: false
    };
}

/**
 * Calculate postmenstrual age (weeks) from gestational age (weeks) and postnatal age (days).
 * PMA = GA + PNA/7
 */
export function calculatePMA(gaWeeks, pnaDays) {
    return gaWeeks + pnaDays / 7;
}

/**
 * Determine if a patient is a neonate from age inputs.
 * Conservative: PNA ≤ 28 days OR PMA ≤ 44 weeks (term + 1 month).
 */
export function isNeonate(gaWeeks, pnaDays) {
    if (typeof gaWeeks !== 'number' || typeof pnaDays !== 'number') return false;
    const pma = calculatePMA(gaWeeks, pnaDays);
    return pnaDays <= 28 || pma <= 44;
}

/**
 * Frymoyer 2014 vancomycin clearance model for neonates.
 * CL (L/h) = 0.345 × (WT/2.9)^0.75 × (PMA/40.5)^1.5 × (0.34/SCr)^0.267
 *
 * Reference: Frymoyer A, Hersh AL, Coralic Z, Benitz WE, Roberts JK.
 * Prediction of vancomycin pharmacokinetics in preterm and term neonates: a Bayesian approach.
 * Pediatr Infect Dis J. 2014;33(11):1141-7.
 */
export function calculateFrymoyerCL(weight, pmaWeeks, scr) {
    return 0.345
        * Math.pow(weight / 2.9, 0.75)
        * Math.pow(pmaWeeks / 40.5, 1.5)
        * Math.pow(0.34 / scr, 0.267);
}

/**
 * Neonatal volume of distribution (Frymoyer model): 0.572 L/kg.
 */
export function calculateVdNeonate(weight) {
    return 0.572 * weight;
}

/**
 * Calculate population PK for neonates (PNA ≤ 28d or PMA ≤ 44w) using Frymoyer model.
 */
export function calculateNeonatalPK(gaWeeks, pnaDays, weight, scr) {
    const pma = calculatePMA(gaWeeks, pnaDays);
    const cl = calculateFrymoyerCL(weight, pma, scr);
    const vd = calculateVdNeonate(weight);
    const kel = cl / vd;

    return {
        ibw: weight,
        adjBw: weight,
        crcl: null,         // Frymoyer doesn't compute CrCl; SCr enters CL directly
        pma,
        gaWeeks,
        pnaDays,
        kel,
        vd,
        cl,
        halfLife: calculateHalfLife(kel),
        pediatric: true,
        neonate: true
    };
}

/**
 * Neonatal empirical initial dose lookup (NeoFax-style PMA × PNA table).
 * Returns mg/kg and interval (h). For starting therapy before any TDM data is available.
 *
 * Reference: Bradley & Nelson's Pediatric Antimicrobial Therapy; NeoFax 2024.
 */
export function recommendNeonatalInitialDose(pmaWeeks, pnaDays) {
    if (pmaWeeks < 29) {
        return pnaDays <= 14
            ? { mgPerKg: 15, intervalH: 24 }
            : { mgPerKg: 15, intervalH: 12 };
    }
    if (pmaWeeks < 37) {
        return pnaDays <= 14
            ? { mgPerKg: 15, intervalH: 12 }
            : { mgPerKg: 15, intervalH: 8 };
    }
    if (pmaWeeks < 45) {
        return { mgPerKg: 15, intervalH: 8 };
    }
    return { mgPerKg: 10, intervalH: 6 };
}

/**
 * Enumerate every individual dose event implied by a sequence of dosing regimens.
 * Each regimen contributes doses at startTime, startTime + interval, ... up to
 * (but not including) the next regimen's startTime, or untilTime for the last.
 *
 * @param {Array<{dose:number, interval:number, startTime:Date}>} regimens
 *     Sorted by startTime, ascending.
 * @param {Date} untilTime - upper bound for dose times (inclusive)
 * @returns {Array<{time:Date, amount:number}>}
 */
export function enumerateDoses(regimens, untilTime) {
    const doses = [];
    const untilMs = untilTime.getTime();
    for (let i = 0; i < regimens.length; i++) {
        const r = regimens[i];
        const intervalMs = r.interval * 3600000;
        const endMs = i + 1 < regimens.length
            ? regimens[i + 1].startTime.getTime()
            : Infinity;
        let t = r.startTime.getTime();
        while (t < endMs && t <= untilMs) {
            doses.push({ time: new Date(t), amount: r.dose });
            t += intervalMs;
        }
    }
    return doses;
}

/**
 * Predict serum concentration at measurementTime via direct superposition over
 * every dose given on or before that time. One-compartment, instantaneous bolus,
 * first-order elimination. Handles arbitrary regimen changes.
 *
 * @param {number} kel - elimination rate constant (1/h)
 * @param {number} vd  - volume of distribution (L)
 * @param {Array}  regimens - dosing regimens (see enumerateDoses)
 * @param {Date}   measurementTime
 * @returns {number} concentration in mg/L
 */
export function predictConcentration(kel, vd, regimens, measurementTime) {
    const doses = enumerateDoses(regimens, measurementTime);
    const tMs = measurementTime.getTime();
    let conc = 0;
    for (const d of doses) {
        const dt = (tMs - d.time.getTime()) / 3600000;
        if (dt < 0) continue;
        conc += (d.amount / vd) * Math.exp(-kel * dt);
    }
    return conc;
}
