const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Diálogo rápido para configurar flags individuais em um Item (Modo Híbrido).
 */
export class ItemConfigDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(item, options = {}) {
    super(options);
    this.item = item;
  }

  static DEFAULT_OPTIONS = {
    id: "rolagens-globais-item-config",
    classes: ["rolagens-globais", "item-dialog-window"],
    tag: "div",
    window: {
      title: "ROLAGENS_GLOBAIS.Title",
      icon: "fas fa-dice-d20",
      resizable: false
    },
    position: {
      width: 440,
      height: "auto"
    },
    actions: {
      cancel: ItemConfigDialog.#onCancel
    }
  };

  static PARTS = {
    main: {
      template: "modules/rolagens-globais/templates/item-config.hbs"
    }
  };

  async _prepareContext(options) {
    const ignoreGlobal = this.item.getFlag("rolagens-globais", "ignoreGlobal") || false;
    const ignoreMadness = this.item.getFlag("rolagens-globais", "ignoreMadness") || false;
    return {
      item: this.item,
      ignoreGlobal,
      ignoreMadness
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element.querySelector("form");
    if (form) {
      form.addEventListener("submit", (e) => this.#onFormSubmit(e));
    }
  }

  static #onCancel(event, target) {
    this.close();
  }

  async #onFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const ignoreGlobal = formData.get("ignoreGlobal") === "on";
    const ignoreMadness = formData.get("ignoreMadness") === "on";

    await this.item.setFlag("rolagens-globais", "ignoreGlobal", ignoreGlobal);
    await this.item.setFlag("rolagens-globais", "ignoreMadness", ignoreMadness);
    ui.notifications.info(`Configurações de Rolagens Globais salvas para: ${this.item.name}`);
    this.close();
  }
}
