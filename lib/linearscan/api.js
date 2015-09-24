'use strict';

var linearscan = require('../linearscan');

exports.allocate = function allocate(pipeline, config) {
  var builder = linearscan.builder.create(pipeline, config);

  builder.build();

  for (var i = 0; i < config.groups.length; i++) {
    var allocator = linearscan.allocator.create(config, config.groups[i]);
    allocator.allocate();
  }

  var resolver = linearscan.resolver.create(config);
  resolver.resolve();

  return config.getOutput();
};
