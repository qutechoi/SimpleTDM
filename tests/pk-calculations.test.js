// pk-calculations.test.js - Unit tests for PK calculations
// Run: node tests/pk-calculations.test.js

import {
    calculateIBW,
    calculateAdjBW,
    calculateCrCl,
    calculateKelPop,
    calculateVdPop,
    calculatePeakSS,
    calculateTroughSS,
    calculateAUC24,
    calculateHalfLife,
    calculatePopulationPK,
    predictConcentration,
    isPediatric,
    calculateSchwartzCrCl,
    calculateVdPopPediatric,
    calculatePediatricPK,
    calculatePMA,
    isNeonate,
    calculateFrymoyerCL,
    calculateVdNeonate,
    calculateNeonatalPK,
    recommendNeonatalInitialDose
} from '../js/pk-calculations.js';

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, tolerance, testName) {
    if (Math.abs(actual - expected) <= tolerance) {
        passed++;
        console.log(`  PASS: ${testName}`);
    } else {
        failed++;
        console.error(`  FAIL: ${testName} — expected ${expected}, got ${actual}`);
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

function assertRange(actual, min, max, testName) {
    if (actual >= min && actual <= max) {
        passed++;
        console.log(`  PASS: ${testName}`);
    } else {
        failed++;
        console.error(`  FAIL: ${testName} — ${actual} not in [${min}, ${max}]`);
    }
}

// =====================================================
// Test Suite: IBW Calculation (Devine Formula)
// =====================================================
console.log('\n=== IBW Calculation ===');

// Male, 170cm: 50 + 0.9*(170-152) = 50 + 16.2 = 66.2
assertEqual(calculateIBW('male', 170), 66.2, 0.1, 'Male 170cm IBW');

// Female, 160cm: 45.5 + 0.9*(160-152) = 45.5 + 7.2 = 52.7
assertEqual(calculateIBW('female', 160), 52.7, 0.1, 'Female 160cm IBW');

// Male, 180cm: 50 + 0.9*(180-152) = 50 + 25.2 = 75.2
assertEqual(calculateIBW('male', 180), 75.2, 0.1, 'Male 180cm IBW');

// =====================================================
// Test Suite: Adjusted Body Weight
// =====================================================
console.log('\n=== Adjusted Body Weight ===');

// IBW=66.2, ActualBW=90: 66.2 + 0.4*(90-66.2) = 66.2 + 9.52 = 75.72
assertEqual(calculateAdjBW(66.2, 90), 75.72, 0.1, 'AdjBW for obese male');

// IBW=52.7, ActualBW=52.7: should equal IBW
assertEqual(calculateAdjBW(52.7, 52.7), 52.7, 0.1, 'AdjBW equals IBW when normal weight');

// =====================================================
// Test Suite: Creatinine Clearance (Cockcroft-Gault)
// =====================================================
console.log('\n=== Creatinine Clearance ===');

// Male, 65y, 70kg, SCr=1.0: ((140-65)*70)/(72*1.0) = 5250/72 = 72.92
assertEqual(calculateCrCl(65, 70, 1.0, 'male'), 72.92, 0.1, 'CrCl standard male');

// Female, 65y, 70kg, SCr=1.0: 72.92*0.85 = 61.98
assertEqual(calculateCrCl(65, 70, 1.0, 'female'), 61.98, 0.1, 'CrCl standard female');

// Young healthy male, 25y, 70kg, SCr=0.8: ((140-25)*70)/(72*0.8) = 8050/57.6 = 139.76
assertEqual(calculateCrCl(25, 70, 0.8, 'male'), 139.76, 0.1, 'CrCl young male high');

// Elderly female, 85y, 50kg, SCr=1.5: ((140-85)*50)/(72*1.5)*0.85 = 2750/108*0.85 = 21.64
assertEqual(calculateCrCl(85, 50, 1.5, 'female'), 21.64, 0.1, 'CrCl elderly renal impairment');

// =====================================================
// Test Suite: Matzke Kel
// =====================================================
console.log('\n=== Matzke Kel ===');

// CrCl=72.92: 0.00083*72.92 + 0.0044 = 0.06052 + 0.0044 = 0.0649
assertEqual(calculateKelPop(72.92), 0.0649, 0.001, 'Kel for CrCl 72.92');

// CrCl=120: 0.00083*120 + 0.0044 = 0.1040
assertEqual(calculateKelPop(120), 0.1040, 0.001, 'Kel for CrCl 120');

// CrCl=20: 0.00083*20 + 0.0044 = 0.021
assertEqual(calculateKelPop(20), 0.021, 0.001, 'Kel for CrCl 20 (renal impaired)');

// =====================================================
// Test Suite: Volume of Distribution
// =====================================================
console.log('\n=== Volume of Distribution ===');

assertEqual(calculateVdPop(70), 49.0, 0.1, 'Vd for 70kg');
assertEqual(calculateVdPop(100), 70.0, 0.1, 'Vd for 100kg');

// =====================================================
// Test Suite: Steady-State PK
// =====================================================
console.log('\n=== Steady-State PK ===');

// 1000mg, Vd=49L, Kel=0.065, q12h
// PeakSS = (1000/49) * 1/(1-exp(-0.065*12)) = 20.41 * 1/(1-exp(-0.78))
//        = 20.41 * 1/(1-0.4584) = 20.41 * 1.847 = 37.69
const peakSS = calculatePeakSS(1000, 49, 0.065, 12);
assertRange(peakSS, 35, 40, 'PeakSS 1000mg q12h in range');

// TroughSS = PeakSS * exp(-0.065*12) = PeakSS * 0.4584
const troughSS = calculateTroughSS(peakSS, 0.065, 12);
assertRange(troughSS, 15, 20, 'TroughSS 1000mg q12h in range');

// AUC24 = TDD/CL = 2000/(0.065*49) = 2000/3.185 = 627.9
const auc24 = calculateAUC24(1000, 12, 0.065 * 49);
assertRange(auc24, 620, 640, 'AUC24 1000mg q12h in range');

// Half-life = 0.693/0.065 = 10.66h
assertEqual(calculateHalfLife(0.065), 10.66, 0.1, 'Half-life for Kel 0.065');

// =====================================================
// Test Suite: Population PK (integrated)
// =====================================================
console.log('\n=== Integrated Population PK ===');

const pk = calculatePopulationPK(65, 'male', 170, 70, 1.0);
assertRange(pk.crcl, 70, 80, 'Population CrCl range for standard male');
assertRange(pk.kel, 0.06, 0.07, 'Population Kel range');
assertEqual(pk.vd, 49.0, 0.1, 'Population Vd for 70kg');
assertRange(pk.halfLife, 9, 12, 'Population half-life range');

// =====================================================
// Test Suite: Predict Concentration
// =====================================================
console.log('\n=== Predict Concentration ===');

// First dose, 6h after: C = (1000/49)*exp(-0.065*6) = 20.41*0.677 = 13.82
const startTime = new Date('2024-01-01T08:00');
const regimens1 = [{ dose: 1000, interval: 12, startTime }];
const time6h = new Date('2024-01-01T14:00');
const conc6h = predictConcentration(0.065, 49, regimens1, time6h);
assertRange(conc6h, 12, 16, 'First dose 6h concentration range');

// Near trough (11.5h): C = (1000/49)*exp(-0.065*11.5) = 20.41*0.474 = 9.67
const time11h5 = new Date('2024-01-01T19:30');
const conc11h5 = predictConcentration(0.065, 49, regimens1, time11h5);
assertRange(conc11h5, 8, 12, 'First dose near-trough (11.5h) concentration range');

// =====================================================
// Test Suite: Multi-Regimen Prediction
// =====================================================
console.log('\n=== Multi-Regimen Prediction ===');

// Scenario: 1000mg q12h × 24h, then escalate to 1500mg q12h
// Regimen 1 doses occur at t=0 and t=12 (regimen 2 starts at t=24, so q12h
// boundary at t=24 is the new regimen, not regimen 1).
const startTimeA = new Date('2024-01-01T08:00');
const startTimeB = new Date('2024-01-02T08:00'); // +24h
const multiRegimens = [
    { dose: 1000, interval: 12, startTime: startTimeA },
    { dose: 1500, interval: 12, startTime: startTimeB }
];

// At t=18h, only regimen 1's two doses have been given:
//   C = (1000/49) * [exp(-0.065*18) + exp(-0.065*6)] ≈ 20.15
const t18h = new Date(startTimeA.getTime() + 18 * 3600000);
const conc18h = predictConcentration(0.065, 49, multiRegimens, t18h);
assertRange(conc18h, 18, 22, 'Multi-regimen: t=18h still under regimen 1');

// At t=30h, three doses contribute (1000@0, 1000@12, 1500@24):
//   C = (1/49) * [1000·exp(-1.95) + 1000·exp(-1.17) + 1500·exp(-0.39)] ≈ 29.9
const t30h = new Date(startTimeA.getTime() + 30 * 3600000);
const conc30h = predictConcentration(0.065, 49, multiRegimens, t30h);
assertRange(conc30h, 27, 33, 'Multi-regimen: t=30h reflects new 1500mg dose');

// At exactly t=24h the new 1500mg dose lands instantaneously and is included:
//   C = (1500/49) + (1000/49)*[exp(-0.065*24) + exp(-0.065*12)] ≈ 44.3
const conc24h = predictConcentration(0.065, 49, multiRegimens, startTimeB);
assertRange(conc24h, 42, 46, 'Multi-regimen: switch boundary includes new dose');

// =====================================================
// Test Suite: Clinical Scenarios
// =====================================================
console.log('\n=== Clinical Scenarios ===');

// Scenario 1: Typical patient, normal renal function
const pkNormal = calculatePopulationPK(50, 'male', 175, 75, 0.9);
const aucNormal = calculateAUC24(1000, 12, pkNormal.kel * pkNormal.vd);
assertRange(aucNormal, 350, 650, 'Normal patient AUC range with 1000mg q12h');

// Scenario 2: Elderly with renal impairment
const pkElderly = calculatePopulationPK(80, 'female', 155, 55, 2.0);
const aucElderly = calculateAUC24(1000, 12, pkElderly.kel * pkElderly.vd);
// Expected: higher AUC due to reduced clearance
if (aucElderly > aucNormal) {
    passed++;
    console.log('  PASS: Elderly renal impaired AUC > normal (as expected)');
} else {
    failed++;
    console.error(`  FAIL: Elderly AUC (${aucElderly.toFixed(0)}) should be > normal (${aucNormal.toFixed(0)})`);
}

// Scenario 3: Verify dose-proportionality
const auc500 = calculateAUC24(500, 12, pkNormal.kel * pkNormal.vd);
const auc1000 = calculateAUC24(1000, 12, pkNormal.kel * pkNormal.vd);
assertEqual(auc1000 / auc500, 2.0, 0.01, 'AUC is dose-proportional');

// =====================================================
// Test Suite: Pediatric Detection
// =====================================================
console.log('\n=== Pediatric Detection ===');

assertTrue(isPediatric(0.5), 'Infant (6mo) is pediatric');
assertTrue(isPediatric(5), 'Child (5y) is pediatric');
assertTrue(isPediatric(17), 'Adolescent (17y) is pediatric');
assertTrue(!isPediatric(18), 'Adult (18y) is not pediatric');
assertTrue(!isPediatric(65), 'Adult (65y) is not pediatric');

// =====================================================
// Test Suite: Schwartz CrCl
// =====================================================
console.log('\n=== Schwartz CrCl (Pediatric) ===');

// Infant 6mo, 65cm, SCr=0.3: k=0.45, CrCl = 0.45*65/0.3 = 97.5
assertEqual(calculateSchwartzCrCl(0.5, 65, 0.3, 'male'), 97.5, 0.1, 'Infant 6mo Schwartz CrCl');

// Child 5y, 110cm, SCr=0.5: k=0.55, CrCl = 0.55*110/0.5 = 121.0
assertEqual(calculateSchwartzCrCl(5, 110, 0.5, 'male'), 121.0, 0.1, 'Child 5y Schwartz CrCl');

// Adolescent male 15y, 170cm, SCr=0.8: k=0.70, CrCl = 0.70*170/0.8 = 148.75
assertEqual(calculateSchwartzCrCl(15, 170, 0.8, 'male'), 148.75, 0.1, 'Adolescent male Schwartz CrCl');

// Adolescent female 15y, 160cm, SCr=0.7: k=0.55, CrCl = 0.55*160/0.7 = 125.71
assertEqual(calculateSchwartzCrCl(15, 160, 0.7, 'female'), 125.71, 0.1, 'Adolescent female Schwartz CrCl');

// =====================================================
// Test Suite: Pediatric Vd
// =====================================================
console.log('\n=== Pediatric Vd ===');

// Neonate 0.02y (1 week), 3.5kg: Vd = 0.6 * 3.5 = 2.1
assertEqual(calculateVdPopPediatric(3.5, 0.02), 2.1, 0.1, 'Neonate Vd (0.6 L/kg)');

// Infant 6mo, 7kg: Vd = 0.7 * 7 = 4.9
assertEqual(calculateVdPopPediatric(7, 0.5), 4.9, 0.1, 'Infant 6mo Vd (0.7 L/kg)');

// Child 5y, 20kg: Vd = 0.7 * 20 = 14.0
assertEqual(calculateVdPopPediatric(20, 5), 14.0, 0.1, 'Child 5y Vd (0.7 L/kg)');

// =====================================================
// Test Suite: Integrated Pediatric PK
// =====================================================
console.log('\n=== Integrated Pediatric PK ===');

// Infant 6mo, male, 65cm, 7kg, SCr=0.3
const pkInfant = calculatePopulationPK(0.5, 'male', 65, 7, 0.3);
assertTrue(pkInfant.pediatric === true, 'Infant flagged as pediatric');
assertRange(pkInfant.crcl, 90, 110, 'Infant CrCl via Schwartz');
assertRange(pkInfant.vd, 4, 6, 'Infant Vd in range');
assertRange(pkInfant.kel, 0.05, 0.15, 'Infant Kel in range');

// Child 8y, female, 130cm, 25kg, SCr=0.5
const pkChild = calculatePopulationPK(8, 'female', 130, 25, 0.5);
assertTrue(pkChild.pediatric === true, 'Child flagged as pediatric');
assertRange(pkChild.crcl, 130, 160, 'Child CrCl via Schwartz');
assertRange(pkChild.vd, 15, 20, 'Child Vd in range');

// Adult (should still use adult pathway)
const pkAdult = calculatePopulationPK(50, 'male', 175, 75, 0.9);
assertTrue(pkAdult.pediatric === false, 'Adult flagged as non-pediatric');

// Pediatric AUC scenario: infant on 10mg/kg q8h = 70mg q8h
const aucInfant = calculateAUC24(70, 8, pkInfant.cl);
assertRange(aucInfant, 200, 800, 'Infant AUC in reasonable range for 10mg/kg q8h');

// =====================================================
// Test Suite: Neonatal — PMA & isNeonate
// =====================================================
console.log('\n=== Neonatal: PMA & Detection ===');

// PMA = GA + PNA/7. GA=32w, PNA=14d → 32 + 2 = 34
assertEqual(calculatePMA(32, 14), 34, 0.001, 'PMA for GA 32w + PNA 14d');
// GA=40, PNA=0 → 40
assertEqual(calculatePMA(40, 0), 40, 0.001, 'PMA for term newborn day 0');
// GA=28, PNA=21 → 31
assertEqual(calculatePMA(28, 21), 31, 0.001, 'PMA for preterm at 3 weeks of life');

assertTrue(isNeonate(40, 0), 'Term newborn detected as neonate');
assertTrue(isNeonate(32, 14), 'Late preterm at 2w PNA detected as neonate');
assertTrue(isNeonate(28, 28), 'Preterm at 28d PNA still neonate');
assertTrue(!isNeonate(undefined, undefined), 'Missing GA/PNA → not neonate');

// =====================================================
// Test Suite: Frymoyer CL & Neonatal Vd
// =====================================================
console.log('\n=== Frymoyer Clearance ===');

// Reference calc — term neonate, 3 kg, PMA 40w, SCr 0.5
//   CL = 0.345 * (3/2.9)^0.75 * (40/40.5)^1.5 * (0.34/0.5)^0.267
//      = 0.345 * 1.0258 * 0.9815 * 0.9006
//      ≈ 0.3127 L/h
const clTerm = calculateFrymoyerCL(3.0, 40, 0.5);
assertRange(clTerm, 0.28, 0.34, 'Frymoyer CL: term 3 kg, PMA 40, SCr 0.5');

// Preterm, 1.5 kg, PMA 32w, SCr 0.6
//   CL ≈ 0.345 * (1.5/2.9)^0.75 * (32/40.5)^1.5 * (0.34/0.6)^0.267
//      ≈ 0.345 * 0.610 * 0.702 * 0.864 ≈ 0.128 L/h
const clPreterm = calculateFrymoyerCL(1.5, 32, 0.6);
assertRange(clPreterm, 0.10, 0.16, 'Frymoyer CL: preterm 1.5 kg, PMA 32, SCr 0.6');

// Higher SCr → lower CL (sanity)
const clHighScr = calculateFrymoyerCL(3.0, 40, 1.0);
assertTrue(clHighScr < clTerm, 'Higher SCr lowers Frymoyer CL');

// Higher PMA → higher CL (maturation)
const clMature = calculateFrymoyerCL(3.0, 44, 0.5);
assertTrue(clMature > clTerm, 'Higher PMA raises Frymoyer CL');

console.log('\n=== Neonatal Vd ===');
assertEqual(calculateVdNeonate(3.0), 1.716, 0.001, 'Neonatal Vd: 3 kg × 0.572');
assertEqual(calculateVdNeonate(1.0), 0.572, 0.001, 'Neonatal Vd: 1 kg × 0.572');

// =====================================================
// Test Suite: Integrated Neonatal PK
// =====================================================
console.log('\n=== Integrated Neonatal PK ===');

const pkNeo = calculateNeonatalPK(40, 7, 3.0, 0.5);
assertTrue(pkNeo.neonate === true, 'Neonatal PK flagged as neonate');
assertTrue(pkNeo.pediatric === true, 'Neonatal PK also flagged as pediatric');
assertEqual(pkNeo.pma, 41, 0.001, 'PMA computed from GA 40, PNA 7');
assertRange(pkNeo.cl, 0.30, 0.40, 'Neonatal CL in expected range');
assertRange(pkNeo.vd, 1.7, 1.75, 'Neonatal Vd in expected range');
assertRange(pkNeo.kel, 0.15, 0.25, 'Neonatal kel in expected range');
assertRange(pkNeo.halfLife, 2.5, 5, 'Neonatal half-life in expected range');

// Through routing via calculatePopulationPK
const pkRouted = calculatePopulationPK(0, 'male', 50, 3.0, 0.5, { gaWeeks: 40, pnaDays: 7 });
assertTrue(pkRouted.neonate === true, 'calculatePopulationPK routes to neonatal when GA/PNA passed');
assertEqual(pkRouted.cl, pkNeo.cl, 0.001, 'Routed CL matches direct neonatal CL');

// Without neonatal ctx, age 0.02y falls back to pediatric Schwartz path
const pkPedFallback = calculatePopulationPK(0.02, 'male', 50, 3.0, 0.5);
assertTrue(pkPedFallback.neonate === false, 'No GA/PNA → not neonate (pediatric fallback)');

// =====================================================
// Test Suite: Empirical Dose Recommendation Table
// =====================================================
console.log('\n=== Neonatal Empirical Dose Lookup ===');

// <29w PMA, ≤14d PNA → 15 mg/kg q24h
let rec = recommendNeonatalInitialDose(27, 5);
assertTrue(rec.mgPerKg === 15 && rec.intervalH === 24, 'Extreme preterm early life → 15 mg/kg q24h');

// <29w PMA, >14d PNA → 15 mg/kg q12h
rec = recommendNeonatalInitialDose(27, 20);
assertTrue(rec.mgPerKg === 15 && rec.intervalH === 12, 'Extreme preterm older → 15 mg/kg q12h');

// 30w PMA, ≤14d → 15 mg/kg q12h
rec = recommendNeonatalInitialDose(30, 10);
assertTrue(rec.mgPerKg === 15 && rec.intervalH === 12, 'Preterm 30w early → 15 mg/kg q12h');

// 32w PMA, >14d → 15 mg/kg q8h
rec = recommendNeonatalInitialDose(32, 20);
assertTrue(rec.mgPerKg === 15 && rec.intervalH === 8, 'Preterm 32w older → 15 mg/kg q8h');

// 40w PMA → 15 mg/kg q8h
rec = recommendNeonatalInitialDose(40, 0);
assertTrue(rec.mgPerKg === 15 && rec.intervalH === 8, 'Term newborn → 15 mg/kg q8h');

// 46w PMA → 10 mg/kg q6h
rec = recommendNeonatalInitialDose(46, 14);
assertTrue(rec.mgPerKg === 10 && rec.intervalH === 6, 'Beyond term (>45w) → 10 mg/kg q6h');

// =====================================================
// Summary
// =====================================================
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
