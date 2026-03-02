import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import Chart, { ChartConfiguration, ScatterDataPoint, TooltipItem } from 'chart.js/auto';
import { TimingDatum, PlaySubmission, ScoringSystemHelper } from './scoring';
import * as fs from 'fs';

export interface ChartTimingVisualizerOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  title?: string;
}

interface TimingDataPoint extends ScatterDataPoint {
  judgmentName?: string;
}

export const JUDGMENT_COLORS: Record<string, string> = {
  'Fantastic (10ms)': '#00FFFF', // Cyan for 10ms
  'Fantastic (15ms)': '#21CCE8', // Blue
  'Fantastic (23ms)': '#ffffff', // White
  Excellent: '#e29c18', // Gold
  Great: '#66c955', // Green
  Decent: '#b45cff', // Purple
  'Way Off': '#c9855e', // Brown
  Miss: '#ff3030', // Red
};

export class ChartJSTimingVisualizer {
  private options: Required<ChartTimingVisualizerOptions>;
  private judgmentColors: Record<string, string> = JUDGMENT_COLORS;

  constructor(options: ChartTimingVisualizerOptions = {}) {
    this.options = {
      width: 1500,
      height: 400,
      backgroundColor: '#111111',
      title: 'Timing Data Visualization',
      ...options,
    };
  }

  public async visualizeTimingData(submission: PlaySubmission, scoringSystem: ScoringSystemHelper): Promise<Buffer> {
    // Extract timing data points grouped by judgment and misses
    const { datasetsByJudgment, misses } = this.extractDataPointsByJudgment(submission.timingData, scoringSystem);

    if (Object.keys(datasetsByJudgment).length === 0) {
      throw new Error('No valid timing data points found');
    }

    // Create Chart.js configuration
    const configuration = this.createChartConfiguration(submission, datasetsByJudgment, misses, scoringSystem);

    // Add lifebar data if available
    if (submission.lifebarInfo && submission.lifebarInfo.length > 0) {
      this.addLifebarDataset(configuration, submission.lifebarInfo);
    }

    // Generate chart
    const chartJSNodeCanvas = new ChartJSNodeCanvas({
      width: this.options.width,
      height: this.options.height,
      backgroundColour: this.options.backgroundColor, // brits detected!
    });

    return await chartJSNodeCanvas.renderToBuffer(configuration);
  }

  private extractDataPointsByJudgment(
    timingData: TimingDatum[],
    scoringSystem: ScoringSystemHelper,
  ): { datasetsByJudgment: Record<string, TimingDataPoint[]>; misses: number[] } {
    const datasetsByJudgment: Record<string, TimingDataPoint[]> = {};
    const misses: number[] = [];

    timingData.forEach(([time, offset]) => {
      if (offset === 'Miss') {
        misses.push(time as number);
      } else if (typeof offset === 'number') {
        const window = scoringSystem.getWindow(offset);
        const judgmentName = window.name;

        if (!datasetsByJudgment[judgmentName]) {
          datasetsByJudgment[judgmentName] = [];
        }

        datasetsByJudgment[judgmentName].push({
          x: time as number,
          y: offset as number,
          judgmentName,
        });
      }
    });

    return { datasetsByJudgment, misses };
  }

  private createChartConfiguration(
    submission: PlaySubmission,
    datasetsByJudgment: Record<string, TimingDataPoint[]>,
    misses: number[],
    scoringSystem: ScoringSystemHelper,
  ): ChartConfiguration {
    // Sort judgments by scoring system window order (same order as defined in scoring system)
    const sortedJudgments = Object.keys(datasetsByJudgment).sort((a, b) => {
      const windowA = scoringSystem.scoringSystem.windows.find((w) => w.name === a);
      const windowB = scoringSystem.scoringSystem.windows.find((w) => w.name === b);

      if (!windowA && !windowB) return 0;
      if (!windowA) return 1;
      if (!windowB) return -1;

      // Sort by the order they appear in the scoring system (by maxOffset)
      return windowA.maxOffset - windowB.maxOffset;
    });

    // Create datasets for each judgment type
    const datasets: any[] = sortedJudgments.map((judgment) => ({
      label: `${judgment}: ${datasetsByJudgment[judgment].length}`,
      data: datasetsByJudgment[judgment],
      backgroundColor: this.judgmentColors[judgment] || '#666666',
      borderColor: this.judgmentColors[judgment] || '#666666',
      pointRadius: 2,
      pointHoverRadius: 3,
      showLine: false,
      type: 'scatter' as const,
    }));

    // Add miss lines as vertical red lines
    if (misses.length > 0) {
      // Calculate the Y range for vertical lines
      const allYValues = Object.values(datasetsByJudgment)
        .flat()
        .map((point) => point.y as number);
      const minY = Math.min(...allYValues);
      const maxY = Math.max(...allYValues);
      const yRange = Math.max(Math.abs(minY), Math.abs(maxY));
      const paddedRange = yRange * 1;

      // Create vertical line datasets for each miss
      misses.forEach((missTime) => {
        datasets.push({
          label: '', // Don't show misses in legend
          data: [
            { x: missTime, y: -paddedRange },
            { x: missTime, y: paddedRange },
          ],
          backgroundColor: this.judgmentColors['Miss'],
          borderColor: this.judgmentColors['Miss'],
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 0,
          showLine: true,
          fill: false,
          type: 'line' as const,
          tension: 0,
        });
      });
    }

    return {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: false,
        animation: false,
        plugins: {
          title: {
            display: true,
            text: [`${submission.songName} - ${submission.artist}`, `Pack: ${submission.pack || 'Unknown'} | Hash: ${submission.hash}`],
            font: {
              size: 16,
              weight: 'bold',
            },
            color: '#aaaaaa',
            padding: 20,
          },
          legend: {
            display: true,
            position: 'right',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 10,
              font: {
                size: 10,
              },
              boxWidth: 12,
              boxHeight: 12,
              color: '#aaaaaa',
              generateLabels: (chart) => {
                const original = Chart.defaults.plugins.legend.labels.generateLabels;
                const labels = original(chart);

                // Filter out empty labels (e.g., for misses)
                return labels.filter((label) => label.text !== '');
              },
            },
          },
          tooltip: {
            callbacks: {
              title: (tooltipItems: TooltipItem<'scatter'>[]) => {
                const item = tooltipItems[0];
                return `Time: ${(item.parsed.x as number).toFixed(3)}s`;
              },
              label: (tooltipItem: TooltipItem<'scatter'>) => {
                const data = tooltipItem.raw as TimingDataPoint;
                return [`${data.judgmentName}`, `Offset: ${((data.y as number) * 1000).toFixed(0)}ms`];
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Time (seconds)',
              font: {
                size: 12,
                weight: 'bold',
              },
            },
            grid: {
              drawOnChartArea: false, // Don't draw grid lines for x-axis
            },
          },
          y: {
            type: 'linear',
            title: {
              display: true,
              text: 'Timing Offset (milliseconds)',
              font: {
                size: 12,
                weight: 'bold',
              },
            },
            grid: {
              color: (context) => {
                const value = context.tick.value as number;

                // Zero line - keep default color
                if (value === 0) return '#666666';

                // Find which timing window this line represents
                const absValue = Math.abs(value);
                const window = scoringSystem.scoringSystem.windows.find(
                  (w) => Math.abs(w.maxOffset - absValue) < 0.0001, // Use small epsilon for floating point comparison
                );

                if (window) {
                  const baseColor = this.judgmentColors[window.name] || '#666666';
                  // Convert hex to rgba with 50% opacity
                  const hex = baseColor.replace('#', '');
                  const r = parseInt(hex.substr(0, 2), 16);
                  const g = parseInt(hex.substr(2, 2), 16);
                  const b = parseInt(hex.substr(4, 2), 16);
                  return `rgba(${r}, ${g}, ${b}, 0.25)`;
                }

                return '#666666';
              },
            },
            // Add zero line and timing window lines
            ticks: {
              callback: function (value) {
                // Only show labels for certain values, hide timing window boundary labels
                const numValue = value as number;
                const absValue = Math.abs(numValue);
                const isTimingWindow = scoringSystem.scoringSystem.windows.some((w) => Math.abs(w.maxOffset - absValue) < 0.0001);

                // Hide labels for timing window boundaries, show for others
                if (isTimingWindow && numValue !== 0) {
                  return '';
                }

                return (numValue * 1000).toFixed(0);
              },
              // Generate ticks for timing windows
              stepSize: undefined, // Let Chart.js calculate, but we'll override with afterBuildTicks
            },
            afterBuildTicks: (scale) => {
              const timingWindows = scoringSystem.scoringSystem.windows.map((w) => w.maxOffset);
              const windowTicks = [];

              // Add zero line
              windowTicks.push({ value: 0 });

              // Add positive and negative timing window boundaries
              timingWindows.forEach((offset) => {
                windowTicks.push({ value: offset });
                windowTicks.push({ value: -offset });
              });

              // Sort ticks by value
              windowTicks.sort((a, b) => a.value - b.value);

              // Filter to only show ticks within the visible range
              const visibleTicks = windowTicks.filter((tick) => {
                return tick.value >= scale.min && tick.value <= scale.max;
              });

              scale.ticks = visibleTicks;
            },
          },
          // Secondary y-axis for lifebar percentage
          y1: {
            type: 'linear',
            display: false, // Will be enabled when lifebar data is present
            position: 'right',
            title: {
              display: true,
              text: 'Lifebar %',
              font: {
                size: 12,
                weight: 'bold',
              },
            },
            min: 0,
            max: 1,
            ticks: {
              callback: function (value) {
                return `${((value as number) * 100).toFixed(0)}%`;
              },
            },
            grid: {
              drawOnChartArea: false, // Don't draw grid lines for secondary axis
            },
          },
        },
        elements: {
          point: {
            radius: 3,
            hoverRadius: 5,
          },
        },
      },
    };
  }

  private addLifebarDataset(configuration: ChartConfiguration, lifebarInfo: { x: number; y: number }[]) {
    // Enable secondary y-axis
    if (configuration.options?.scales?.y1) {
      configuration.options.scales.y1.display = true;
    }

    // Add lifebar line dataset
    const lifebarDataset = {
      label: 'Lifebar %',
      data: lifebarInfo.map((point) => ({ x: point.x, y: point.y })),
      borderColor: '#FFFFFF',
      backgroundColor: 'rgba(255, 107, 107, 0.1)',
      borderWidth: 5,
      pointRadius: 0,
      pointHoverRadius: 5,
      showLine: true,
      fill: false,
      type: 'line' as const,
      yAxisID: 'y1', // Use secondary y-axis
      tension: 0.25, // Slight curve for smoother line
    };

    configuration.data.datasets.push(lifebarDataset);
  }

  public saveToFile(buffer: Buffer, filepath: string): void {
    fs.writeFileSync(filepath, buffer);
  }
}
