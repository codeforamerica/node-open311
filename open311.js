/**
 * Node-Open311: A Node.js module for interacting with the Open311 API.
 * 
 * @copyright 2011 Mark J. Headd (http://www.voiceingov.org)
 * @author Mark J. Headd
 * 
 */

var http = require('http');
var https = require('https');
var urlLib = require('url');
var pathLib = require('path');
var request = require('request');
var qs = require('querystring');
var __ = require('lodash');
var xmlParser = require('xml2json');

/**
 * Class constructor
 * @constructor
 * @param options Open311 settings.
 */
var Open311 = module.exports = function(options) {
  this.endpoint = options.endpoint;

  if (options.discovery) {
    this.discovery = options.discovery;
  }

  if (options.jurisdiction) {
    this.jurisdiction = options.jurisdiction;
  }

  if(options.apiKey) {
    this.apiKey = options.apiKey;
  }

  this.format = options.format || 'json';
};

/**
 * Service discovery.
 * @param callback Function to be executed on response from API.
 * @see http://wiki.open311.org/Service_Discovery
 */
Open311.prototype.serviceDiscovery = function(options, callback) {
  var self = this, url, path, format, data, endpoints, endpoint;

  // check if there are options
  if (__.isFunction(options)) {
    callback = options;
    options = {};
  }

  // set default options
  options.cache = options.cache || false;
  options.type = options.type || 'production';
  options.specification = options.specification || 'http://wiki.open311.org/GeoReport_v2';
  options.index = options.index || 0; // in the awful case that 

  // make sure the discovery URL is set
  if (typeof self.discovery === 'undefined') {
    throw new Error('You must set set a discovery URL in your Open311({discovery: "URL"}) object');
  }

  // get the format from our discovery URL
  format = pathLib.extname( urlLib.parse( self.discovery).pathname ).slice(1) // remove the leading period;

  // we can't use our _get() helper method since we have a different base URL
  request.get({
    url: self.discovery
  }, function (err, res, body) {
    if (res.statusCode !== 200) {
      callback(res.statusCode, 'There was an error connecting to the Open311 Discovery API: ' + res.statusCode);
      return;
    }

    if (format === 'xml') {
      data = xmlParser.toJson(body, {object: true}).discovery;
      data.endpoints = data.endpoints.endpoint;
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
        self.format = 'json'
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
  this._get('services', function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      data = xmlParser.toJson(body, {object: true}).services.service;
    }
    else {
      data = JSON.parse(body);
    }
    callback(null, data);
  });
};

/**
 * Get the attributes associated with a specific service code.
 * @param format json|xml
 * @param service_code The service code to be looked up.
 * @param callback Function to be executed on response from API.
 * @see http://wiki.open311.org/GeoReport_v2#GET_Service_Definition
 */
Open311.prototype.serviceDefinition = function(service_code, callback) {
  var self = this, data, i;
  this._get('services/' + service_code, function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      data = xmlParser.toJson(body, {object: true}).service_definition;
      data.attributes = data.attributes.attribute;
      for (i = 0; i < data.attributes.length; i++) {
        if (data.attributes[i].values.value) {
          data.attributes[i].values = data.attributes[i].values.value;
        }
        else {
          data.attributes[i].values = null;
        }
      }
    }
    else {
      data = JSON.parse(body);
    }

    callback(null, data)
  });
};

/**
 * Submit a new service request.
 * @param data An object with keys/values used form post
 * @param callback Function to be executed on response from API.
 * @see http://wiki.open311.org/GeoReport_v2#POST_Service_Request
 */
Open311.prototype.submitRequest = function(data, callback) {
  var self = this, resData;
  if (typeof self.apiKey === 'undefined') {
    throw new Error('Submitting a Service Request requires an API Key');
  }
  else {
    data.api_key = self.apiKey;
  }

  this._post('requests', data, function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      resData = xmlParser.toJson(body, {object: true}).service_requests.request;
      resData = [ resData ] // object needs to be wrapped in an array
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
 * @param callback Function to be executed on response from API.
 * @see http://wiki.open311.org/GeoReport_v2#GET_request_id_from_a_token
 */
Open311.prototype.token = function(token, callback) {
  var self = this, data;
  this._get('tokens/' + token, function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      data = xmlParser.toJson(body, {object: true}).service_requests.request;
    }
    else {
      data = JSON.parse(body);
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

  // check if there is a service_request_id
  if(__.isObject(serviceRequestId)) {
    params = serviceRequestId;
    serviceRequestId = false;
  }
  // check if there are params
  if (__.isFunction(params)) {
    callback = params;
    params = {};
  }

  if (serviceRequestId) {
    url = 'requests/' + serviceRequestId;
  }
  else {
    url = 'requests';
  }

  this._get(url, params, function(err, body) {
    if (err) {
      callback (err, body);
      return;
    }

    if (self.format === 'xml') {
      data = self._parseServiceRequestsXml(body);
    }
    else {
      data = JSON.parse(body);
    }

    jsonFormats = ['application/json'];
    xmlFormats = ['text/xml'];

    callback(null, data);
  });
};

/**
 * Get the status of a single service request.
 * Alias of serviceRequests()
 */
Open311.prototype.serviceRequest = Open311.prototype.serviceRequests;

/**
 * Utility method for parsing Service Requests XML
 * @param xml 
 */

Open311.prototype._parseServiceRequestsXml = function(xml) {
  var data;
  data = xmlParser.toJson(xml, {object: true}).service_requests.request;
  return data;
}

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
}

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
      console.log(body);
      callback(res.statusCode, 'There was an error connecting to the Open311 API: ' + res.statusCode + '; ' + body);
      return;
    }
    callback(false, body);
  });
}
