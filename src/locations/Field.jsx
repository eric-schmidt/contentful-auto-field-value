import React, { useEffect, useState } from 'react';
import { TextInput } from '@contentful/f36-components';
import { /* useCMA, */ useSDK } from '@contentful/react-apps-toolkit';

const Field = () => {
  // Init the SDK.
  const sdk = useSDK();
  // Get the replacement pattern specified in field instance. replacementPattern must
  // be added as an instance parameter on the app configuration screen. Example help
  // text: "A tokenized pattern of field IDs on this content type that will be used
  // for replacement. Please wrap all tokens in square brackets (e.g. [fieldId])."
  const replacementPattern = sdk.parameters.instance.replacementPattern;
  const [replacementString, setReplacementString] = useState(replacementPattern);

  // Init replacementMap, which is used to store token to value mappings.
  const replacementMap = {};
  // Get tokens from replacement pattern.
  const tokens = replacementPattern.match(/\[.*?\]/g);

  const updateReplacementMap = () => {
    // Create an object containing initial tokens and matched replaced strings.
    // A manual object is used because Object.entries doesn't seem to work with Maps.
    tokens.forEach((token) => {
      // Remove square brackets from field name.
      const fieldName = token.slice(1, -1);
      // Add actual field value to map array, keyed off of original token.
      // We then use this later to replace each token with its field value.
      replacementMap[token] = sdk.entry.fields[fieldName].getValue();
    });
  };

  // Helper function to replace multiple strings within a string in one go.
  const replaceAll = (str, mapObj) => {
    const escapedObjKeys = Object.keys(mapObj).map((e) => {
      // Escape the brackets for proper use in RegExp below.
      return e.replace('[', '\\[').replace(']', '\\]');
    });
    const regex = new RegExp(escapedObjKeys.join('|'), 'g');

    return str.replace(regex, (matched) => {
      return mapObj[matched];
    });
  };

  const updateValue = () => {
    // Replace tokens in replacement pattern for use in programmatically populated field.
    Object.entries(replacementMap).forEach(([key, value]) => {
      const fieldName = key.slice(1, -1);
      sdk.entry.fields[fieldName].onValueChanged(() => {
        // Update replacementMap values to reflect current input values.
        updateReplacementMap();
        // Update replacementString state variable and properly set the
        // field value for this field to the replacement string value.
        const updatedValue = replaceAll(replacementPattern, replacementMap);
        setReplacementString(updatedValue);
        sdk.field.setValue(updatedValue);
      });
    });
  };

  useEffect(() => {
    sdk.window.startAutoResizer();
  }, [sdk.window]);

  useEffect(() => {
    updateReplacementMap();
    updateValue();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /*
     To use the cma, inject it as follows.
     If it is not needed, you can remove the next line.
  */
  // const cma = useCMA();
  // If you only want to extend Contentful's default editing experience
  // reuse Contentful's editor components
  // -> https://www.contentful.com/developers/docs/extensibility/field-editors/

  return <TextInput name='internalTitle' type='text' value={replacementString} isDisabled={true} />;
};

export default Field;
