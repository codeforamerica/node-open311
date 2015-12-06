/**
 * Node-Open311: A Node.js module for interacting with the Open311 API.
 *
 * @copyright 2011 Mark J. Headd (http://www.voiceingov.org)
 * @author Mark J. Headd
 *
 */

var urlLib = require('url');
var pathLib = require('path');
var request = require('request');
var qs = require('querystring');
var __ = require('lodash');
var spark = require('sparkxml');
var xml2json = require('xml2json'); // used in submitRequest because of ambiguous Spark results
var Cities = require('./cities');

/**
 * Class constructor
 * @constructor
 * @param options Open311 settings.
 */
var Open311 = module.exports = function(options) {
  var id, city;

  if (__.isObject(options)) {
    __.extend(this, options);
  }
  else {
    id = options;
    city = __.find(Cities, function(city) {
      return (city.id === id);
    });

    if (typeof city === 'undefined') {
      throw new Error('"' + id + '" is not in our list of prepopulatable endpoints' );
    }

    __.extend(this, city);
  }

  __.defaults(this, {
    format: 'json'
  });
};

/**
 * Service discovery.
 * @param options Object that defines whether the result should be cached
 * @param callback Function to be executed on response from API.
 * @see http://wiki.open311.org/Service_Discovery
 */
Open311.prototype.serviceDiscovery = function(options, callback) {
  var self = this, defaults, url, path, format, data, endpoints, endpoint;

  // check if there are options
  if (__.isFunction(options)) {
    callback = options;
    options = {};
  }

  defaults = {
    cache: false,
    type: 'production',
    specification: 'http://wiki.open311.org/GeoReport_v2',
    index: 0
  };

  // add our defaults to the options; options is also cloned
  options = __.extend(defaults, options);

  // make sure the discovery URL is set
  if (typeof self.discovery === 'undefined') {
    throw new Error('You must set set a discovery URL in your Open311({discovery: "URL"}) object');
  }

  // get the format from our discovery URL
  format = pathLib.extname( urlLib.parse( self.discovery).pathname ).slice(1); // remove the leading period;

  // we can't use our _get() helper method since we have a different base URL
  request.get({
    url: self.discovery
  }, function (err, res, body) {
    if (res.statusCode !== 200) {
      callback(res.statusCode, 'There was an error connecting to the Open311 Discovery API: ' + res.statusCode);
      return;
    }

    if (format === 'xml') {
      data = spark.parseXml(body);
    }
    else {
      data = JSON.parse(body);
    }

    // do we save the data to the object?
    if (options.cache) {
      // filter the list of available endpoints by our specification and type
      endpoints = __.filter(data.endpoints, function(endpoint) {
        return (
          (endpoint.specification === options.specification) &&
          (endpoint.type === options.type)
        );
      });
      endpoint = endpoints[options.index];

      // set the endpoint url
      self.endpoint = endpoint.url;

      // detect whether there is a trailing slash (there should be)
      if (self.endpoint.slice(-1) !== '/') {
        self.endpoint = self.endpoint + '/';
      }

      // try to find JSON in the format, otherwise set format to be XML
      if (__.indexOf(endpoint.formats, 'application/json' !== -1)) {
        self.format = 'json';
      }
      else {
        self.format = 'xml';
      }
    }

    callback(false, data);
  });
};

/**
 * Get a list of service requests.
 * @param callback Function to be executed on response from API.
 * @see http://wiki.open311.org/GeoReport_v2#GET_Service_List
 */
Open311.prototype.serviceList = function(callback) {
  var self = this, data;

  // make sure the Endpoint URL is set
  if (typeof self.endpoint === 'undefined') {
    throw new Error('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
  }

  this._get('services', function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      data = spark.parseXml(body);
    }
    else {
      data = JSON.parse(body);
    }
    callback(null, data);
  });
};

/**
 * Get the attributes associated with a specific service code.
 * @param service_code The service code to be looked up.
 * @param callback Function to be executed on response from API.
 * @see http://wiki.open311.org/GeoReport_v2#GET_Service_Definition
 */
Open311.prototype.serviceDefinition = function(service_code, callback) {
  var self = this, data, i;

  // make sure the Endpoint URL is set
  if (typeof self.endpoint === 'undefined') {
    throw new Error('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
  }

  this._get('services/' + service_code, function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      data = spark.parseXml(body);
    }
    else {
      data = JSON.parse(body);
    }

    callback(null, data);
  });
};

/**
 * Submit a new service request.
 * @param data An object with keys/values used form post
 * @param callback Function to be executed on response from API.
 * @see http://wiki.open311.org/GeoReport_v2#POST_Service_Request
 */
Open311.prototype.submitRequest = function(data, callback) {
  var self = this, attribute, resData;

  // make sure the Endpoint URL is set
  if (typeof self.endpoint === 'undefined') {
    throw new Error('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
  }

  // deep clone the Service Request data in case the data object is reuesed
  data = __.clone(data, true);

  if (typeof self.apiKey === 'undefined') {
    throw new Error('Submitting a Service Request requires an API Key');
  }
  else {
    data.api_key = self.apiKey;
  }

  if (__.isObject(data.attributes)) {
    for (attribute in data.attributes) {
      data['attribute[' + attribute + ']'] = data.attributes[attribute];
    }
  }
  delete data.attributes; // remove the attributes since they are now unnecessary

  this._post('requests', data, function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      // here we're using xml2json because the Open311 Spark Convention
      // results in ambiguous json: "service_request_id" is indistinguishable from "token"
      resData = xml2json.toJson(body, {object: true}).service_requests.request;
      resData = [ resData ]; // object needs to be wrapped in an array
    }
    else {
      resData = JSON.parse(body);
    }

    callback(null, resData);
  });
};

/**
 * Get a service request ID from a temporary token.
 * @param format json|xml
 * @param token The temporary token ID.
 * @param callback Function to be executed on response from API;
 * Callback returns either the service_request_id (if available) or null
 * @see http://wiki.open311.org/GeoReport_v2#GET_request_id_from_a_token
 */
Open311.prototype.token = function(token, callback) {
  var self = this, data;

  // make sure the Endpoint URL is set
  if (typeof self.endpoint === 'undefined') {
    throw new Error('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
  }

  this._get('tokens/' + token, function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      data = spark.parseXml(body);
      // Manually check if no service_request_id was returned
      // this slightly goes against the spec but avoids the non-optimal
      // result of Spark convention returning [[TOKEN]]
      if (__.isArray(data[0])) {
        data[0] = { token: data[0][0] };
      }
    }
    else {
      data = JSON.parse(body); // it's returned as an
    }

    callback(null, data);
  });
};

/**
 * Get the status of a single/multiple service requests.
 * @param service_request_id (optional) The ID (string/numeric) of a single service request you want to return
 * @param parameters (optional) url parameters
 * @param callback Function to be executed on response from API.
 * @see http://wiki.open311.org/GeoReport_v2#GET_Service_Request
 */
Open311.prototype.serviceRequests = function(serviceRequestId, params, callback) {
  var self = this, url, jsonFormats, xmlFormats, data;

  // make sure the Endpoint URL is set
  if (typeof self.endpoint === 'undefined') {
    throw new Error('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
  }

  // check if there is a service_request_id
  if( __.isObject(serviceRequestId) && !__.isArray(serviceRequestId) ) {
    callback = params;
    params = serviceRequestId;
    serviceRequestId = false;
  }
  // check if there are params
  if (__.isFunction(params)) {
    callback = params;
    params = {};
  }

  // clone the params in case of reuse
  params = __.clone(params);


  // if serviceRequestId is NOT submitted as an array, use the URL method
  if (serviceRequestId && !__.isArray(serviceRequestId)) {
    url = 'requests/' + serviceRequestId;
  }
  else {
    url = 'requests';
  }

  // if serviceRequestId IS submitted as an array, use the URL method
  if (serviceRequestId && __.isArray(serviceRequestId)) {
    params.service_request_id = serviceRequestId.join(',');
  }

  this._get(url, params, function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      data = spark.parseXml(body);
    }
    else {
      data = JSON.parse(body);
    }

    // Convert the dates into javascript dates
    __.each(data, function(request) {
      if (request.requested_datetime) {
        request.requested_datetime = new Date(request.requested_datetime);
      }
      if (request.requested_datetime) {
        request.updated_datetime = new Date(request.updated_datetime);
      }
      if (request.expected_datetime) {
        request.expected_datetime = new Date(request.expected_datetime);
      }
    });
    callback(null, data);
  });
};

/**
 * Get the status of a single service request.
 * Alias of serviceRequests()
 */
Open311.prototype.serviceRequest = Open311.prototype.serviceRequests;

/**
 * Utility method for making a GET request to the Open311 API.
 * @param path e.g. 'services'
 * @param params (optional) url parameters
 * @param callback Function to be executed on response from API.
 */
Open311.prototype._get = function(path, params, callback) {
  var self = this;
  // make params optional
  if (__.isFunction(params)) {
    callback = params;
    params = {};
  }

  // make sure the jurisdiction_id is set
  if (this.jurisdiction) {
    params.jurisdiction_id = params.jurisdiction_id || this.jurisdiction;
  }

  // make our GET request
  request.get({
    url: this.endpoint + path + '.' + this.format,
    qs: params
  }, function (err, res, body) {
    if (res.statusCode !== 200) {
      callback(true, 'There was an error connecting to the Open311 API: ' + res.statusCode);
      return;
    }
    callback(false, body);
  });
};

/**
 * Utility method for making a POST request to the Open311 API.
 * @param path url path to be appended to the base URL e.g. 'requests'
 * @param form the keys/values to be POSTed
 * @param params (optional) url parameters
 * @param callback Function to be executed on response from API.
 */
Open311.prototype._post = function(path, form, params, callback) {
  var self = this;
  // make params optional
  if (__.isFunction(params)) {
    callback = params;
    params = {};
  }

  // make sure the jurisdiction_id is set
  if (this.jurisdiction) {
    params.jurisdiction_id = params.jurisdiction_id || this.jurisdiction;
  }

 // make our GET request
  request.post({
    url: this.endpoint + path + '.' + this.format,
    qs: params,
    form: form
  }, function (err, res, body) {
    if (res.statusCode >= 300) {
      callback(res.statusCode, 'There was an error connecting to the Open311 API: ' + res.statusCode + '; ' + body);
      return;
    }
    callback(false, body);
  });
};
