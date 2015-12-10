var expect = require('chai').expect;
var should = require('chai').should();
var sinon = require('sinon');
var Open311 = require('../open311');
var request = require('request');
var spark = require('sparkxml');
var fs    = require('fs');

describe('Open311()', function() {
  describe('new Open311()', function() {
    var open311;

    before(function(done) {
      open311 = new Open311({
        endpoint: 'http://app.311.dc.gov/CWI/Open311/v2/',
        format: 'xml',
        jurisdiction: 'dc.gov'
      });
      done();
    });

    it("should attach options to `this`", function(done) {
      expect(open311.endpoint).to.equal('http://app.311.dc.gov/CWI/Open311/v2/');
      expect(open311.format).to.equal('xml');
      expect(open311.jurisdiction).to.equal('dc.gov');
      done();
    });

    it("should only set this.jurisdiction if it exists in options", function(done) {
      open311 = new Open311({
        endpoint: 'https://mayors24.cityofboston.gov/open311/v2/',
      });
      expect(open311).to.not.have.keys(['jurisdiction']);
      done();
    });

    it("should default this.format to 'json'", function(done) {
      open311 = new Open311({
        endpoint: 'https://mayors24.cityofboston.gov/open311/v2/',
      });
      expect(open311.format).to.equal('json');
      done();
    });
    describe("when passing a city string in to the constructor", function() {
      var Cities = require(__dirname + '../../cities');
      Cities = [{
        "id": "baltimore",
        "name": "Baltimore, MD",
        "vendor": "connectedbits",
        "discovery": "http://311.baltimorecity.gov/open311/discovery.json",
        "endpoint": "http://311.baltimorecity.gov/open311/v2/"
      }];

      it("should automatically hydrate the instance with the options", function(done) {
        open311 = new Open311("baltimore");

        expect(open311.id).to.equal('baltimore');
        expect(open311.name).to.equal('Baltimore, MD');
        expect(open311.vendor).to.equal('connectedbits');
        expect(open311.discovery).to.equal('http://311.baltimorecity.gov/open311/discovery.json');
        expect(open311.endpoint).to.equal('http://311.baltimorecity.gov/open311/v2/');
        done();
      });

      it("should throw an error if the city is not in our big list of cities", function(done) {
        expect(function() { new Open311("katmandu"); }).to.throw('"katmandu" is not in our list of prepopulatable endpoints');
        done();
      });
    });
  });

describe('.serviceDiscovery()', function() {
    var open311;
    var xml = fs.readFileSync(__dirname + '/mocks/discovery-dc.xml', 'utf8');
    var json = fs.readFileSync(__dirname + '/mocks/discovery-boston.json', 'utf8');

    beforeEach(function(done){
      open311 = new Open311({
        discovery: 'http://app.311.dc.gov/cwi/Open311/discovery.xml',
        jurisdiction: 'dc.gov'
      });

      sinon.stub(request, 'get');
      done();
    });

    afterEach(function(done){
      request.get.restore();
      done();
    });

    it('should fetch from the this.discovery url', function(done) {
      request.get.callsArgWith(1, true, {statusCode: 200}, xml);
      open311.serviceDiscovery(function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/cwi/Open311/discovery.xml');
      done();
    });

    it('should parse XML when discovery.xml', function(done) {
      request.get.callsArgWith(1, true, {statusCode: 200}, xml);
      sinon.spy(spark, 'parseXml');

      open311.serviceDiscovery(function(err, data) {});
      expect(spark.parseXml.called).to.equal(true);

      spark.parseXml.restore(); // cleanup
      done();
    });

    it('should parse JSON when discovery.json', function(done) {
      open311.discovery = 'https://mayors24.cityofboston.gov/open311/discovery.json';
      request.get.callsArgWith(1, true, {statusCode: 200}, "{}");
      sinon.spy(JSON, 'parse');

      open311.serviceDiscovery(function(err, data) {});
      expect(JSON.parse.called).to.equal(true);

      JSON.parse.restore(); // cleanup
      done();
    });

    it('when options.cache = true, it should set the endpoint url and add a trailing slash (if necessary)', function(done) {
      open311.discovery = 'http://app.311.dc.gov/cwi/Open311/discovery.xml';
      request.get.callsArgWith(1, true, {statusCode: 200}, xml);

      open311.serviceDiscovery({ cache: true }, function(err, data) {
        expect(open311.endpoint).to.equal('http://app.311.dc.gov/cwi/Open311/v2/');
      });
      done();
    });

    it('when options.cache = true, it should set the endpoint url based on options.specification', function(done) {
      open311.discovery = 'http://app.311.dc.gov/cwi/Open311/discovery.xml';
      request.get.callsArgWith(1, true, {statusCode: 200}, xml);

      open311.serviceDiscovery({
        cache: true,
        specification: 'http://wiki.open311.org/GeoReport_v2.1_Draft'
      }, function(err, data) {
        expect(open311.endpoint).to.equal('http://app.311.dc.gov/cwi/Open311/');
      });
      done();
    });

    it('when options.cache = true, it should set the production/test based on options.type', function(done) {
      open311.discovery = 'https://mayors24.cityofboston.gov/open311/discovery.json';
      request.get.callsArgWith(1, true, {statusCode: 200}, json);

      open311.serviceDiscovery({
        cache: true,
        type: 'test',
      }, function(err, data) {
        expect(open311.endpoint).to.equal('https://mayors24.cityofboston.gov:6443/open311/v2/');
      });
      done();
    });

  });

  describe('._get()', function() {
    var open311 = new Open311({
      endpoint: 'http://app.311.dc.gov/CWI/Open311/v2/',
      format: 'xml',
      jurisdiction: 'dc.gov'
    });

    beforeEach(function(done){
      sinon.stub(request, 'get');
      done();
    });

    afterEach(function(done){
      request.get.restore();
      done();
    });

    it('should should allow the `params` argument to be optional', function(done) {
      open311._get('services', function(err, body) {}); // shouldn't throw an exception
      done();
    });

    it('should correctly format the URL', function(done) {
      open311._get('services', {}, function(err, body) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/services.xml');
      done();
    });

    it('should set the jurisdiction_id parameter', function(done) {
      open311._get('services', {}, function(err, body) {});
      expect(request.get.firstCall.args[0].qs.jurisdiction_id).to.equal('dc.gov');
      done();
    });
  });

  describe('._post()', function() {
    var open311 = new Open311({
      endpoint: 'http://app.311.dc.gov/CWI/Open311/v2/',
      format: 'xml',
      jurisdiction: 'dc.gov'
    });

    beforeEach(function(done){
      sinon.stub(request, 'post');
      done();
    });

    afterEach(function(done){
      request.post.restore();
      done();
    });

    it('should should allow the `params` argument to be optional', function(done) {
      open311._post('services', {}, function(err, body) {}); // shouldn't throw an exception
      done();
    });

    it('should correctly format the URL', function(done) {
      open311._post('requests', {}, function(err, body) {});
      expect(request.post.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/requests.xml');
      done();
    });

    it('should set the jurisdiction_id parameter', function(done) {
      open311._post('requests', {}, function(err, body) {});
      expect(request.post.firstCall.args[0].qs.jurisdiction_id).to.equal('dc.gov');
      done();
    });
  });

  describe('.serviceList()', function() {
    var open311 = new Open311({
      endpoint: 'http://app.311.dc.gov/CWI/Open311/v2/',
      format: 'xml',
      jurisdiction: 'dc.gov'
    });

    beforeEach(function(done){
      sinon.stub(request, 'get');
      done();
    });

    afterEach(function(done){
      request.get.restore();
      done();
    });

    it('should correctly set the `/services` URL', function(done) {
      open311.serviceList(function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/services.xml');
      done();
    });

    it('should convert XML to json/object', function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/dc-services.xml', 'utf8');
      // Mock request.get to return the XML when called
      request.get.callsArgWith(1, true, {statusCode: 200}, xml);
      open311.serviceList(function(err, data) {
        expect(data).to.not.be.a('string');
        done();
      });
    });

    it('should cleanup nested XML lists', function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/dc-services.xml', 'utf8');
      // Mock request.get to return the XML when called
      request.get.callsArgWith(1, false, {statusCode: 200}, xml);
      open311.serviceList(function(err, data) {
        expect(data).to.be.an('array');
        done();
      });
    });

    it("should throw an error if the Endpoint isn't set", function(done) {
      var open311NoEndpoint = new Open311({});
      expect(
        function(){
          open311NoEndpoint.serviceList(function(err, data) {});
        }
      ).to.throw('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
      done();
    });
  });

  describe('.serviceDefinition()', function() {
    var open311 = new Open311({
      endpoint: 'http://app.311.dc.gov/CWI/Open311/v2/',
      format: 'xml',
      jurisdiction: 'dc.gov'
    });

    beforeEach(function(done){
      sinon.stub(request, 'get');
      done();
    });

    afterEach(function(done){
      request.get.restore();
      done();
    });

    it('should correctly set the `/services/:service_code` URL', function(done) {
      open311.serviceDefinition('S0301', function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/services/S0301.xml');
      done();
    });

    it('should convert XML to json/object', function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/dc-services-S0301.xml', 'utf8');
      // Mock request.get to return the XML when called
      request.get.callsArgWith(1, true, {statusCode: 200}, xml);
      open311.serviceDefinition('S0301', function(err, data) {
        expect(data).to.not.be.a('string');
        done();
      });
    });

    it('should cleanup nested XML wrapper', function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/dc-services-S0301.xml', 'utf8');
      // Mock request.get to return the XML when called
      request.get.callsArgWith(1, false, {statusCode: 200}, xml);
      open311.serviceDefinition('S0301', function(err, data) {
        should.exist(data.service_code);
        done();
      });
    });

    it('should cleanup nested XML `attributes array`', function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/dc-services-S0301.xml', 'utf8');
      // Mock request.get to return the XML when called
      request.get.callsArgWith(1, false, {statusCode: 200}, xml);
      open311.serviceDefinition('S0301', function(err, data) {
        expect(data.attributes).to.be.an('array');
        done();
      });
    });

    it('should cleanup nested XML `attributes[].values arrays`', function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/dc-services-S0301.xml', 'utf8');
      // Mock request.get to return the XML when called
      request.get.callsArgWith(1, false, {statusCode: 200}, xml);
      open311.serviceDefinition('S0301', function(err, data) {
        expect(data.attributes[1].values).to.be.an('array');
        done();
      });
    });

    it('should cleanup nested XML and set empty `attributes[].values` to null', function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/dc-services-S0301.xml', 'utf8');
      // Mock request.get to return the XML when called
      request.get.callsArgWith(1, false, {statusCode: 200}, xml);
      open311.serviceDefinition('S0301', function(err, data) {
        expect(data.attributes[0].values).to.be.a('null');
        done();
      });
    });

    it("should throw an error if the Endpoint isn't set", function(done) {
      var open311NoEndpoint = new Open311({});
      expect(
        function(){
          open311NoEndpoint.serviceDefinition('S0301', function(err, data) {});
        }
      ).to.throw('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
      done();
    });
  });

  describe('.submitRequest()', function() {
    var open311 = new Open311({
      endpoint: 'https://mayors24test.cityofboston.gov/open311/v2/',
      apiKey: 'API_KEY'
    });

    beforeEach(function(done){
      sinon.stub(request, 'post');
      done();
    });

    afterEach(function(done){
      request.post.restore();
      done();
    });

    it("should throw an error if the API key isn't set", function(done) {
      var open311NoApiKey = new Open311({
        endpoint: 'https://mayors24test.cityofboston.gov/open311/v2/'
      });
      expect(
        function(){
          open311NoApiKey.submitRequest({}, function(err, data) {});
        }
      ).to.throw('Submitting a Service Request requires an API Key');
      done();
    });

    it("should throw an error if the Endpoint isn't set", function(done) {
      var open311NoEndpoint = new Open311({});
      expect(
        function(){
          open311NoEndpoint.submitRequest({}, function(err, data) {});
        }
      ).to.throw('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
      done();
    });

    it("should attach this.apiKey to the form data as `api_key`", function(done) {
      open311.submitRequest({}, function(err, data) {});
      expect(request.post.firstCall.args[0].form.api_key).to.equal('API_KEY');
      done();

    });

    it("should parse attributes into the attribute[key]=value format", function(done) {
      open311.submitRequest({
        attributes: {
          license_plate: "A1234567",
          color: "blue"
        }
      }, function(err, data) {});
      expect(request.post.firstCall.args[0].form).to.contain.keys(['attribute[license_plate]', 'attribute[color]']);
      expect(request.post.firstCall.args[0].form['attribute[license_plate]']).to.equal("A1234567");
      expect(request.post.firstCall.args[0].form['attribute[color]']).to.equal('blue');

      done();

    });

    it("properly converts xml response (token) to json/object", function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/boston-submitrequest-token.xml', 'utf8');
      open311.format = 'xml';

      request.post.callsArgWith(1, false, {statusCode: 201}, xml);
      open311.submitRequest({}, function(err, data) {
        expect(JSON.stringify(data)).to.equal(JSON.stringify([{ token: '503fc045901932078800163c' }]));

        open311.format = 'json'; //cleanup
        done();
      });
    });
  });

  describe('.token()', function() {
    var open311 = new Open311({
      endpoint: 'http://app.311.dc.gov/CWI/Open311/v2/',
      format: 'xml',
      jurisdiction: 'dc.gov'
    });

    beforeEach(function(done){
      sinon.stub(request, 'get');
      done();
    });

    afterEach(function(done){
      request.get.restore();
      done();
    });

    it('should correctly set the `token/:token` URL', function(done) {
      open311.token('12345', function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/tokens/12345.xml');
      done();
    });

    it('should convert XML to json/object', function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/token.xml', 'utf8');
      // Mock request.get to return the XML when called
      request.get.callsArgWith(1, true, {statusCode: 200}, xml);
      open311.token('12345', function(err, data) {
        expect(data).to.not.be.a('string');
        done();
      });
    });

    it('should cleanup nested XML lists', function(done) {
      var xml = fs.readFileSync(__dirname + '/mocks/token.xml', 'utf8');
      // Mock request.get to return the XML when called
      request.get.callsArgWith(1, false, {statusCode: 200}, xml);
      open311.token('12345', function(err, data) {
        expect(data[0].token).to.equal(12345);
        expect(data[0].service_request_id).to.equal(638344);

        done();
      });
    });

    it("should throw an error if the Endpoint isn't set", function(done) {
      var open311NoEndpoint = new Open311({});
      expect(
        function(){
          open311NoEndpoint.token('12345', function(err, data) {});
        }
      ).to.throw('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
      done();
    });
  });

  describe('.serviceRequests()', function() {
    var open311 = new Open311({
      endpoint: 'http://app.311.dc.gov/CWI/Open311/v2/',
      format: 'xml',
      jurisdiction: 'dc.gov'
    });

    beforeEach(function(done){
      sinon.stub(request, 'get');
      done();
    });

    afterEach(function(done){
      request.get.restore();
      done();
    });

    it('should handle arguments of only callback (no id, no params)', function(done) {
      open311.serviceRequests(function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/requests.xml');
      done();
    });

    it('should handle arguments of only params & callback (no id)', function(done) {
      open311.serviceRequests({"extended_attributes": true}, function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/requests.xml');
      expect(request.get.firstCall.args[0].qs).to.contain.keys(['extended_attributes']);
      done();
    });

    it('should handle arguments of only string id & callback (no params)', function(done) {
      open311.serviceRequests('abcde', function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/requests/abcde.xml');
      done();
    });

    it('should handle arguments of only numeric id & callback (no params)', function(done) {
      open311.serviceRequests(12345, function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/requests/12345.xml');
      done();
    });

    it('should handle arguments of all string id, params & callback', function(done) {
      open311.serviceRequests('abcde', {"extended_attributes": true}, function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/requests/abcde.xml');
      expect(request.get.firstCall.args[0].qs).to.contain.keys(['extended_attributes']);
      done();
    });

    it('should handle arguments of all numeric id, params & callback', function(done) {
      open311.serviceRequests(12345, {"extended_attributes": true}, function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/requests/12345.xml');
      expect(request.get.firstCall.args[0].qs).to.contain.keys(['extended_attributes']);
      done();
    });

    it('should handle arguments of [service_request_ids] & callback (no params)', function(done) {
      open311.serviceRequests(['abcde', 12345], function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/requests.xml');
      expect(request.get.firstCall.args[0].qs).to.contain.keys(['service_request_id']);
      expect(request.get.firstCall.args[0].qs.service_request_id).to.equal('abcde,12345');
      done();
    });

    it('should handle arguments of [service_request_ids], params & callback', function(done) {
      open311.serviceRequests(['abcde', 12345], {"extended_attributes": true}, function(err, data) {});
      expect(request.get.firstCall.args[0].url).to.equal('http://app.311.dc.gov/CWI/Open311/v2/requests.xml');
      expect(request.get.firstCall.args[0].qs).to.contain.keys(['service_request_id', 'extended_attributes']);
      expect(request.get.firstCall.args[0].qs.service_request_id).to.equal('abcde,12345');
      done();
    });

    it("should throw an error if the Endpoint isn't set", function(done) {
      var open311NoEndpoint = new Open311({});
      expect(
        function(){
          open311NoEndpoint.serviceRequests(['abcde', 12345], {"extended_attributes": true}, function(err, data) {});
        }
      ).to.throw('You must set set an endpoint URL in your Open311({endpoint: "<URL>"}) object');
      done();
    });

    describe('cleaning of individual service requests', function() {
      var xml = fs.readFileSync(__dirname + '/mocks/service-requests.xml', 'utf8');

      it('should convert requested_datetime and updated_datetime to Date objects', function(done) {
        request.get.callsArgWith(1, false, {statusCode: 200}, xml);
        open311.serviceRequests(function(err, data) {
          expect(data[0].requested_datetime).to.be.instanceOf(Date);
          expect(data[0].updated_datetime).to.be.instanceOf(Date);
          done();
        });
      });
    });
  });

  describe('.serviceRequest()', function() {
    var open311 = new Open311({
      endpoint: 'http://app.311.dc.gov/CWI/Open311/v2/',
      format: 'xml',
      jurisdiction: 'dc.gov'
    });

    it('should be an alias of serviceRequests()', function(done) {
      expect(open311.serviceRequest).to.eql(open311.serviceRequests);
      done();
    });
  });
});
