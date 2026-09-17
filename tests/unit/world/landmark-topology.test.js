import { describe, it, expect } from 'vitest';
import { LandmarkTopology } from '../../../src/world/landmark-topology.js';

describe('LandmarkTopology — человеческая пространственная память по ориентирам', () => {
  it('запоминает и извлекает ориентиры по названию без учета регистра', () => {
    const topology = new LandmarkTopology();
    topology.remember('Старый дуб', { x: 100, y: 64, z: 200 }, 'большое ветвистое дерево у реки');

    const found = topology.get('старый дуб');
    expect(found).not.toBeNull();
    expect(found.name).toBe('Старый дуб');
    expect(found.coords.x).toBe(100);
  });

  it('находит ближайший ориентир к заданной точке', () => {
    const topology = new LandmarkTopology();
    topology.remember('Дом', { x: 0, y: 64, z: 0 });
    topology.remember('Шахта', { x: 100, y: 30, z: 100 });

    const nearest = topology.findNearest({ x: 90, y: 32, z: 95 });
    expect(nearest).not.toBeNull();
    expect(nearest.name).toBe('Шахта');
    expect(nearest.distance).toBeLessThan(20);
  });

  it('формирует человеческое относительное описание позиции', () => {
    const topology = new LandmarkTopology();
    topology.remember('Печь', { x: 10, y: 64, z: 10 });

    const descExact = topology.describeRelative({ x: 10, y: 64, z: 11 });
    expect(descExact).toContain('прямо у ориентира "Печь"');

    const descFar = topology.describeRelative({ x: 30, y: 64, z: 10 });
    expect(descFar).toContain('около "Печь"');
  });
});
