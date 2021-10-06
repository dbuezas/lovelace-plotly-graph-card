/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult, css, PropertyValues, CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators';

import { HomeAssistant, LovelaceCardEditor, getLovelace } from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

// TODO: bundle with
import 'https://cdn.plot.ly/plotly-2.4.2.min.js';
const Plotly = (window as any).Plotly;
import merge from 'lodash-es/merge';
import isEqual from 'lodash-es/isEqual';
import './editor';

import type { BoilerplateCardConfig, History } from './types';
import { CARD_VERSION } from './const';
import { localize } from './localize/localize';
import defaultLayout from './default-layout';

/* eslint no-console: 0 */
console.info(
  `%c  PLOTLY-GRAPH-CARD \n%c  ${localize('common.version')} ${CARD_VERSION}    `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'plotly-graph',
  name: 'Plotly Graph Card',
  description: 'Graph cards based on Plotly.js',
});

function isTruthy<T>(x: T | null): x is T {
  return Boolean(x);
}

@customElement('plotly-graph')
export class BoilerplateCard extends LitElement {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('plotly-graph-editor');
  }

  public static getStubConfig(): object {
    return {
      hours: 24,
      entities: {
        entity: 'sun.sun',
      },
    };
  }

  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) private config!: BoilerplateCardConfig;
  @property({ attribute: false }) private entities: string[] = [];
  @property({ attribute: false }) private plotlyData: Plotly.Data[] = [];
  @property({ attribute: false }) private plotlyLayout: Partial<Plotly.Layout> = {};
  @property({ attribute: false }) private plotlyConfig: Partial<Plotly.Config> = {};
  @property({ attribute: false }) private history: History[] = [];

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: BoilerplateCardConfig): void {
    console.log('setConfig');
    // TODO Check for required fields and that they are of the proper format
    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }
    const entities = config.entities.map(({ entity }) => entity);
    if (!isEqual(entities, this.entities)) {
      this.entities = entities;
      console.log('entities', entities);
    }
    this.config = {
      name: 'Plotly Graph',
      ...config,
    };
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    return false;
    console.log('changedProps', changedProps);
    if (!this.config) {
      return false;
    }
    return true;
  }

  protected firstUpdated() {
    const style = Array.from(document.querySelectorAll<Element & LinkStyle>(`style[id^="plotly.js"]`))
      .map((styleEl) => styleEl.sheet)
      .filter(isTruthy)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join('\n');

    this.shadowRoot!.querySelector('#plotly-style-hack')!.innerHTML = `
      .js-plotly-plot .plotly .modebar-btn {
          fill: rgb(136,136,136);
      }
      ${style}
    `;
    const container = this.shadowRoot!.querySelector('.card-content')!;
    const updateWidth = () => {
      const width = parseFloat(window.getComputedStyle(container).width);
      this.plotlyLayout = { ...this.plotlyLayout, width };
    };
    const observer = new ResizeObserver(updateWidth);
    updateWidth();
    observer.observe(container);
  }
  async fetch() {
    // if (this.history?.length) return this.history;
    const startDate = new Date(new Date().setDate(new Date().getDate() - this.config.days));
    const endDate = new Date();
    const uri =
      'history/period/' +
      startDate.toISOString() +
      '?filter_entity_id=' +
      this.config.entities.map(({ entity }) => entity) +
      '&significant_changes_only=1' +
      '&minimal_response' +
      '&end_time=' +
      endDate.toISOString();
    console.log(uri);
    console.time('fetch');
    const history = (await this.hass.callApi('GET', uri)) || [];
    console.timeEnd('fetch');
    return history as History[];
  }

  protected async updated(changedProps) {
    if (changedProps.has('config')) {
      console.log('changed config');

      this.plotlyLayout = merge(defaultLayout, this.config.layout);
      this.history = await this.fetch();
    }
    if (changedProps.has('history')) {
      console.log('changed history');
      this.plotlyData = this.history.map((entity, i) => ({
        x: entity.map(({ last_changed }) => last_changed),
        y: entity.map(({ state }) => state),
        name: entity[0].attributes.friendly_name,
        type: 'scatter',
        ...this.config.entities[i],
      }));
    }

    if (['plotlyData', 'plotlyLayout', 'plotlyConfig'].some((prop) => changedProps.has(prop))) {
      console.log("changed history ['plotlyData', 'plotlyLayout', 'plotlyConfig'] ");
      Plotly.newPlot(
        this.shadowRoot?.querySelector('.card-content'),
        this.plotlyData,
        this.plotlyLayout,
        this.plotlyConfig,
      );
    }
  }
  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    console.log('render');
    // TODO Check for stateObj or other necessary things and render a warning if missing
    if (this.config.show_warning) {
      return this._showWarning(localize('common.show_warning'));
    }

    if (this.config.show_error) {
      return this._showError(localize('common.show_error'));
    }

    return html`
      <ha-card .header=${this.config.name} tabindex="0" .label=${`Title: ${this.config.entity || 'No Entity Defined'}`}>
        <style id="plotly-style-hack"></style>
        <div class="card-content"></div>
      </ha-card>
    `;
  }

  private _showWarning(warning: string): TemplateResult {
    return html` <hui-warning>${warning}</hui-warning> `;
  }

  private _showError(error: string): TemplateResult {
    const errorCard = document.createElement('hui-error-card');
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this.config,
    });

    return html` ${errorCard} `;
  }

  // https://lit.dev/docs/components/styles/
  static get styles(): CSSResultGroup {
    return css``;
  }
}
