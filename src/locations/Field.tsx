import { useEffect, useRef } from "react";
import { useSDK } from "@contentful/react-apps-toolkit";
import { SingleLineEditor } from "@contentful/field-editor-single-line";
import { Note } from "@contentful/f36-components";
import type { FieldAppSDK } from "@contentful/app-sdk";

type TokenMap = Record<string, string>;
type ReplacementMap = Record<string, TokenMap>;

interface InstanceParameters {
  replacementPattern: string;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applyTokenReplacements = (pattern: string, mapObj: TokenMap): string => {
  const keys = Object.keys(mapObj);
  if (keys.length === 0) return pattern;
  const regex = new RegExp(keys.map(escapeRegExp).join("|"), "g");
  return pattern.replace(regex, (matched) => mapObj[matched] ?? "");
};

const Field = () => {
  const sdk = useSDK<FieldAppSDK<Record<string, never>, InstanceParameters>>();
  const replacementPattern = sdk.parameters.instance.replacementPattern;
  const replacementMapRef = useRef<ReplacementMap>({});

  useEffect(() => {
    sdk.window.startAutoResizer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!replacementPattern) return;

    const tokens = replacementPattern.match(/\[.*?\]/g) ?? [];
    const availableLocales = sdk.locales.available;
    const targetField = sdk.entry.fields[sdk.field.id];

    const map: ReplacementMap = {};
    availableLocales.forEach((locale) => {
      map[locale] = {};
    });
    replacementMapRef.current = map;

    const validTokens = tokens.filter((token) => {
      const fieldId = token.slice(1, -1);
      if (!sdk.entry.fields[fieldId]) {
        console.warn(
          `[auto-field-value] Pattern references unknown field id "${fieldId}"; skipping.`,
        );
        return false;
      }
      return true;
    });

    const refreshMapEntry = (token: string, locale: string) => {
      const fieldId = token.slice(1, -1);
      const sourceField = sdk.entry.fields[fieldId];
      if (!sourceField.locales.includes(locale)) return;
      const value = sourceField.getValue(locale);
      map[locale][token] = value == null ? "" : String(value);
    };

    validTokens.forEach((token) => {
      availableLocales.forEach((locale) => refreshMapEntry(token, locale));
    });

    const unsubscribers: Array<() => void> = [];
    validTokens.forEach((token) => {
      const fieldId = token.slice(1, -1);
      const sourceField = sdk.entry.fields[fieldId];
      availableLocales.forEach((locale) => {
        if (!sourceField.locales.includes(locale)) return;
        // sdk.field.setValue ignores locale and writes to ALL locales, so we
        // reach through sdk.entry.fields[targetId].setValue(value, locale).
        const unsub = sourceField.onValueChanged(locale, () => {
          refreshMapEntry(token, locale);
          if (targetField.locales.includes(locale)) {
            targetField.setValue(
              applyTokenReplacements(replacementPattern, map[locale]),
              locale,
            );
          }
        });
        unsubscribers.push(unsub);
      });
    });

    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  }, [replacementPattern, sdk]);

  if (!replacementPattern) {
    return (
      <Note variant="warning" title="Missing configuration">
        The auto-field-value app needs a <code>replacementPattern</code>{" "}
        instance parameter on this field's appearance settings (e.g.{" "}
        <code>[brand] - [productName]</code>).
      </Note>
    );
  }

  // It's not possible to disable a field from editing via the UI when it is
  // marked as the title. Use field-level perms to mark this field read-only
  // for relevant roles instead.
  return (
    <SingleLineEditor
      field={sdk.field}
      locales={sdk.locales}
      isInitiallyDisabled={true}
    />
  );
};

export default Field;
