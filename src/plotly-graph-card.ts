/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult, css, PropertyValues, CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators';

import { HomeAssistant, hasConfigOrEntityChanged, LovelaceCardEditor, getLovelace } from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

// TODO: bundle with
import 'https://cdn.plot.ly/plotly-2.4.2.min.js';
const Plotly = (window as any).Plotly;
import merge from 'lodash-es/merge';
import './editor';

import type { BoilerplateCardConfig, History } from './types';
import { CARD_VERSION } from './const';
import { localize } from './localize/localize';

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

  // TODO Add any properities that should cause your element to re-render here
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private config!: BoilerplateCardConfig;

  private history: History[] = [];
  private _data = [];
  private fetched = false;
  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: BoilerplateCardConfig): void {
    // TODO Check for required fields and that they are of the proper format
    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }

    this.config = {
      name: 'Plotly Graph',
      ...config,
    };
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }

    return hasConfigOrEntityChanged(this, changedProps, false);
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
  }
  async fetch(hass) {
    this.history = [];
    if (!hass) return;
    this._data = [];
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
    this.history = (await hass.callApi('GET', uri)) || [];
    this.fetched = true;
    console.timeEnd('fetch');
  }

  async plot(hass) {
    if (!this.fetched) {
      await this.fetch(hass);
    }
    console.log(history);
    const data = this.history.map((entity, i) => ({
      x: entity.map(({ last_changed }) => last_changed),
      y: entity.map(({ state }) => state),
      name: entity[0].attributes.friendly_name,
      type: 'scatter',
      ...this.config.entities[i],
    }));

    const layoutDefaults = {
      width: parseFloat(window.getComputedStyle(this).width),
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      yaxis: {
        tickcolor: 'rgb(63,63,63)',
        gridcolor: 'rgb(63,63,63)',
        zerolinecolor: 'rgb(63,63,63)',
        zeroline: true,
        showline: true,
      },
      xaxis: {
        tickcolor: 'rgb(63,63,63)',
        gridcolor: 'rgb(63,63,63)',
        zerolinecolor: 'rgb(63,63,63)',
        zeroline: true,
        showline: true,
      },
      font: {
        color: 'rgb(136,136,136)',
      },
      margin: {
        b: 40,
        t: 0,
        l: 60,
        r: 10,
      },
      legend: {
        orientation: 'h',
        xanchor: 'start',
        y: 1.15,
      },
      title: !this.fetched
        ? { text: 'Loading...', xanchor: 'center', yanchor: 'middle', y: 0.5, font: { size: 40 } }
        : undefined,
    };
    const layout = merge(layoutDefaults, this.config.layout || {});
    console.log(layout);
    Plotly.newPlot(this.shadowRoot?.querySelector('.card-content'), data as any, layout);
  }

  protected updated() {
    this.plot(this.hass);
  }
  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
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
