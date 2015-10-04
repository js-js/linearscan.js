'use strict';

var App = require('./app');

var config = require('../../test/fixtures').options;

var app = new App({
  input: '#pipeline',
  reindexed: '#reindexed',
  intervals: '#output',
  allocate: '#allocate',
  config: config,
  initial: 'b0 {\n' +
           '  i0 = literal 0\n' +
           '  i1 = jump\n' +
           '}\n' +
           'b0 -> b1, b2\n' +
           'b1 {\n' +
           '  i2 = literal 1\n' +
           '  i3 = return i2\n' +
           '}\n' +
           'b2 {\n' +
           '  i4 = add i0, i0\n' +
           '  i5 = return i0\n' +
           '}'
});
