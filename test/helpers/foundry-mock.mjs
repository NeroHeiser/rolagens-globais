export function setupFoundryEnvironment() {
  globalThis.CONST = {
    TABLE_RESULT_TYPES: {
      TEXT: 0,
      DOCUMENT: 1,
      COMPENDIUM: 2
    },
    DICE_ROLL_MODES: {
      PUBLIC: "public",
      PRIVATE: "gm",
      BLIND: "blind",
      SELF: "self"
    }
  };

  globalThis.foundry = {
    utils: {
      deepClone: (obj) => structuredClone(obj),
      randomID: () => Math.random().toString(36).substring(2, 10)
    },
    applications: {
      api: {
        ApplicationV2: class {},
        HandlebarsApplicationMixin: (base) => class extends base {}
      }
    }
  };

  globalThis.game = {
    i18n: {
      localize: (key) => key
    },
    system: {
      id: "generic"
    }
  };
}

setupFoundryEnvironment();
