var linearscan = require('../');
var pipeline = require('json-pipeline');

exports.fn2str = function fn2str(fn) {
  return fn.toString().replace(/^function[^{]+{\/\*|\*\/}$/g, '');
};

exports.createBuilder = function createBuilder(source) {
  var p = pipeline.create('dominance');

  p.parse(exports.fn2str(source), {
    cfg: true
  }, 'printable');

  return linearscan.builder.create(p);
};
