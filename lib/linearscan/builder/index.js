'use strict';

function Builder(input) {
  this.input = input;
}
module.exports = Builder;

Builder.Interval = require('./interval');
Builder.Range = require('./range');
Builder.Use = require('./use');

Builder.prototype.create = function create(input) {
  return new Builder(input);
};

Builder.prototype.build = function build() {
};
