// chart.js - Chart Rendering Module

import { getLang, t as getT } from './i18n.js';
import { enumerateDoses } from './pk-calculations.js';

let pkChart = null;

export function getChart() { return pkChart; }

/**
 * Renders the concentration-time chart for an arbitrary sequence of dosing
 * regimens via direct superposition of all individual dose contributions.
 *
 * @param {number} peakSS - asymptotic SS peak for the LAST regimen (used for label only)
 * @param {number} kel    - individualized elimination rate (1/h)
 * @param {number} vd     - individualized volume of distribution (L)
 * @param {Array}  regimens - sorted regimens, each {dose, interval, startTime: Date}
 * @param {Array}  measurements - {time: Date, concentration: number}
 * @param {string} currentTheme
 * @param {Object} individualizedPK - includes fitQuality.predictions for overlay
 */
export function updateChartExtended(peakSS, kel, vd, regimens, measurements, currentTheme, individualizedPK) {
    const t = getT();
    const ctx = document.getElementById('pkChart');

    const firstStart = regimens[0].startTime;
    const lastRegimen = regimens[regimens.length - 1];
    const lastMeasurementTime = measurements[measurements.length - 1].time;
    const hoursToLastMeasurement = (lastMeasurementTime - firstStart) / (1000 * 60 * 60);

    // Round chart end up to a clean multiple of the last regimen's interval, plus
    // ~2 intervals of forward extrapolation so the user can see where SS settles.
    const numIntervalsAhead = 2;
    const totalDuration = Math.max(
        3 * lastRegimen.interval,
        Math.ceil(hoursToLastMeasurement / lastRegimen.interval + numIntervalsAhead) * lastRegimen.interval
    );

    const chartEndTime = new Date(firstStart.getTime() + totalDuration * 3600000);
    const allDoses = enumerateDoses(regimens, chartEndTime);

    const timePoints = [];
    const concentrations = [];
    const steps = Math.round(totalDuration * 4);

    for (let i = 0; i <= steps; i++) {
        const tHours = (totalDuration * i) / steps;
        timePoints.push(tHours.toFixed(1));
        const tMs = firstStart.getTime() + tHours * 3600000;
        let conc = 0;
        for (const d of allDoses) {
            const dt = (tMs - d.time.getTime()) / 3600000;
            if (dt < 0) break;
            conc += (d.amount / vd) * Math.exp(-kel * dt);
        }
        concentrations.push(conc);
    }

    if (pkChart) pkChart.destroy();

    const isDark = currentTheme === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#0f172a';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const troughSS = peakSS * Math.exp(-kel * lastRegimen.interval);
    const lang = getLang();

    const datasets = [{
        label: t.chartConcentration,
        data: concentrations,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2
    }, {
        label: t.chartTrough + ' (SS)',
        data: new Array(timePoints.length).fill(troughSS),
        borderColor: '#f59e0b',
        borderDash: [5, 5],
        pointRadius: 0,
        borderWidth: 1.5
    }, {
        label: t.chartTargetRange || 'Target (10-20)',
        data: new Array(timePoints.length).fill(20),
        borderColor: 'rgba(16, 185, 129, 0.4)',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        fill: '+1',
        pointRadius: 0,
        borderWidth: 1
    }, {
        label: '',
        data: new Array(timePoints.length).fill(10),
        borderColor: 'rgba(16, 185, 129, 0.4)',
        fill: false,
        pointRadius: 0,
        borderWidth: 1
    }];

    // Measured points
    const measuredData = timePoints.map(() => null);
    measurements.forEach(m => {
        const measurementTime = (m.time - firstStart) / (1000 * 60 * 60);
        let closestIdx = 0, closestDist = Infinity;
        timePoints.forEach((tp, idx) => {
            const dist = Math.abs(parseFloat(tp) - measurementTime);
            if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
        });
        if (closestDist < 0.3) measuredData[closestIdx] = m.concentration;
    });

    datasets.push({
        label: t.measured || 'Measured',
        data: measuredData,
        borderColor: '#ef4444',
        backgroundColor: '#ef4444',
        pointRadius: 8,
        pointStyle: 'circle',
        showLine: false,
        borderWidth: 2
    });

    // Regimen change markers — diamond points placed on the curve at each change time
    if (regimens.length > 1) {
        const changeData = timePoints.map(() => null);
        for (let i = 1; i < regimens.length; i++) {
            const changeHours = (regimens[i].startTime - firstStart) / (1000 * 60 * 60);
            let closestIdx = 0, closestDist = Infinity;
            timePoints.forEach((tp, idx) => {
                const dist = Math.abs(parseFloat(tp) - changeHours);
                if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
            });
            if (closestDist < 0.5) changeData[closestIdx] = concentrations[closestIdx];
        }
        datasets.push({
            label: lang === 'en' ? 'Regimen change' : '요법 변경',
            data: changeData,
            borderColor: '#a855f7',
            backgroundColor: '#a855f7',
            pointRadius: 8,
            pointStyle: 'rectRot',
            showLine: false,
            borderWidth: 2
        });
    }

    // Predicted points (multi-point)
    if (individualizedPK && individualizedPK.fitQuality.predictions && measurements.length > 1) {
        const predictedData = timePoints.map(() => null);
        measurements.forEach((m, idx) => {
            const measurementTime = (m.time - firstStart) / (1000 * 60 * 60);
            let closestIdx = 0, closestDist = Infinity;
            timePoints.forEach((tp, i) => {
                const dist = Math.abs(parseFloat(tp) - measurementTime);
                if (dist < closestDist) { closestDist = dist; closestIdx = i; }
            });
            if (closestDist < 0.3) predictedData[closestIdx] = individualizedPK.fitQuality.predictions[idx];
        });

        datasets.push({
            label: t.predicted || 'Predicted',
            data: predictedData,
            borderColor: '#8b5cf6',
            backgroundColor: '#8b5cf6',
            pointRadius: 6,
            pointStyle: 'triangle',
            showLine: false,
            borderWidth: 2
        });
    }

    pkChart = new Chart(ctx, {
        type: 'line',
        data: { labels: timePoints, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        padding: 15,
                        font: { size: 11 },
                        filter: (item) => item.text !== ''
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: (items) => {
                            const time = parseFloat(items[0].label);
                            const tMs = firstStart.getTime() + time * 3600000;
                            // Find the most recent dose at or before this time across all regimens
                            let lastDoseIdx = -1;
                            for (let i = 0; i < allDoses.length; i++) {
                                if (allDoses[i].time.getTime() <= tMs) lastDoseIdx = i;
                                else break;
                            }
                            if (lastDoseIdx < 0) {
                                return `${lang === 'en' ? 'Time' : '시간'}: ${time}h`;
                            }
                            const doseNum = lastDoseIdx + 1;
                            const timeAfterDose = ((tMs - allDoses[lastDoseIdx].time.getTime()) / 3600000).toFixed(1);
                            return `${lang === 'en' ? 'Time' : '시간'}: ${time}h (${lang === 'en' ? 'Dose' : '투약'} #${doseNum}, +${timeAfterDose}h)`;
                        },
                        label: (context) => {
                            let label = context.dataset.label || '';
                            if (label && context.parsed.y !== null) {
                                label += ': ' + context.parsed.y.toFixed(2) + ' mg/L';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: t.chartTime + ` (${lang === 'en' ? 'since first dose' : '첫 투약 이후'})`,
                        color: textColor,
                        font: { size: 12, weight: '500' }
                    },
                    ticks: { color: textColor, maxTicksLimit: 10 },
                    grid: { color: gridColor }
                },
                y: {
                    title: {
                        display: true,
                        text: t.chartConcentration,
                        color: textColor,
                        font: { size: 12, weight: '500' }
                    },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    beginAtZero: true
                }
            }
        }
    });
}

/**
 * Update chart theme colors without full redraw
 */
export function updateChartTheme(currentTheme) {
    if (!pkChart) return;

    const isDark = currentTheme === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#0f172a';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    pkChart.options.plugins.legend.labels.color = textColor;
    pkChart.options.scales.x.title.color = textColor;
    pkChart.options.scales.x.ticks.color = textColor;
    pkChart.options.scales.x.grid.color = gridColor;
    pkChart.options.scales.y.title.color = textColor;
    pkChart.options.scales.y.ticks.color = textColor;
    pkChart.options.scales.y.grid.color = gridColor;
    pkChart.update();
}

/**
 * Update chart labels for language change
 */
export function updateChartLanguage() {
    if (!pkChart) return;

    const t = getT();
    const lang = getLang();

    pkChart.data.datasets[0].label = t.chartConcentration;
    if (pkChart.data.datasets[1]) {
        pkChart.data.datasets[1].label = t.chartTrough + ' (SS)';
    }
    pkChart.options.scales.x.title.text = t.chartTime + ` (${lang === 'en' ? 'since first dose' : '첫 투약 이후'})`;
    pkChart.options.scales.y.title.text = t.chartConcentration;
    pkChart.update();
}
