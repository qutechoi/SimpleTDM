// bayesian-fitting.test.js - Unit tests for Bayesian fitting
// Run: node tests/bayesian-fitting.test.js

import { multiPointBayesianFit, singlePointBayesianFit } from '../js/bayesian-fitting.js';
import { predictConcentration } from '../js/pk-calculations.js';

let passed = 0;
let failed = 0;

function assertRange(actual, min, max, testName) {
    if (actual >= min && actual <= max) {
        passed++;
        console.log(`  PASS: ${testName}`);
    } else {
        failed++;
        console.error(`  FAIL: ${testName} — ${actual} not in [${min}, ${max}]`);
    }
}

function assertTrue(condition, testName) {
    if (condition) {
        passed++;
        console.log(`  PASS: ${testName}`);
    } else {
        failed++;
        console.error(`  FAIL: ${testName}`);
    }
}

// =====================================================
// Test Setup: Known PK parameters
// =====================================================
const kelTrue = 0.065;
const vdTrue = 49.0;
const dose = 1000;
const interval = 12;
const startTime = new Date('2024-01-01T08:00');
const regimens = [{ dose, interval, startTime }];

// Population priors (slightly off from true values)
const populationPK = { kel: 0.070, vd: 52.0 };

// Generate "measured" concentrations at known times using true parameters
function generateMeasurement(hoursAfterStart) {
    const time = new Date(startTime.getTime() + hoursAfterStart * 3600000);
    const conc = predictConcentration(kelTrue, vdTrue, regimens, time);
    return { time, concentration: conc };
}

// =====================================================
// Test Suite: Single-Point Bayesian Fit
// =====================================================
console.log('\n=== Single-Point Bayesian Fit ===');

const singleMeasurement = generateMeasurement(10); // 10h after first dose (trough-ish)
const singleResult = singlePointBayesianFit(
    { regimens },
    singleMeasurement,
    populationPK
);

assertTrue(singleResult.kel === populationPK.kel, 'Single-point keeps population Kel');
assertRange(singleResult.vd, 40, 60, 'Single-point Vd in reasonable range');
assertTrue(singleResult.fitQuality.measurementCount === 1, 'Single-point measurement count = 1');
assertTrue(singleResult.fitQuality.rSquared === null, 'Single-point R² is null');

// =====================================================
// Test Suite: Multi-Point Bayesian Fit (2 points)
// =====================================================
console.log('\n=== Multi-Point Bayesian Fit (2 points) ===');

const measurements2 = [
    generateMeasurement(6),   // 6h after first dose
    generateMeasurement(11)   // 11h (near trough)
];

const result2 = multiPointBayesianFit(
    { regimens },
    measurements2,
    populationPK
);

assertRange(result2.kel, 0.05, 0.09, '2-point Kel within 30% of true');
assertRange(result2.vd, 35, 65, '2-point Vd within 30% of true');
assertTrue(result2.fitQuality.measurementCount === 2, '2-point measurement count = 2');
assertRange(result2.fitQuality.rSquared, 0.5, 1.0, '2-point R² is reasonable');

// =====================================================
// Test Suite: Multi-Point Bayesian Fit (3 points)
// =====================================================
console.log('\n=== Multi-Point Bayesian Fit (3 points) ===');

const measurements3 = [
    generateMeasurement(2),    // 2h (distribution phase)
    generateMeasurement(6),    // 6h (mid-interval)
    generateMeasurement(11)    // 11h (trough)
];

const result3 = multiPointBayesianFit(
    { regimens },
    measurements3,
    populationPK
);

assertRange(result3.kel, 0.05, 0.08, '3-point Kel closer to true value');
assertRange(result3.vd, 40, 58, '3-point Vd closer to true value');
assertRange(result3.fitQuality.rSquared, 0.8, 1.0, '3-point R² > 0.8');
assertRange(result3.fitQuality.rmse, 0, 3, '3-point RMSE < 3 mg/L');

// =====================================================
// Test Suite: Multi-Point with accumulated doses
// =====================================================
console.log('\n=== Multi-Point with Dose Accumulation ===');

const measurementsAccum = [
    generateMeasurement(23),   // Near trough of 2nd dose
    generateMeasurement(30),   // 6h into 3rd dose
    generateMeasurement(35)    // 11h into 3rd dose
];

const resultAccum = multiPointBayesianFit(
    { regimens },
    measurementsAccum,
    populationPK
);

assertRange(resultAccum.kel, 0.04, 0.09, 'Accumulated Kel in range');
assertRange(resultAccum.vd, 35, 65, 'Accumulated Vd in range');
assertTrue(resultAccum.fitQuality.measurementCount === 3, 'Accumulated measurement count = 3');

// =====================================================
// Test Suite: Fit quality improves with more data
// =====================================================
console.log('\n=== Fit Quality Improvement ===');

const kelError2 = Math.abs(result2.kel - kelTrue) / kelTrue;
const kelError3 = Math.abs(result3.kel - kelTrue) / kelTrue;

// 3 points should generally give better or equal estimate
// (not always guaranteed with Bayesian priors, but should trend better)
assertTrue(
    result3.fitQuality.rSquared >= result2.fitQuality.rSquared - 0.1,
    '3-point R² >= 2-point R² (±0.1 tolerance)'
);

// =====================================================
// Test Suite: Edge cases
// =====================================================
console.log('\n=== Edge Cases ===');

// Very high concentration measurement (should pull Vd down)
const highConcMeasurement = { time: new Date(startTime.getTime() + 6 * 3600000), concentration: 40 };
const resultHigh = singlePointBayesianFit(
    { regimens },
    highConcMeasurement,
    populationPK
);
assertTrue(resultHigh.vd < populationPK.vd, 'High concentration pulls Vd down');

// Very low concentration measurement (should push Vd up)
const lowConcMeasurement = { time: new Date(startTime.getTime() + 6 * 3600000), concentration: 5 };
const resultLow = singlePointBayesianFit(
    { regimens },
    lowConcMeasurement,
    populationPK
);
assertTrue(resultLow.vd > populationPK.vd, 'Low concentration pushes Vd up');

// =====================================================
// Test Suite: Derived PK parameters consistency
// =====================================================
console.log('\n=== PK Parameter Consistency ===');

assertTrue(
    Math.abs(result3.cl - result3.kel * result3.vd) < 0.01,
    'CL = Kel × Vd'
);

assertTrue(
    Math.abs(result3.halfLife - 0.693 / result3.kel) < 0.01,
    'T½ = 0.693 / Kel'
);

// =====================================================
// Test Suite: Multi-Regimen Bayesian Fit
// =====================================================
console.log('\n=== Multi-Regimen Bayesian Fit ===');

// Patient on 1000mg q12h × 24h, then escalated to 1500mg q12h.
// Synthesize "true" measurements with the multi-regimen predictor, then verify
// the fitter recovers Kel/Vd close to truth.
const multiRegimens = [
    { dose: 1000, interval: 12, startTime },
    { dose: 1500, interval: 12, startTime: new Date(startTime.getTime() + 24 * 3600000) }
];

function generateMultiMeasurement(hoursAfterStart) {
    const time = new Date(startTime.getTime() + hoursAfterStart * 3600000);
    const conc = predictConcentration(kelTrue, vdTrue, multiRegimens, time);
    return { time, concentration: conc };
}

const multiMeasurements = [
    generateMultiMeasurement(11),  // trough of regimen 1 (after 1000@0)
    generateMultiMeasurement(23),  // trough at end of regimen 1
    generateMultiMeasurement(35)   // trough of first 1500mg dose
];

const multiResult = multiPointBayesianFit(
    { regimens: multiRegimens },
    multiMeasurements,
    populationPK
);

assertRange(multiResult.kel, 0.05, 0.08, 'Multi-regimen Kel near true value');
assertRange(multiResult.vd, 40, 58, 'Multi-regimen Vd near true value');
assertRange(multiResult.fitQuality.rSquared, 0.8, 1.0, 'Multi-regimen R² > 0.8');
assertRange(multiResult.fitQuality.rmse, 0, 3, 'Multi-regimen RMSE < 3 mg/L');

// =====================================================
// Summary
// =====================================================
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
