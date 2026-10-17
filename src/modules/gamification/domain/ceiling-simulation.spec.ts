import { describe, expect, it } from 'vitest';
import {
  CEILING_STEP_IN_CENTS,
  CeilingSimulation,
  MAXIMUM_SIMULATION_STEPS,
  MINIMUM_CEILING_CAP_IN_CENTS,
} from './ceiling-simulation.js';

describe('CeilingSimulation', () => {
  const months = [100_000, 164_000, 80_000, 300_000];

  it('counts the months within a ceiling, landing exactly on it included', () => {
    expect(CeilingSimulation.over(months).at(100_000).monthsWithin).toBe(2);
  });

  it('averages the excess over the months that passed the ceiling only', () => {
    const simulated = CeilingSimulation.over(months).at(100_000);

    expect(simulated.totalExcessInCents).toBe(264_000);
    expect(simulated.averageExcessInCents).toBe(132_000);
  });

  it('reports no excess at all when every month fits', () => {
    const simulated = CeilingSimulation.over(months).at(300_000);

    expect(simulated.monthsWithin).toBe(4);
    expect(simulated.averageExcessInCents).toBe(0);
  });

  it('counts nothing when there are no closed months', () => {
    const simulated = CeilingSimulation.over([]).at(100_000);

    expect(simulated).toEqual({
      ceilingInCents: 100_000,
      monthsCounted: 0,
      monthsWithin: 0,
      averageExcessInCents: 0,
      totalExcessInCents: 0,
    });
  });

  describe('the track', () => {
    it('ends past the worst month on a round figure', () => {
      const range = CeilingSimulation.over([164_000]).range([]);

      expect(range).toEqual({ capInCents: 170_000, stepInCents: CEILING_STEP_IN_CENTS });
    });

    it('never ends below the minimum, however light the months were', () => {
      expect(CeilingSimulation.over([15_000]).range([]).capInCents).toBe(MINIMUM_CEILING_CAP_IN_CENTS);
      expect(CeilingSimulation.over([]).range([]).capInCents).toBe(MINIMUM_CEILING_CAP_IN_CENTS);
    });

    it('reaches the ceiling the user already chose, even above every month', () => {
      expect(CeilingSimulation.over([50_000]).range([250_000]).capInCents).toBe(250_000);
    });

    it('widens the step rather than exceed the maximum number of stops', () => {
      const range = CeilingSimulation.over([10_000_000]).range([]);
      const steps = CeilingSimulation.over([10_000_000]).steps(range);

      expect(steps.length).toBeLessThanOrEqual(MAXIMUM_SIMULATION_STEPS + 1);
      expect(range.stepInCents % CEILING_STEP_IN_CENTS).toBe(0);
      expect(steps.at(-1)?.ceilingInCents).toBe(range.capInCents);
    });

    it('starts at zero and steps up to the cap', () => {
      const simulation = CeilingSimulation.over([20_000]);
      const steps = simulation.steps(simulation.range([]));

      expect(steps.slice(0, 3).map((step) => step.ceilingInCents)).toEqual([0, 5_000, 10_000]);
      expect(steps.at(-1)?.ceilingInCents).toBe(MINIMUM_CEILING_CAP_IN_CENTS);
      expect(steps).toHaveLength(MINIMUM_CEILING_CAP_IN_CENTS / CEILING_STEP_IN_CENTS + 1);
    });
  });
});
