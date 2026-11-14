import React from 'react';
import renderer, { act } from 'react-test-renderer';
import CatatScreen from '../app/(tabs)/catat';
import { todayISO } from '../src/lib/dates';
import type { DailyLog } from '../src/lib/db';

const mockGetDailyLog = jest.fn<Promise<DailyLog | null>, [string]>();
const mockUpsertDailyLog = jest.fn<Promise<void>, [DailyLog]>();

jest.mock('../src/lib/db', () => ({
  getDailyLog: (date: string) => mockGetDailyLog(date),
  upsertDailyLog: (log: DailyLog) => mockUpsertDailyLog(log),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
  };
});

const mountedTrees: renderer.ReactTestRenderer[] = [];

async function renderScreen() {
  let tree: renderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = renderer.create(<CatatScreen />);
  });
  mountedTrees.push(tree as renderer.ReactTestRenderer);
  return tree as renderer.ReactTestRenderer;
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

describe('CatatScreen', () => {
  beforeEach(() => {
    mockGetDailyLog.mockReset().mockResolvedValue(null);
    mockUpsertDailyLog.mockReset().mockResolvedValue(undefined);
  });

  it('memanggil upsertDailyLog dengan payload benar saat simpan', async () => {
    const tree = await renderScreen();
    const root = tree.root;

    act(() => {
      root.findByProps({ accessibilityLabel: 'Kram' }).props.onPress();
    });
    act(() => {
      root.findByProps({ accessibilityLabel: 'Aliran Ringan' }).props.onPress();
    });
    act(() => {
      root.findByProps({ accessibilityLabel: 'Suasana hati Senang' }).props.onPress();
    });
    act(() => {
      root.findByProps({ accessibilityLabel: 'Tambah nyeri' }).props.onPress();
    });
    act(() => {
      root.findByProps({ accessibilityLabel: 'Tambah nyeri' }).props.onPress();
    });
    act(() => {
      root
        .findByProps({ accessibilityLabel: 'Catatan bebas' })
        .props.onChangeText('Perut mulas banget');
    });
    await act(async () => {
      root.findByProps({ accessibilityLabel: 'Simpan hari ini' }).props.onPress();
    });

    expect(mockUpsertDailyLog).toHaveBeenCalledTimes(1);
    expect(mockUpsertDailyLog).toHaveBeenCalledWith({
      date: todayISO(),
      flow: 'light',
      symptoms: ['Kram'],
      mood: 'Senang',
      pain: 2,
      note: 'Perut mulas banget',
    });
  });

  it('chip gejala toggle: pilih lalu batal pilih', async () => {
    const tree = await renderScreen();
    const root = tree.root;

    expect(
      root.findByProps({ accessibilityLabel: 'Kram' }).props.accessibilityState.selected
    ).toBe(false);

    act(() => {
      root.findByProps({ accessibilityLabel: 'Kram' }).props.onPress();
    });
    expect(
      root.findByProps({ accessibilityLabel: 'Kram' }).props.accessibilityState.selected
    ).toBe(true);

    act(() => {
      root.findByProps({ accessibilityLabel: 'Kram' }).props.onPress();
    });
    expect(
      root.findByProps({ accessibilityLabel: 'Kram' }).props.accessibilityState.selected
    ).toBe(false);
  });

  it('memuat log existing untuk tanggal aktif dan menyimpannya kembali', async () => {
    mockGetDailyLog.mockResolvedValue({
      date: todayISO(),
      flow: 'medium',
      symptoms: ['Kembung', 'Lelah'],
      mood: 'Tenang',
      pain: 5,
      note: 'kemarin catat begini',
    });
    const tree = await renderScreen();
    const root = tree.root;

    expect(mockGetDailyLog).toHaveBeenCalledWith(todayISO());
    expect(
      root.findByProps({ accessibilityLabel: 'Kembung' }).props.accessibilityState.selected
    ).toBe(true);
    expect(
      root.findByProps({ accessibilityLabel: 'Aliran Sedang' }).props.accessibilityState
        .selected
    ).toBe(true);

    await act(async () => {
      root.findByProps({ accessibilityLabel: 'Simpan hari ini' }).props.onPress();
    });
    expect(mockUpsertDailyLog).toHaveBeenCalledWith({
      date: todayISO(),
      flow: 'medium',
      symptoms: ['Kembung', 'Lelah'],
      mood: 'Tenang',
      pain: 5,
      note: 'kemarin catat begini',
    });
  });

  it('nyeri tidak bisa dikurangi di bawah 0', async () => {
    const tree = await renderScreen();
    const root = tree.root;

    act(() => {
      root.findByProps({ accessibilityLabel: 'Kurangi nyeri' }).props.onPress();
    });
    await act(async () => {
      root.findByProps({ accessibilityLabel: 'Simpan hari ini' }).props.onPress();
    });
    expect(mockUpsertDailyLog).toHaveBeenCalledWith(
      expect.objectContaining({ pain: 0 })
    );
  });
});
