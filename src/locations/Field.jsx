import React, { useEffect } from 'react';
import { /* useCMA, */ useSDK } from '@contentful/react-apps-toolkit';
import { SingleLineEditor } from '@contentful/field-editor-single-line';

const Field = () => {
  // Init the SDK.
  const sdk = useSDK();
  // Get the replacement pattern specified in field instance. replacementPattern must
  // be added as an instance parameter on the app configuration screen. Example help
  // text: "A tokenized pattern of field IDs on this content type that will be used
  // for replacement. Please wrap all tokens in square brackets (e.g. [fieldId])."
  const replacementPattern = sdk.parameters.instance.replacementPattern;
  // Get tokens from replacement pattern.
  const tokens = replacementPattern.match(/\[.*?\]/g);

  // Initialize a map to contain all locales, which will then be populated with
  // tokens and replacement strings.
  const replacementMap = [];
  const availableLocales = sdk.locales.available;
  availableLocales.forEach(locale => {
    replacementMap[locale] = {};
  });

  const updateReplacementMap = () => {
    // Create an object containing initial tokens and matched replaced strings.
    // A manual object is used because Object.entries doesn't seem to work with Maps.
    tokens.forEach(token => {
      // Remove square brackets from token to get field name.
      const fieldId = token.slice(1, -1);
      // For each of the available locales, create an object to hold that
      // locale's tokens and replacement values.
      availableLocales.forEach(locale => {
        // Only operate on locale if field has localization enabled.
        if (sdk.entry.fields[fieldId].locales.includes(locale)) {
          replacementMap[locale][token] =
            sdk.entry.fields[fieldId].getValue(locale);
        }
      });
    });
  };

  const updateFieldValues = () => {
    Object.entries(replacementMap).forEach(([locale, tokens]) => {
      Object.entries(tokens).forEach(([token, value]) => {
        // Remove square brackets from token to get field name.
        const fieldId = token.slice(1, -1);
        sdk.entry.fields[fieldId].onValueChanged(locale, () => {
          updateReplacementMap();
          // For some reason `sdk.field.setValue` doesn't work with locale, instead it sets the value for ALL locales.
          // Only operate on locale if field has localization enabled.
          availableLocales.forEach(locale => {
            if (sdk.entry.fields[sdk.field.id].locales.includes(locale)) {
              sdk.entry.fields[sdk.field.id].setValue(
                replaceAll(replacementPattern, replacementMap[locale]),
                locale
              );
            }
          });
        });
      });
    });
  };

  // Helper function to replace multiple strings within a string in one go.
  const replaceAll = (str, mapObj) => {
    const escapedObjKeys = Object.keys(mapObj).map(e => {
      // Escape the brackets for proper use in RegExp below.
      return e.replace('[', '\\[').replace(']', '\\]');
    });
    const regex = new RegExp(escapedObjKeys.join('|'), 'g');
    return str.replace(regex, matched => {
      return mapObj[matched];
    });
  };

  useEffect(() => {
    sdk.window.startAutoResizer();
  }, [sdk.window]);

  useEffect(() => {
    updateReplacementMap();
    updateFieldValues();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /*
     To use the cma, inject it as follows.
     If it is not needed, you can remove the next line.
  */
  // const cma = useCMA();
  // If you only want to extend Contentful's default editing experience
  // reuse Contentful's editor components
  // -> https://www.contentful.com/developers/docs/extensibility/field-editors/

  // TODO: It's not possible to disable a field from editing via the UI when it is marked as the title.
  // Instead, you can leverage field-level perms to mark this field as read-only for relevant roles.
  return (
    <SingleLineEditor
      field={sdk.field}
      locales={sdk.locales}
      isInitiallyDisabled={true}
    />
  );
};

export default Field;
