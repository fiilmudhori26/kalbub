import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Pressable, Text } from 'react-native';

import { LateCard } from '../src/components/LateCard';

function renderCard(onSudah = jest.fn(), onBelum = jest.fn()) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <LateCard
        daysLate={3}
        predictedStart="2026-11-11"
        onSudah={onSudah}
        onBelum={onBelum}
      />
    );
  });
  return tree!;
}

function allText(root: renderer.ReactTestInstance): string {
  return root
    .findAllByType(Text)
    .map((t) => {
      const children = t.props.children;
      return Array.isArray(children) ? children.join('') : String(children ?? '');
    })
    .join(' ');
}

describe('LateCard', () => {
  it('menampilkan pertanyaan "Sudah datang, Bububb?"', () => {
    const tree = renderCard();
    expect(allText(tree.root)).toContain('Sudah datang, Bububb?');
  });

  it('menampilkan tombol "Sudah" dan "Belum"', () => {
    const tree = renderCard();
    const text = allText(tree.root);
    expect(text).toContain('Sudah');
    expect(text).toContain('Belum');
  });

  it('menekan "Sudah" memanggil onSudah', () => {
    const onSudah = jest.fn();
    const tree = renderCard(onSudah, jest.fn());
    const button = tree.root.findByProps({ accessibilityLabel: 'Sudah' });
    act(() => {
      button.props.onPress();
    });
    expect(onSudah).toHaveBeenCalledTimes(1);
  });

  it('menekan "Belum" memanggil onBelum', () => {
    const onBelum = jest.fn();
    const tree = renderCard(jest.fn(), onBelum);
    const button = tree.root.findByProps({ accessibilityLabel: 'Belum' });
    act(() => {
      button.props.onPress();
    });
    expect(onBelum).toHaveBeenCalledTimes(1);
  });
});
