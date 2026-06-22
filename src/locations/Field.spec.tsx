import Field from './Field';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

type Listener = (value: unknown) => void;

const buildSdk = (replacementPattern: string | undefined) => {
  const listeners: Record<string, Record<string, Listener>> = {
    brand: { 'en-US': () => {}, 'de-DE': () => {} },
    productName: { 'en-US': () => {}, 'de-DE': () => {} },
  };
  const unsubscribe = vi.fn();
  const targetSetValue = vi.fn();

  const makeSourceField = (id: 'brand' | 'productName', values: Record<string, unknown>) => ({
    id,
    locales: ['en-US', 'de-DE'],
    getValue: (locale: string) => values[locale],
    onValueChanged: (locale: string, cb: Listener) => {
      listeners[id][locale] = cb;
      return unsubscribe;
    },
  });

  const sdk = {
    parameters: { instance: { replacementPattern } },
    locales: { available: ['en-US', 'de-DE'], default: 'en-US' },
    field: { id: 'title', locale: 'en-US' },
    window: { startAutoResizer: vi.fn() },
    entry: {
      fields: {
        brand: makeSourceField('brand', { 'en-US': 'Acme', 'de-DE': 'Akme' }),
        productName: makeSourceField('productName', {
          'en-US': 'Widget',
          'de-DE': 'Gerät',
        }),
        title: {
          id: 'title',
          locales: ['en-US', 'de-DE'],
          setValue: targetSetValue,
        },
      },
    },
  };

  return { sdk, listeners, unsubscribe, targetSetValue };
};

let currentSdk: ReturnType<typeof buildSdk>['sdk'];
vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => currentSdk,
}));

vi.mock('@contentful/field-editor-single-line', () => ({
  SingleLineEditor: (props: { isInitiallyDisabled?: boolean }) => (
    <div data-test-id="single-line-editor" data-disabled={String(!!props.isInitiallyDisabled)} />
  ),
}));

describe('Field component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the disabled SingleLineEditor when configured', () => {
    const { sdk } = buildSdk('[brand] - [productName]');
    currentSdk = sdk;

    render(<Field />);

    const editor = screen.getByTestId('single-line-editor');
    expect(editor).toHaveAttribute('data-disabled', 'true');
    expect(sdk.window.startAutoResizer).toHaveBeenCalled();
  });

  it('renders a configuration warning when replacementPattern is missing', () => {
    const { sdk } = buildSdk(undefined);
    currentSdk = sdk;

    render(<Field />);

    expect(screen.getByText(/Missing configuration/i)).toBeInTheDocument();
    expect(screen.queryByTestId('single-line-editor')).not.toBeInTheDocument();
  });

  it('updates only the changed locale on a source field change', () => {
    const built = buildSdk('[brand] - [productName]');
    currentSdk = built.sdk;

    render(<Field />);

    built.listeners.brand['en-US']('NewBrand');

    expect(built.targetSetValue).toHaveBeenCalledTimes(1);
    expect(built.targetSetValue).toHaveBeenCalledWith('Acme - Widget', 'en-US');

    (built.sdk.entry.fields.brand as unknown as {
      getValue: (l: string) => unknown;
    }).getValue = (locale: string) => (locale === 'en-US' ? 'NewBrand' : 'Akme');

    built.listeners.brand['en-US']('NewBrand');
    expect(built.targetSetValue).toHaveBeenLastCalledWith('NewBrand - Widget', 'en-US');
    expect(
      built.targetSetValue.mock.calls.every(([, locale]) => locale === 'en-US'),
    ).toBe(true);
  });

  it('unsubscribes all listeners on unmount', () => {
    const built = buildSdk('[brand] - [productName]');
    currentSdk = built.sdk;

    const { unmount } = render(<Field />);
    unmount();

    // 2 tokens * 2 locales = 4 listeners registered → 4 unsubscribes.
    expect(built.unsubscribe).toHaveBeenCalledTimes(4);
  });
});
