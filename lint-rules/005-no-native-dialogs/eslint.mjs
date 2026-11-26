import { NATIVE_DIALOG_BAN_MESSAGE } from "../shared/pathUtils.mjs";

export const nativeDialogRestrictedProperties = ["window", "globalThis", "self"].flatMap(
  (object) =>
    ["alert", "confirm", "prompt"].map((property) => ({
      object,
      property,
      message: NATIVE_DIALOG_BAN_MESSAGE,
    }))
);

export const noNativeDialogsEslintConfigs = [
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        {
          name: "alert",
          message: NATIVE_DIALOG_BAN_MESSAGE,
        },
        {
          name: "confirm",
          message: NATIVE_DIALOG_BAN_MESSAGE,
        },
        {
          name: "prompt",
          message: NATIVE_DIALOG_BAN_MESSAGE,
        },
      ],
      "no-restricted-properties": [
        "error",
        ...nativeDialogRestrictedProperties,
      ],
    },
  },
];
