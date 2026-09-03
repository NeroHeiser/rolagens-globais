import { GenericAdapter } from "./generic-adapter.mjs";
import { Dnd5eAdapter } from "./dnd5e-adapter.mjs";
import { Tormenta20Adapter } from "./t20-adapter.mjs";
import { Pf2eAdapter } from "./pf2e-adapter.mjs";
import { DaggerheartAdapter } from "./daggerheart-adapter.mjs";

/**
 * Retorna o adaptador apropriado com base no sistema atualmente carregado no Foundry VTT.
 * @returns {BaseAdapter}
 */
export function getActiveAdapter() {
  const systemId = game.system?.id;

  switch (systemId) {
    case "dnd5e":
      return new Dnd5eAdapter();
    case "tormenta20":
      return new Tormenta20Adapter();
    case "pf2e":
      return new Pf2eAdapter();
    case "daggerheart":
      return new DaggerheartAdapter();
    default:
      return new GenericAdapter();
  }
}

export {
  GenericAdapter,
  Dnd5eAdapter,
  Tormenta20Adapter,
  Pf2eAdapter,
  DaggerheartAdapter
};

