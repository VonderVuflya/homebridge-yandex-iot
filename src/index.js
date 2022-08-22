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

  if (this.config.defaultVolume) {
    this.defaultVolume = this.config.defaultVolume;
  } else {
    this.defaultVolume = 10;
  }

  // Создает лампочку
  this.bulb = new Service.Lightbulb(this.config.name);
  this.createBulb();

  // this.bulb.getCharacteristic(Characteristic.Hue)
  //   .on('get', this.getHue.bind(this))
  //   .on('set', this.setHue.bind(this));
  // this.bulb.getCharacteristic(Characteristic.Saturation)
  //   .on('get', this.getSaturation.bind(this))
  //   .on('set', this.setSaturation.bind(this));

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
        capabilities.forEach((ability, index) => {
          if (ability.type === 'devices.capabilities.on_off') {
            this.bulb.getCharacteristic(Characteristic.On)
              .on('get', this.getPower.bind(this))
              .on('set', this.setPower.bind(this));
          }
          if (ability.type === 'devices.capabilities.range') {
            if (ability.parameters.instance === 'brightness') {
              this.bright = ability.state.value;
              this.bulb.getCharacteristic(Characteristic.Brightness)
                .on('get', this.getBrightness.bind(this))
                .on('set', this.setBrightness.bind(this));
            }
            // if (ability.parameters.instance === 'temperature') {}
          }
          if (ability.type === 'devices.capabilities.color_setting') {
            // работает либо только цвет(hue) либо температура, одновременно не имеет смысла
            // ColorTemperature – от холодного к теплому – подходит для Mi Lamp 1S
            this.temp = Math.floor(ability.state.value / 10);
            this.bulb.getCharacteristic(Characteristic.ColorTemperature)
              .on('get', this.getTemperature.bind(this))
              .on('set', this.setTemperature.bind(this));
          }
        });
      });
  },
  getPower(callback) {
    this.getLightBulbInfo().then(({ capabilities }) => {
      const { state } = capabilities.find(el => el.type = 'devices.capabilities.on_off');
      callback(null, state.value);
    });
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

    return this.http(urlObject)
      .then(() => callback(null, on))
      .catch((error) => {
        this.log('Error in getLightBulbInfo: '+ error.message);
        callback(error);
      });
  },
  getBrightness(callback) {
    callback(null, this.bright);
  },
  setBrightness(value, callback) {
    callback(null, value);
  },
  getTemperature(callback) {
    callback(null, this.temp);
  },
  setTemperature(value, callback) {
    callback(null, value);
  },
  getHue(callback) {
    callback(null, this.hue);
  },
  setHue(value, callback) {
    callback(null, value);
  },
  getSaturation(callback) {
    callback(null, this.saturation);
  },
  setSaturation(value, callback) {
    callback(null, value);
  },
};