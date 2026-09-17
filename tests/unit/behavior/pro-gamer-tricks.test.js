import { describe, it, expect, vi } from 'vitest';
import { ProGamerTricks } from '../../../src/behavior/pro-gamer-tricks.js';

describe('ProGamerTricks — про-геймерские физические трюки Minecraft', () => {
  it('выполняет трюк с факелом под падающий гравий', async () => {
    const mockTorch = { name: 'torch', type: 50 };
    const mockBot = {
      inventory: { items: () => [mockTorch] },
      equip: vi.fn(),
      placeBlock: vi.fn(),
      dig: vi.fn(),
      blockAt: vi.fn((pos) => {
        if (pos.y === 65) return { name: 'gravel' }; // Над блоком
        if (pos.y === 63) return { name: 'stone' };  // Под блоком
        return { name: 'air' };
      }),
    };

    const targetBlock = {
      position: { x: 10, y: 64, z: 10, offset: (dx, dy, dz) => ({ x: 10 + dx, y: 64 + dy, z: 10 + dz }) },
    };

    const res = await ProGamerTricks.gravelTorchBreak(mockBot, targetBlock);
    expect(res).toBe(true);
    expect(mockBot.dig).toHaveBeenCalledWith(targetBlock);
    expect(mockBot.equip).toHaveBeenCalledWith(mockTorch, 'hand');
    expect(mockBot.placeBlock).toHaveBeenCalled();
  });

  it('выкапывает всю рудную жилу целиком через 3D BFS (Vein Mining)', async () => {
    const blocksMap = {
      '10,64,10': { name: 'iron_ore', position: { x: 10, y: 64, z: 10, plus: (off) => ({ x: 10 + off.x, y: 64 + off.y, z: 10 + off.z }) } },
      '10,65,10': { name: 'iron_ore', position: { x: 10, y: 65, z: 10, plus: (off) => ({ x: 10 + off.x, y: 65 + off.y, z: 10 + off.z }) } },
      '11,64,10': { name: 'deepslate_iron_ore', position: { x: 11, y: 64, z: 10, plus: (off) => ({ x: 11 + off.x, y: 64 + off.y, z: 10 + off.z }) } },
    };

    const mockBot = {
      dig: vi.fn(),
      lookAt: vi.fn(),
      blockAt: vi.fn((pos) => blocksMap[`${pos.x},${pos.y},${pos.z}`] || null),
    };

    const startBlock = blocksMap['10,64,10'];
    const count = await ProGamerTricks.excavateOreVein(mockBot, startBlock);
    expect(count).toBe(3);
    expect(mockBot.dig).toHaveBeenCalledTimes(3);
  });

  it('ставит факел на правую стену тоннеля по ходу движения', async () => {
    const mockTorch = { name: 'torch', type: 50 };
    const mockBot = {
      entity: {
        position: { x: 0, y: 64, z: 0, offset: vi.fn((dx, dy, dz) => ({ x: dx, y: 64 + dy, z: dz, floored: () => ({ x: dx, y: 64 + dy, z: dz }) })) },
        yaw: 0, // Смотрит на север (-Z), правая стена на востоке (+X)
      },
      inventory: { items: () => [mockTorch] },
      equip: vi.fn(),
      placeBlock: vi.fn(),
      blockAt: vi.fn(() => ({ name: 'stone' })),
    };

    const res = await ProGamerTricks.placeRightWallTorch(mockBot);
    expect(res).toBe(true);
    expect(mockBot.equip).toHaveBeenCalledWith(mockTorch, 'hand');
    expect(mockBot.placeBlock).toHaveBeenCalled();
  });

  it('создает воздушный карман дверью под водой', async () => {
    const mockDoor = { name: 'oak_door', type: 64 };
    const mockBot = {
      entity: {
        position: { x: 5, y: 30, z: 5, offset: vi.fn((dx, dy, dz) => ({ x: 5 + dx, y: 30 + dy, z: 5 + dz, floored: () => ({ x: 5 + dx, y: 30 + dy, z: 5 + dz }) })) },
      },
      inventory: { items: () => [mockDoor] },
      equip: vi.fn(),
      placeBlock: vi.fn(),
      blockAt: vi.fn(() => ({ name: 'dirt' })),
    };

    const res = await ProGamerTricks.waterAirPocket(mockBot);
    expect(res).toBe(true);
    expect(mockBot.equip).toHaveBeenCalledWith(mockDoor, 'hand');
    expect(mockBot.placeBlock).toHaveBeenCalled();
  });

  it('проверяет безопасность сна и предотвращает взрыв кровати в Незере', () => {
    const overworldBot = { game: { dimension: 'overworld' } };
    expect(ProGamerTricks.checkSafeBedUse(overworldBot).safe).toBe(true);

    const netherBot = { game: { dimension: 'the_nether' } };
    const netherCheck = ProGamerTricks.checkSafeBedUse(netherBot);
    expect(netherCheck.safe).toBe(false);
    expect(netherCheck.reason).toContain('взрываются');
  });
});
