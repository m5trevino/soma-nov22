import { ModelPicker } from "./ModelPicker.js?v=3";

export class AttemptForm extends HTMLElement {
  constructor() {
    super();
    this._models = [];
    this._initial = null;
    this._state = {
      model: "",
      temperature: 0.7,
      max_tokens: "",
      tools: false,
      mode: "balanced",
      condition: "",
    };
    this.attachShadow({ mode: "open" });
  }

  set models(value) {
    this._models = Array.isArray(value) ? value : [];
    this.render();
  }

  set initial(value) {
    this._initial = value || null;
    if (this._initial) {
      this._state = {
        model: this._initial.model || "",
        temperature: this._initial.temperature ?? 0.7,
        max_tokens: this._initial.max_tokens ?? "",
        tools: Boolean(this._initial.tools),
        mode: this._initial.mode || "balanced",
        condition: this._initial.condition || "",
      };
    } else {
      this._reset();
    }
    this.render();
  }

  _reset() {
    // Only reset per-model fields. Temp, max_tokens, tools, mode persist
    // across submissions so you can batch-add multiple attempts quickly.
    this._state.model = "";
    this._state.condition = "";
    // These stay unchanged: temperature, max_tokens, tools, mode
  }

  _emit(eventName, detail) {
    this.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true, composed: true }));
  }

  _onModelSelect(event) {
    // On multi-select, _state.model is the last clicked (primary).
    this._state.model = event.detail.id;
    this.render();
  }

  _buildPayload(model) {
    return {
      model: model || this._state.model,
      temperature: Number(this._state.temperature),
      max_tokens: this._state.max_tokens === "" ? null : Number(this._state.max_tokens),
      tools: this._state.tools,
      mode: this._state.mode,
    };
  }

  _onSubmitSingle() {
    if (!this._state.model) {
      this._showError("Model is required");
      return;
    }
    const payload = this._buildPayload();
    if (this._state.condition) {
      payload.condition = this._state.condition;
    }
    this._emit("attempt-submit", payload);
    this._reset();
    this.render();
  }

  _onSubmit() {
    // Check if there are multiple Ctrl+selected models to submit.
    // The model picker tracks _selectedIds; we query it via the DOM.
    const picker = this.shadowRoot.querySelector("model-picker");
    if (picker && picker._selectedIds && picker._selectedIds.size > 1) {
      // Multi-submit: emit one attempt per selected model.
      const ids = [...picker._selectedIds].filter(Boolean);
      for (const modelId of ids) {
        if (!modelId) continue;
        const payload = this._buildPayload(modelId);
        if (this._state.condition) {
          payload.condition = this._state.condition;
        }
        this._emit("attempt-submit", payload);
      }
      // Only reset per-model fields; temp/tools/mode persist.
      this._reset();
      this.render();
      return;
    }
    // Single-submit path.
    this._onSubmitSingle();
  }

  _onCancel() {
    this._emit("attempt-cancel", {});
    this._reset();
    this.render();
  }

  _showError(message) {
    const error = this.shadowRoot.querySelector(".error");
    if (error) {
      error.textContent = message;
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, sans-serif; }
        .field { margin-bottom: 0.75rem; }
        label { display: block; margin-bottom: 0.25rem; color: #aaa; font-size: 0.9rem; }
        input[type="range"] { width: 100%; }
        .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .error { color: #f87171; min-height: 1.2rem; }
      </style>
      <form onsubmit="return false;">
        <div class="field">
          <label>Model *</label>
          <model-picker></model-picker>
        </div>
        <div class="field">
          <label>Temperature: ${this._state.temperature}</label>
          <input type="range" min="0" max="2" step="0.05" value="${this._state.temperature}" class="temp" />
        </div>
        <div class="field">
          <label>Max Tokens</label>
          <input type="number" class="max-tokens" value="${this._state.max_tokens}" placeholder="optional" />
        </div>
        <div class="field">
          <label>
            <input type="checkbox" class="tools" ${this._state.tools ? "checked" : ""} /> Tools
          </label>
        </div>
        <div class="field">
          <label>Mode</label>
          <select class="mode">
            <option value="stealth" ${this._state.mode === "stealth" ? "selected" : ""}>stealth</option>
            <option value="balanced" ${this._state.mode === "balanced" ? "selected" : ""}>balanced</option>
            <option value="apex" ${this._state.mode === "apex" ? "selected" : ""}>apex</option>
          </select>
        </div>
        <div class="field">
          <label>Condition (e.g. tokens < 1000)</label>
          <input type="text" class="condition" value="${this._state.condition}" placeholder="optional" />
        </div>
        <div class="error"></div>
        <div class="actions">
          <button type="button" class="submit">Add Attempt</button>
          <button type="button" class="cancel">Cancel</button>
        </div>
      </form>
    `;

    const picker = this.shadowRoot.querySelector("model-picker");
    picker.models = this._models;
    picker.selectedId = this._state.model;
    picker.addEventListener("model-select", (e) => this._onModelSelect(e));

    this.shadowRoot.querySelector(".temp").addEventListener("input", (e) => {
      this._state.temperature = e.target.value;
      this.render();
    });
    this.shadowRoot.querySelector(".max-tokens").addEventListener("input", (e) => {
      this._state.max_tokens = e.target.value;
    });
    this.shadowRoot.querySelector(".tools").addEventListener("change", (e) => {
      this._state.tools = e.target.checked;
    });
    this.shadowRoot.querySelector(".mode").addEventListener("change", (e) => {
      this._state.mode = e.target.value;
    });
    this.shadowRoot.querySelector(".condition").addEventListener("input", (e) => {
      this._state.condition = e.target.value;
    });
    this.shadowRoot.querySelector(".submit").addEventListener("click", () => this._onSubmit());
    this.shadowRoot.querySelector(".cancel").addEventListener("click", () => this._onCancel());
  }
}

customElements.define("attempt-form", AttemptForm);
