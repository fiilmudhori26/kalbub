import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { PredictionCard } from '../src/components/PredictionCard';
import { predictNext } from '../src/lib/predictions';
import { formatID } from '../src/lib/dates';
import type { Period } from '../src/lib/db';

const periods: Period[] = [
  { id: 1, start: '2026-09-20', end: '2026-09-24' },
  { id: 2, start: '2026-10-18', end: '2026-10-22' },
];

function allText(root: renderer.ReactTestInstance): string {
  return root
    .findAllByType(Text)
    .map((t) => {
      const children = t.props.children;
      return Array.isArray(children) ? children.join('') : String(children ?? '');
    })
    .join(' ');
}

describe('PredictionCard', () => {
  it('menampilkan tanggal hasil predictNext', () => {
    const today = '2026-11-14';
    const prediction = predictNext(periods, today, {});
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PredictionCard prediction={prediction} />);
    });
    const text = allText(tree!.root);
    expect(text).toContain(formatID(prediction.predictedStart));
  });

  it('menampilkan rentang masa subur', () => {
    const today = '2026-11-14';
    const prediction = predictNext(periods, today, {});
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PredictionCard prediction={prediction} />);
    });
    const text = allText(tree!.root);
    expect(text).toContain(formatID(prediction.fertileStart));
  });

  it('tanpa prediction menampilkan ajakan catat haid pertama', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PredictionCard prediction={null} />);
    });
    const text = allText(tree!.root);
    expect(text).toContain('haid');
  });
});
