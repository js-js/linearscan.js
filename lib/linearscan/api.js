'use strict';

var linearscan = require('../linearscan');

exports.allocate = function allocate(pipeline, config) {
  var builder = linearscan.builder.create(pipeline, config);

  builder.buildIntervals();

  var allocator = linearscan.allocator.create(config);
  allocator.allocate();

  var resolver = linearscan.resolver.create(config);
  resolver.resolve();

  return config.getOutput();
};
