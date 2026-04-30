// bayesian-fitting.js - Bayesian Parameter Fitting Module

import { predictConcentration } from './pk-calculations.js';

/**
 * Multi-point Bayesian fitting using weighted least squares with Nelder-Mead optimization.
 * Fits both Kel and Vd from multiple concentration measurements across one or more
 * dosing regimens.
 *
 * @param {Object} patientData - { regimens: Array<{dose, interval, startTime}> }
 * @param {Array} measurements - Array of { time: Date, concentration: number }
 * @param {Object} populationPK - { kel, vd }
 * @returns {Object} Individualized PK parameters and fit quality metrics
 */
export function multiPointBayesianFit(patientData, measurements, populationPK) {
    const { regimens } = patientData;
    const { kel: kelPop, vd: vdPop } = populationPK;

    if (measurements.length === 1) {
        return singlePointBayesianFit(patientData, measurements[0], populationPK);
    }

    function predict(kel, vd, measurementTime) {
        return predictConcentration(kel, vd, regimens, measurementTime);
    }

    function objectiveFunction(params) {
        const kel = params[0];
        const vd = params[1];

        if (kel <= 0 || vd <= 0 || kel > 0.5 || vd > vdPop * 5 || vd < vdPop * 0.2) {
            return 1e10;
        }

        let ssr = 0;
        measurements.forEach(m => {
            const predicted = predict(kel, vd, m.time);
            const residual = m.concentration - predicted;
            const weight = 1 / (0.1 * m.concentration) ** 2;
            ssr += weight * residual * residual;
        });

        const kelVariance = (kelPop * 0.3) ** 2;
        const vdVariance = (vdPop * 0.25) ** 2;
        const kelPriorPenalty = ((kel - kelPop) ** 2) / kelVariance;
        const vdPriorPenalty = ((vd - vdPop) ** 2) / vdVariance;

        return ssr + 0.5 * (kelPriorPenalty + vdPriorPenalty);
    }

    const optimizedParams = nelderMeadOptimize(objectiveFunction, [kelPop, vdPop]);
    const kelIndividual = optimizedParams[0];
    const vdIndividual = optimizedParams[1];

    const predictions = measurements.map(m => predict(kelIndividual, vdIndividual, m.time));
    const residuals = measurements.map((m, i) => m.concentration - predictions[i]);
    const meanObserved = measurements.reduce((sum, m) => sum + m.concentration, 0) / measurements.length;

    const ssRes = residuals.reduce((sum, r) => sum + r * r, 0);
    const ssTot = measurements.reduce((sum, m) => sum + (m.concentration - meanObserved) ** 2, 0);
    const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
    const rmse = Math.sqrt(ssRes / measurements.length);

    return {
        kel: kelIndividual,
        vd: vdIndividual,
        cl: kelIndividual * vdIndividual,
        halfLife: 0.693 / kelIndividual,
        fitQuality: { rSquared, rmse, measurementCount: measurements.length, predictions, residuals }
    };
}

/**
 * Single-point Bayesian adjustment (Vd-only).
 * Predicts concentration with population PK across the full regimen sequence,
 * then scales Vd by the predicted/observed ratio.
 */
export function singlePointBayesianFit(patientData, measurement, populationPK) {
    const { regimens } = patientData;
    const { kel: kelPop, vd: vdPop } = populationPK;

    const cPredicted = predictConcentration(kelPop, vdPop, regimens, measurement.time);
    const vdIndividual = vdPop * (cPredicted / measurement.concentration);

    return {
        kel: kelPop,
        vd: vdIndividual,
        cl: kelPop * vdIndividual,
        halfLife: 0.693 / kelPop,
        fitQuality: {
            rSquared: null,
            rmse: Math.abs(measurement.concentration - cPredicted),
            measurementCount: 1,
            predictions: [cPredicted],
            residuals: [measurement.concentration - cPredicted]
        }
    };
}

/**
 * Nelder-Mead Simplex Optimization
 */
function nelderMeadOptimize(objectiveFunction, initialParams, maxIterations = 500, tolerance = 1e-8) {
    const n = initialParams.length;
    const simplex = [initialParams.slice()];

    for (let i = 0; i < n; i++) {
        const point = initialParams.slice();
        point[i] *= 1.1;
        simplex.push(point);
    }

    const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;

    for (let iter = 0; iter < maxIterations; iter++) {
        simplex.sort((a, b) => objectiveFunction(a) - objectiveFunction(b));

        const fBest = objectiveFunction(simplex[0]);
        const fWorst = objectiveFunction(simplex[n]);
        if (Math.abs(fWorst - fBest) < tolerance) break;

        const centroid = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                centroid[j] += simplex[i][j];
            }
        }
        centroid.forEach((_, i) => centroid[i] /= n);

        const reflected = centroid.map((c, i) => c + alpha * (c - simplex[n][i]));
        const fReflected = objectiveFunction(reflected);

        if (fReflected < objectiveFunction(simplex[0])) {
            const expanded = centroid.map((c, i) => c + gamma * (reflected[i] - c));
            simplex[n] = objectiveFunction(expanded) < fReflected ? expanded : reflected;
        } else if (fReflected < objectiveFunction(simplex[n - 1])) {
            simplex[n] = reflected;
        } else {
            const contracted = centroid.map((c, i) => c + rho * (simplex[n][i] - c));
            if (objectiveFunction(contracted) < objectiveFunction(simplex[n])) {
                simplex[n] = contracted;
            } else {
                for (let i = 1; i <= n; i++) {
                    simplex[i] = simplex[0].map((best, j) => best + sigma * (simplex[i][j] - best));
                }
            }
        }
    }

    simplex.sort((a, b) => objectiveFunction(a) - objectiveFunction(b));
    return simplex[0];
}
