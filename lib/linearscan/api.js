'use strict';

var debug = require('debug')('linearscan');

var linearscan = require('../linearscan');

exports.allocate = function allocate(pipeline, config) {
  var builder = linearscan.builder.create(pipeline, config);

  debug('start building intervals');
  builder.build();
  debug('end building intervals');

  for (var i = 0; i < config.groups.length; i++) {
    debug('allocate group %j', config.groups[i]);
    var allocator = linearscan.allocator.create(config, config.groups[i]);
    allocator.allocate();
    debug('allocate group %j end', config.groups[i]);
  }

  debug('start resolving intervals');
  var resolver = linearscan.resolver.create(config);
  resolver.resolve();
  debug('start resolving intervals');

  return config.getOutput();
};
