'use strict';
let Service, Characteristic, BaseURL;

const request = require('request');

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  BaseURL = 'https://api.iot.yandex.net/v1.0';

  homebridge.registerAccessory('HomebridgeYandexIoTPlugin',
    'homebridge-yandex-iot', YandexIOT);
};

function YandexIOT(log, config, api) {
  this.log = log;
  this.config = config;
  this.homebridge = api;

  this.log('YandexIOT init!');

  this.lightbulb = new Lightbulb(log, config, api);

  this.log('all event handler was setup.');
}

YandexIOT.prototype = {
  getServices() {
    if (!this.lightbulb.bulb) {
      return [];
    }
    this.log('Homekit asked to report service');
    const infoService = new Service.AccessoryInformation();
    infoService.setCharacteristic(Characteristic.Manufacturer, 'Sergey Cherkashin');
    return [infoService, this.lightbulb.bulb];
  },
};

function Lightbulb(log, config, api) {
  log('Lightbulb is Created!');
  this.log = log;
  this.config = config;
  this.id = config.id;
  this.authorization = config.authorization;

  this.homebridge = api;
  this.bright = 50;       // 0-100   – number
  this.temp = 140;        // 140-500 – number
  this.hue = 250;         // 0-360   – float
  this.saturation = 50;   // 0-100   – float

  // this.brightState = {};
  this.tempState = {};
  // this.hueState = {};
  // this.saturationState = {};

  if (this.config.defaultVolume) {
    this.defaultVolume = this.config.defaultVolume;
  } else {
    this.defaultVolume = 10;
  }

  // Создает лампочку
  this.bulb = new Service.Lightbulb(this.config.name);
  this.createBulb();
}

Lightbulb.prototype = {
  http(urlObject) {
    const { url, body = '', method = 'GET', headers = {}} = urlObject;

    return new Promise((resolve, reject) => {
      request(
        {
          url,
          body,
          method,
          headers: {
            Authorization: this.authorization,
            ...headers,
          },
        },
        (error, response, body) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        },
      );
    });
  },
  getTempValue(value, min, max, isYandex) {
    if (isYandex) {
      const inputPercentage = ((value - min) * 100) / (max - min);
      return Math.floor((inputPercentage * (500 - 140) / 100) + 140);
    } else {
      const inputPercentage = ((value - 140) * 100) / (500 - 140);
      return Math.floor(max - (inputPercentage * (max - min) / 100));
    }
  },
  getLightBulbInfo() {
    const urlObject = { url: `${BaseURL}/devices/${this.id}` };

    return this.http(urlObject)
      .then(({ body }) => JSON.parse(body))
      .catch((error) => {
        this.log('Error in getLightBulbInfo: '+ error.message);
        return error;
      });
  },
  createBulb() {
    this.getLightBulbInfo()
      .then(({ capabilities }) => {
        capabilities.forEach(({ type, parameters, state }) => {
          if (type === 'devices.capabilities.on_off') {
            this.bulb.getCharacteristic(Characteristic.On)
              .on('get', this.getPower.bind(this))
              .on('set', this.setPower.bind(this));
          }
          if (type === 'devices.capabilities.range') {
            if (parameters.instance === 'brightness') {
              this.bright = state.value;
              this.bulb.getCharacteristic(Characteristic.Brightness)
                .on('get', this.getBrightness.bind(this))
                .on('set', this.setBrightness.bind(this));
            }
            // if (parameters.instance === 'temperature') {}
          }
          if (type === 'devices.capabilities.color_setting') {
            if (parameters?.temperature_k) {
              const { min, max } = parameters.temperature_k;
              // работает либо только цвет(hue) либо температура, одновременно не имеет смысла
              // ColorTemperature – от холодного к теплому – подходит для Mi Lamp 1S
              this.temp = this.getTempValue(state.value, min, max, true);
              this.bulb.getCharacteristic(Characteristic.ColorTemperature)
                .on('get', this.getTemperature.bind(this))
                .on('set', this.setTemperature.bind(this));
            }
            if (parameters?.color_model) {
              this.bulb.getCharacteristic(Characteristic.Hue)
                .on('get', this.getHue.bind(this))
                .on('set', this.setHue.bind(this));
            }
          }
        });
      });
  },
  getPower(callback) {
    this.getLightBulbInfo().then(({ capabilities }) => {
      const { state } = capabilities.find(el => el.type = 'devices.capabilities.on_off');
      callback(null, state.value);
    }).catch();
  },
  setPower(on, callback) {
    const body = {
      devices: [
        {
          id: this.id,
          actions: [
            {
              type: 'devices.capabilities.on_off',
              state: {
                instance: 'on',
                value: on,
              },
            },
          ],
        },
      ],
    };

    const urlObject = {
      url: `${BaseURL}/devices/actions`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    };

    this.http(urlObject)
      .then(() => callback(null, on))
      .catch((error) => {
        this.log('Error in getLightBulbInfo: '+ error.message);
        callback(error);
      });
  },
  getBrightness(callback) {
    this.getLightBulbInfo().then(({ capabilities }) => {
      const { state } = capabilities.find(el => el.type = 'devices.capabilities.range' && el.parameters.instance === 'brightness');
      callback(null, state.value);
    });
  },
  setBrightness(value, callback) {
    const body = {
      devices: [
        {
          id: this.id,
          actions: [
            {
              type: 'devices.capabilities.range',
              state: {
                instance: 'brightness',
                value,
              },
            },
          ],
        },
      ],
    };

    const urlObject = {
      url: `${BaseURL}/devices/actions`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    };

    this.http(urlObject)
      .then(() => callback(null, value))
      .catch((error) => {
        this.log('Error in getLightBulbInfo: '+ error.message);
        callback(error);
      });
  },
  getTemperature(callback) {
    this.getLightBulbInfo().then(({ capabilities }) => {
      const tempState = capabilities.find(el => el.type = 'devices.capabilities.color_setting' && el.parameters?.temperature_k);
      this.tempState = tempState;
      const { state, parameters: { temperature_k: { min, max }}} = tempState;

      callback(null, this.getTempValue(state.value, min, max, true));
    });
  },
  setTemperature(value, callback) {
    const { min, max } = this.tempState.parameters.temperature_k;
    const bodyValue = this.getTempValue(value, min, max );
    const body = {
      devices: [
        {
          id: this.id,
          actions: [
            {
              type: 'devices.capabilities.color_setting',
              state: {
                instance: 'temperature_k',
                value: bodyValue,
              },
            },
          ],
        },
      ],
    };

    const urlObject = {
      url: `${BaseURL}/devices/actions`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    };

    this.http(urlObject)
      .then(() => callback(null, value))
      .catch((error) => {
        this.log('Error in getLightBulbInfo: '+ error.message);
        callback(error);
      });
  },
  getHue(callback) {
    this.getLightBulbInfo().then(({ capabilities }) => {
      const { state } = capabilities.find(el => el.type = 'devices.capabilities.color_setting' && el.parameters?.color_model);
      callback(null, state.value);
    });
  },
  setHue(value, callback) {
    this.log('Hue', { id: this.id, value });
    const body = {
      devices: [
        {
          id: this.id,
          actions: [
            {
              type: 'devices.capabilities.color_setting',
              state: {
                instance: 'color_model',
                value,
              },
            },
          ],
        },
      ],
    };

    const urlObject = {
      url: `${BaseURL}/devices/actions`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    };

    this.http(urlObject)
      .then(() => callback(null, value))
      .catch((error) => {
        this.log('Error in getLightBulbInfo: '+ error.message);
        callback(error);
      });
  },
  getSaturation(callback) {
    callback(null, this.saturation);
  },
  setSaturation(value, callback) {
    callback(null, value);
  },
};