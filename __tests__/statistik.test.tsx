import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import StatistikScreen from '../app/(tabs)/statistik';
import type { DailyLog, Period } from '../src/lib/db';

const mockListPeriods = jest.fn<Promise<Period[]>, []>();
const mockListDailyLogs = jest.fn<Promise<DailyLog[]>, []>();
const mockGetSetting = jest.fn<Promise<string | null>, [string]>();

jest.mock('../src/lib/db', () => ({
  listPeriods: () => mockListPeriods(),
  listDailyLogs: () => mockListDailyLogs(),
  getSetting: (key: string) => mockGetSetting(key),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// useFocusEffect butuh navigation context — no-op di lingkungan test.
jest.mock('expo-router', () => ({
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
  };
});

const mountedTrees: renderer.ReactTestRenderer[] = [];

async function renderScreen() {
  let tree: renderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = renderer.create(<StatistikScreen />);
  });
  mountedTrees.push(tree as renderer.ReactTestRenderer);
  return tree as renderer.ReactTestRenderer;
}

function allText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join('') : String(children ?? '');
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

afterEach(async () => {
  while (mountedTrees.length > 0) {
    const tree = mountedTrees.pop();
    if (tree) {
      await act(async () => {
        tree.unmount();
      });
    }
  }
});

describe('StatistikScreen', () => {
  beforeEach(() => {
    mockListPeriods.mockReset().mockResolvedValue([]);
    mockListDailyLogs.mockReset().mockResolvedValue([]);
    mockGetSetting.mockReset().mockResolvedValue(null);
  });

  it('0 data → empty state hangat, tanpa crash & tanpa NaN', async () => {
    const tree = await renderScreen();
    const text = allText(tree);

    expect(text).toContain('Belum ada data cukup, catat siklus pertamamu dulu ♡');
    expect(text).not.toContain('NaN');
  });

  it('1 siklus lengkap tercatat → tidak ada NaN, label “siklus lengkap tercatat” muncul', async () => {
    mockListPeriods.mockResolvedValue([
      { id: 1, start: '2026-09-28', end: '2026-10-02' },
      { id: 2, start: '2026-10-27', end: '2026-10-31' },
    ]);
    const tree = await renderScreen();
    const text = allText(tree);

    expect(text).toContain('siklus lengkap tercatat');
    expect(text).not.toContain('NaN');
    // 27 Sep → 27 Okt = 29 hari, rata-rata siklus = 29
    expect(text).toContain('29');
  });

  it('1 periode saja (belum ada siklus lengkap) → aman, tanpa NaN', async () => {
    mockListPeriods.mockResolvedValue([
      { id: 1, start: '2026-10-01', end: '2026-10-05' },
    ]);
    const tree = await renderScreen();
    const text = allText(tree);

    expect(text).not.toContain('NaN');
    expect(text).toContain('siklus lengkap tercatat');
  });

  it('top 3 gejala dihitung dari daily logs (urut frekuensi)', async () => {
    mockListPeriods.mockResolvedValue([
      { id: 1, start: '2026-09-01', end: '2026-09-05' },
      { id: 2, start: '2026-09-30', end: '2026-10-04' },
    ]);
    const mkLog = (date: string, symptoms: string[]): DailyLog => ({
      date,
      flow: 'medium',
      symptoms,
      mood: null,
      pain: 0,
      note: '',
    });
    mockListDailyLogs.mockResolvedValue([
      mkLog('2026-09-01', ['Kram', 'Lelah']),
      mkLog('2026-09-02', ['Kram']),
      mkLog('2026-09-03', ['Kram', 'Kembung']),
      mkLog('2026-09-30', ['Lelah', 'Kembung']),
      mkLog('2026-10-01', ['Kembung']),
    ]);
    const tree = await renderScreen();
    const text = allText(tree);

    expect(text).toContain('Gejala paling sering');
    expect(text).toContain('Kram');
    expect(text).toContain('Kembung');
    expect(text).toContain('Lelah');
    // Kram muncul 3×, Kembung & Lelah 2× masing-masing
    expect(text).toContain('3×');
  });
});
